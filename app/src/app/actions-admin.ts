'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { exigerAdmin } from '@/lib/session'
import type { UserRole } from '@/lib/database.types'

export type Resultat = { ok: true; message?: string } | { ok: false; erreur: string }

const MDP_MIN = 10

function messageErreur(e: unknown, defaut: string): string {
  const m = e instanceof Error ? e.message : String(e)
  if (m.includes('SUPABASE_SECRET_KEY')) return m
  if (m.includes('already been registered') || m.includes('already exists')) {
    return 'Un compte existe déjà avec cette adresse.'
  }
  if (m.includes('Password should be')) {
    return `Mot de passe trop court (${MDP_MIN} caractères minimum).`
  }
  return m || defaut
}

/** Bannissement « pour toujours » : 100 ans. L'API n'accepte qu'une durée. */
const BANNISSEMENT = '876000h'

/* ------------------------------------------------------------- création */

export async function creerUtilisateur(form: FormData): Promise<Resultat> {
  try {
    await exigerAdmin()

    const email = String(form.get('email') ?? '').trim().toLowerCase()
    const nom = String(form.get('full_name') ?? '').trim()
    const role = String(form.get('role') ?? 'setter') as UserRole
    const mdp = String(form.get('password') ?? '')

    if (!email) return { ok: false, erreur: "L'adresse e-mail est obligatoire." }
    if (!nom) return { ok: false, erreur: 'Le nom est obligatoire.' }
    if (mdp.length < MDP_MIN) {
      return { ok: false, erreur: `Mot de passe trop court (${MDP_MIN} caractères minimum).` }
    }
    if (!['admin', 'setter', 'closer'].includes(role)) {
      return { ok: false, erreur: 'Rôle invalide.' }
    }

    const admin = createAdminClient()

    // email_confirm: le compte est utilisable tout de suite, sans e-mail de
    // confirmation — le SMTP par défaut de Supabase est plafonné.
    const { error } = await admin.auth.admin.createUser({
      email,
      password: mdp,
      email_confirm: true,
      user_metadata: { full_name: nom, role },
    })

    if (error) return { ok: false, erreur: messageErreur(error, 'Création impossible.') }

    revalidatePath('/admin')
    return { ok: true, message: `Compte créé pour ${nom}. Transmets-lui le mot de passe de vive voix.` }
  } catch (e) {
    return { ok: false, erreur: messageErreur(e, 'Création impossible.') }
  }
}

/* -------------------------------------------------------- mot de passe */

export async function definirMotDePasse(userId: string, mdp: string): Promise<Resultat> {
  try {
    await exigerAdmin()

    if (mdp.length < MDP_MIN) {
      return { ok: false, erreur: `Mot de passe trop court (${MDP_MIN} caractères minimum).` }
    }

    const admin = createAdminClient()
    const { error } = await admin.auth.admin.updateUserById(userId, { password: mdp })

    if (error) return { ok: false, erreur: messageErreur(error, 'Changement impossible.') }
    return { ok: true, message: 'Mot de passe remplacé.' }
  } catch (e) {
    return { ok: false, erreur: messageErreur(e, 'Changement impossible.') }
  }
}

/* ------------------------------------------------------------- activation */

export async function definirActif(userId: string, actif: boolean): Promise<Resultat> {
  try {
    const moi = await exigerAdmin()
    if (userId === moi.id) {
      return { ok: false, erreur: 'Tu ne peux pas désactiver ton propre compte.' }
    }

    const admin = createAdminClient()

    // Deux verrous complémentaires : le drapeau coupe l'accès aux données via
    // la RLS, le bannissement empêche même l'obtention d'un jeton.
    const { error: eProfil } = await admin
      .from('profiles')
      .update({ is_active: actif })
      .eq('id', userId)

    if (eProfil) return { ok: false, erreur: messageErreur(eProfil, 'Mise à jour impossible.') }

    const { error: eAuth } = await admin.auth.admin.updateUserById(userId, {
      ban_duration: actif ? 'none' : BANNISSEMENT,
    })

    if (eAuth) {
      return {
        ok: false,
        erreur: `Accès aux données ${actif ? 'rétabli' : 'coupé'}, mais la session n'a pas pu être ${actif ? 'débloquée' : 'révoquée'} : ${eAuth.message}`,
      }
    }

    revalidatePath('/admin')
    return { ok: true, message: actif ? 'Compte réactivé.' : 'Compte désactivé.' }
  } catch (e) {
    return { ok: false, erreur: messageErreur(e, 'Mise à jour impossible.') }
  }
}

/* ------------------------------------------------------------------ rôle */

export async function majRole(userId: string, role: UserRole): Promise<Resultat> {
  try {
    const moi = await exigerAdmin()
    if (userId === moi.id) {
      return { ok: false, erreur: 'Tu ne peux pas changer ton propre rôle.' }
    }
    if (!['admin', 'setter', 'closer'].includes(role)) {
      return { ok: false, erreur: 'Rôle invalide.' }
    }

    const supabase = await createClient()
    const { error } = await supabase.from('profiles').update({ role }).eq('id', userId)

    if (error) return { ok: false, erreur: messageErreur(error, 'Changement de rôle impossible.') }

    revalidatePath('/admin')
    return { ok: true }
  } catch (e) {
    return { ok: false, erreur: messageErreur(e, 'Changement de rôle impossible.') }
  }
}

/* ------------------------------------------------------------ suppression */

export async function supprimerUtilisateur(userId: string): Promise<Resultat> {
  try {
    const moi = await exigerAdmin()
    if (userId === moi.id) {
      return { ok: false, erreur: 'Tu ne peux pas supprimer ton propre compte.' }
    }

    const admin = createAdminClient()

    // activities.author_id est en `on delete restrict` : un utilisateur qui a
    // loggé quoi que ce soit ne peut pas disparaître sans emporter le journal.
    const { count } = await admin
      .from('activities')
      .select('id', { count: 'exact', head: true })
      .eq('author_id', userId)

    if (count && count > 0) {
      return {
        ok: false,
        erreur: `Impossible : ${count} activité(s) sont signées par ce compte. Le journal doit rester intact — désactive-le plutôt.`,
      }
    }

    const { error } = await admin.auth.admin.deleteUser(userId)
    if (error) return { ok: false, erreur: messageErreur(error, 'Suppression impossible.') }

    revalidatePath('/admin')
    return { ok: true, message: 'Compte supprimé.' }
  } catch (e) {
    return { ok: false, erreur: messageErreur(e, 'Suppression impossible.') }
  }
}

/* -------------------------------------------------- règles de relance */

export async function majRegleRelance(
  id: string,
  champs: { label?: string; delai_jours?: number; is_active?: boolean },
): Promise<Resultat> {
  try {
    await exigerAdmin()
    if (champs.delai_jours !== undefined && (!Number.isInteger(champs.delai_jours) || champs.delai_jours < 1)) {
      return { ok: false, erreur: 'Le délai doit être un nombre de jours supérieur à zéro.' }
    }

    const supabase = await createClient()
    const { error } = await supabase.from('relance_rules').update(champs).eq('id', id)
    if (error) return { ok: false, erreur: messageErreur(error, 'Modification impossible.') }

    revalidatePath('/admin')
    return { ok: true }
  } catch (e) {
    return { ok: false, erreur: messageErreur(e, 'Modification impossible.') }
  }
}

export async function creerRegleRelance(label: string, delaiJours: number): Promise<Resultat> {
  try {
    await exigerAdmin()
    if (!label.trim()) return { ok: false, erreur: 'Donne un libellé à la relance.' }
    if (!Number.isInteger(delaiJours) || delaiJours < 1) {
      return { ok: false, erreur: 'Le délai doit être un nombre de jours supérieur à zéro.' }
    }

    const supabase = await createClient()
    const { error } = await supabase
      .from('relance_rules')
      .insert({ label: label.trim(), delai_jours: delaiJours, position: delaiJours })
    if (error) return { ok: false, erreur: messageErreur(error, 'Création impossible.') }

    revalidatePath('/admin')
    return { ok: true }
  } catch (e) {
    return { ok: false, erreur: messageErreur(e, 'Création impossible.') }
  }
}

export async function supprimerRegleRelance(id: string): Promise<Resultat> {
  try {
    await exigerAdmin()
    const supabase = await createClient()
    const { error } = await supabase.from('relance_rules').delete().eq('id', id)
    if (error) return { ok: false, erreur: messageErreur(error, 'Suppression impossible.') }

    revalidatePath('/admin')
    return { ok: true }
  } catch (e) {
    return { ok: false, erreur: messageErreur(e, 'Suppression impossible.') }
  }
}
