import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/database.types'

export type Identite = { id: string; email: string }

/**
 * Identité de l'appelant, lue depuis le jeton.
 *
 * `getClaims()` et non `getUser()` : les jetons du projet sont signés en ES256,
 * la signature se vérifie donc localement avec la clé publique (mise en cache)
 * au lieu d'un aller-retour vers le serveur d'authentification. Sur ce réseau,
 * un aller-retour Supabase coûte ~200 ms — et `getUser()` était appelé dans le
 * middleware, dans le layout puis dans chaque page.
 *
 * `cache()` déduplique l'appel sur toute la durée d'une requête : le layout et
 * la page partagent le même résultat.
 */
export const identiteCourante = cache(async (): Promise<Identite | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()

  const claims = data?.claims
  if (error || !claims?.sub) return null

  return { id: claims.sub, email: typeof claims.email === 'string' ? claims.email : '' }
})

/**
 * Profil complet — nécessaire dès qu'on a besoin du rôle ou du nom.
 * Un seul aller-retour par requête, partagé entre le layout et la page.
 */
export const profilCourant = cache(async (): Promise<Profile> => {
  const identite = await identiteCourante()
  if (!identite) redirect('/login')

  const supabase = await createClient()
  const { data: profil } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', identite.id)
    .single()

  if (!profil) redirect('/login')
  if (!profil.is_active) redirect('/desactive')

  return profil as Profile
})

/**
 * Identité garantie, sans charger le profil. À préférer quand la page n'a
 * besoin que de l'identifiant pour filtrer : ses requêtes peuvent alors partir
 * en parallèle du chargement du profil fait par le layout.
 *
 * La désactivation d'un compte reste bloquée : le layout appelle
 * `profilCourant()` et redirige, et surtout la RLS ne renvoie plus rien.
 */
export async function exigerIdentite(): Promise<Identite> {
  const identite = await identiteCourante()
  if (!identite) redirect('/login')
  return identite
}

/** Garde des actions réservées à l'admin. Ne jamais s'en remettre à l'UI seule. */
export async function exigerAdmin(): Promise<Profile> {
  const profil = await profilCourant()
  if (profil.role !== 'admin') {
    throw new Error("Action réservée à l'administrateur.")
  }
  return profil
}
