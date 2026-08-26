'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { exigerIdentite } from '@/lib/session'
import type { PaymentPlan, LegalEntity } from '@/lib/database.types'
import { NOMBRE_ECHEANCES, repartirEcheances } from '@/lib/echeances'

export type Resultat = { ok: true } | { ok: false; erreur: string }

function echec(e: { message: string } | null, defaut: string): Resultat {
  if (!e) return { ok: true }
  if (e.message.includes('row-level security') || e.message.includes('42501')) {
    return { ok: false, erreur: "Tu n'as pas les droits sur cette opportunité." }
  }
  if (e.message.includes('entite_impose_processeur')) {
    return { ok: false, erreur: 'SASU va avec Stripe, auto-entreprise avec Mollie.' }
  }
  return { ok: false, erreur: e.message || defaut }
}

/** L'entité juridique impose le processeur — la base l'exige aussi. */
const PROCESSEUR: Record<LegalEntity, 'stripe' | 'mollie'> = {
  sasu: 'stripe',
  auto: 'mollie',
}

async function marquerRdvHonore(rdvId: string) {
  const supabase = await createClient()
  // Le trigger de relances automatiques se déclenche sur ce passage.
  await supabase.from('appointments').update({ status: 'honore' }).eq('id', rdvId)
}

function revalider(opportuniteId: string) {
  revalidatePath('/')
  revalidatePath('/pipeline')
  revalidatePath('/contacts')
  revalidatePath('/dashboard')
  revalidatePath(`/opportunites/${opportuniteId}`)
}

/* --------------------------------------------------------------- closé */

export type SaisieClosing = {
  montantHt: string
  montantTtc: string
  plan: PaymentPlan
  entite: LegalEntity
  commissionSetter: string
}
export async function cloturerGagne(
  opportuniteId: string,
  saisie: SaisieClosing,
  rdvId?: string | null,
): Promise<Resultat> {
  await exigerIdentite()
  const supabase = await createClient()

  const ht = Number(saisie.montantHt)
  if (!saisie.montantHt.trim() || Number.isNaN(ht) || ht <= 0) {
    return { ok: false, erreur: 'Indique un montant HT valide.' }
  }

  const ttcBrut = saisie.montantTtc.trim()
  const ttc = ttcBrut ? Number(ttcBrut) : ht
  if (Number.isNaN(ttc) || ttc < ht) {
    return { ok: false, erreur: 'Le montant TTC ne peut pas être inférieur au HT.' }
  }

  const pctBrut = saisie.commissionSetter.trim()
  const pct = pctBrut ? Number(pctBrut) : null
  if (pct !== null && (Number.isNaN(pct) || pct < 0 || pct > 100)) {
    return { ok: false, erreur: 'La commission du setter doit être un pourcentage entre 0 et 100.' }
  }

  const { data: etape } = await supabase
    .from('pipeline_stages').select('id').eq('is_won', true).limit(1).maybeSingle()
  if (!etape) return { ok: false, erreur: 'Aucune étape « gagnée » configurée.' }

  const { error } = await supabase
    .from('opportunities')
    .update({
      stage_id: etape.id,
      // amount_signed reste la référence du dashboard : c'est le HT.
      amount_signed: ht,
      amount_ht: ht,
      amount_ttc: ttc,
      payment_plan: saisie.plan,
      legal_entity: saisie.entite,
      payment_processor: PROCESSEUR[saisie.entite],
      setter_commission_pct: pct,
    })
    .eq('id', opportuniteId)

  if (error) return echec(error, 'Impossible de marquer gagnée.')

  // Échéancier : une ligne par versement, mensuelle à partir d'aujourd'hui.
  // On repart de zéro pour que reclôturer une affaire ne cumule pas deux
  // échéanciers.
  await supabase.from('payments').delete().eq('opportunity_id', opportuniteId)

  const nombre = NOMBRE_ECHEANCES[saisie.plan] ?? 1
  const parts = repartirEcheances(ttc, nombre)
  const depart = new Date()

  const echeances = parts.map((montant, i) => {
    const echeance = new Date(depart)
    echeance.setMonth(echeance.getMonth() + i)
    return {
      opportunity_id: opportuniteId,
      installment_no: i + 1,
      due_date: echeance.toISOString().slice(0, 10),
      amount_expected: montant,
      status: 'attendu' as const,
      processor: PROCESSEUR[saisie.entite],
      legal_entity: saisie.entite,
    }
  })

  const { error: eEcheances } = await supabase.from('payments').insert(echeances)
  if (eEcheances) {
    return {
      ok: false,
      erreur: `Affaire enregistrée comme gagnée, mais l'échéancier n'a pas pu être créé : ${eEcheances.message}`,
    }
  }

  // Le rendez-vous n'existe que si le closing part de « Ma journée ».
  if (rdvId) await marquerRdvHonore(rdvId)

  revalider(opportuniteId)
  return { ok: true }
}

/* --------------------------------------------------------------- perdu */

export async function cloturerPerdu(
  rdvId: string,
  opportuniteId: string,
  motifId: string,
): Promise<Resultat> {
  await exigerIdentite()
  const supabase = await createClient()

  if (!motifId) return { ok: false, erreur: 'Choisis un motif de perte.' }

  const { data: etape } = await supabase
    .from('pipeline_stages').select('id').eq('is_lost', true).order('position').limit(1).maybeSingle()
  if (!etape) return { ok: false, erreur: 'Aucune étape « perdue » configurée.' }

  // Motif d'abord dans le même update : le trigger le lit sur la ligne.
  const { error } = await supabase
    .from('opportunities')
    .update({ lost_reason_id: motifId, stage_id: etape.id })
    .eq('id', opportuniteId)

  if (error) return echec(error, 'Impossible de marquer perdue.')

  await marquerRdvHonore(rdvId)
  revalider(opportuniteId)
  return { ok: true }
}

/* ---------------------------------------------------------- en attente */

export async function cloturerEnAttente(
  rdvId: string,
  opportuniteId: string,
  contactId: string,
  relance: { motif: string; contenu: string; quand: string },
): Promise<Resultat> {
  const profil = await exigerIdentite()
  const supabase = await createClient()

  if (!relance.motif.trim()) return { ok: false, erreur: 'Indique le motif de la relance.' }
  if (!relance.quand) return { ok: false, erreur: 'Indique la date de relance.' }

  // Marqué honoré en premier : le trigger pose les relances J+2 et J+5,
  // celle saisie ici s'y ajoute sans les remplacer.
  await marquerRdvHonore(rdvId)

  const { error } = await supabase.from('tasks').insert({
    opportunity_id: opportuniteId,
    contact_id: contactId,
    title: relance.motif.trim(),
    details: relance.contenu.trim() || null,
    due_at: new Date(relance.quand).toISOString(),
    assignee_id: profil.id,
    created_by: profil.id,
  })

  if (error) return echec(error, 'Impossible de créer la relance.')

  revalider(opportuniteId)
  return { ok: true }
}

/* ------------------------------------------------------------- no-show */

export async function marquerNoShow(rdvId: string, opportuniteId: string): Promise<Resultat> {
  await exigerIdentite()
  const supabase = await createClient()

  const { error } = await supabase.from('appointments').update({ status: 'no_show' }).eq('id', rdvId)
  if (error) return echec(error, 'Impossible de marquer le no-show.')

  revalider(opportuniteId)
  return { ok: true }
}

/* ---------------------------------------------------------- encaissements */

export async function basculerEncaissement(
  paiementId: string,
  encaisse: boolean,
): Promise<Resultat> {
  await exigerIdentite()
  const supabase = await createClient()

  const { data: ligne } = await supabase
    .from('payments')
    .select('opportunity_id, amount_expected')
    .eq('id', paiementId)
    .maybeSingle()

  if (!ligne) return { ok: false, erreur: 'Échéance introuvable.' }

  const { error } = await supabase
    .from('payments')
    .update(
      encaisse
        ? {
            status: 'encaisse',
            amount_received: ligne.amount_expected,
            received_at: new Date().toISOString(),
          }
        : { status: 'attendu', amount_received: null, received_at: null },
    )
    .eq('id', paiementId)

  if (error) return echec(error, 'Mise à jour impossible.')

  revalider(ligne.opportunity_id)
  return { ok: true }
}
