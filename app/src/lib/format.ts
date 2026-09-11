/**
 * Tout est daté et affiché à l'heure de Paris, explicitement.
 *
 * Les pages sont rendues côté serveur, dans un conteneur qui tourne en UTC :
 * sans ce fuseau imposé, un RDV de 10 h 30 s'affichait 8 h 30. Le fixer ici
 * plutôt que via la variable TZ du conteneur rend le rendu identique côté
 * serveur et côté navigateur — donc insensible à la configuration de
 * l'hébergeur, et sans écart d'hydratation.
 */
export const FUSEAU = 'Europe/Paris'

const EUR = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

export function euros(n: number | null | undefined) {
  if (n === null || n === undefined) return '—'
  return EUR.format(n)
}

export function pct(num: number, denom: number) {
  if (!denom) return '—'
  return `${Math.round((num / denom) * 1000) / 10} %`
}

export function jour(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', {
    timeZone: FUSEAU, day: '2-digit', month: 'short', year: 'numeric',
  })
}

export function heure(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('fr-FR', {
    timeZone: FUSEAU, hour: '2-digit', minute: '2-digit',
  })
}

/**
 * « sept. 2025 » à partir d'une clé « 2025-09 ». Mois calendaire et non
 * instant : construit et rendu en UTC, sinon le premier du mois pourrait
 * basculer sur le mois précédent selon le fuseau du serveur.
 */
export function mois(cle: string) {
  const [annee, m] = cle.split('-').map(Number)
  return new Date(Date.UTC(annee, m - 1, 1)).toLocaleDateString('fr-FR', {
    timeZone: 'UTC', month: 'short', year: 'numeric',
  })
}

/**
 * Jour civil à Paris au format « YYYY-MM-DD », comparable aux colonnes `date`
 * de Postgres. Passe par Intl et non par getDate() : ce dernier répondrait
 * selon le fuseau du serveur, donc la veille entre minuit et 2 h.
 */
export function jourIso(d: Date | string = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSEAU, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(typeof d === 'string' ? new Date(d) : d)
}

/** Mois civil à Paris, « YYYY-MM ». */
export function moisIso(d: Date | string = new Date()) {
  return jourIso(d).slice(0, 7)
}

/**
 * Convertit une saisie `datetime-local` (« 2026-09-07T14:30 », sans fuseau)
 * en instant ISO, en la lisant comme une heure de Paris.
 *
 * `new Date(saisie)` la lisait dans le fuseau de l'exécutant : côté serveur,
 * en UTC, un RDV posé à 14 h 30 était enregistré à 16 h 30 heure de Paris.
 */
export function instantDepuisSaisieParis(saisie: string): string {
  // Lue d'abord comme si elle était en UTC, puis ramenée du décalage parisien
  // de ce moment-là — ce qui gère l'été comme l'hiver.
  const approximation = new Date(`${saisie.length === 16 ? saisie : saisie.slice(0, 16)}:00Z`)
  return new Date(approximation.getTime() - decalageParis(approximation)).toISOString()
}

/** Instant ISO → « 2026-09-07T14:30 », heure de Paris, pour un champ de saisie. */
export function saisieDepuisInstant(iso: string): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSEAU, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso))
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? '00'
  return `${v('year')}-${v('month')}-${v('day')}T${v('hour')}:${v('minute')}`
}

/** Décalage de Paris par rapport à UTC à cet instant, en millisecondes. */
function decalageParis(instant: Date) {
  const enUtc = new Date(instant.toLocaleString('en-US', { timeZone: 'UTC' }))
  const aParis = new Date(instant.toLocaleString('en-US', { timeZone: FUSEAU }))
  return aParis.getTime() - enUtc.getTime()
}

/**
 * Bornes du jour civil parisien contenant `d`.
 *
 * `setHours(0,0,0,0)` donnait minuit dans le fuseau du serveur : sur un
 * conteneur en UTC, la journée affichée courait de 2 h du matin à 2 h du
 * matin, ratant les RDV de fin de soirée et récupérant ceux de la veille.
 */
export function bornesDuJour(d = new Date()) {
  const minuitUtc = new Date(`${jourIso(d)}T00:00:00Z`)
  const debut = new Date(minuitUtc.getTime() - decalageParis(minuitUtc))
  return { debut, fin: new Date(debut.getTime() + 86_400_000 - 1) }
}

export function jourHeure(iso: string | null | undefined) {
  if (!iso) return '—'
  return `${jour(iso)} à ${heure(iso)}`
}

/** « il y a 3 jours », « dans 2 h » — pour les relances et la timeline. */
export function relatif(iso: string | null | undefined) {
  if (!iso) return '—'
  const diff = new Date(iso).getTime() - Date.now()
  const abs = Math.abs(diff)
  const rtf = new Intl.RelativeTimeFormat('fr-FR', { numeric: 'auto' })
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000000], ['month', 2592000000], ['day', 86400000],
    ['hour', 3600000], ['minute', 60000],
  ]
  for (const [unit, ms] of units) {
    if (abs >= ms) return rtf.format(Math.round(diff / ms), unit)
  }
  return "à l'instant"
}

export function enRetard(iso: string | null | undefined) {
  return !!iso && new Date(iso).getTime() < Date.now()
}

export function estAujourdhui(iso: string | null | undefined) {
  if (!iso) return false
  return jourIso(iso) === jourIso()
}

export function nomContact(c: { full_name: string } | null | undefined) {
  return c?.full_name?.trim() || '—'
}

export function initiales(nom: string) {
  return nom.split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]?.toUpperCase() ?? '').join('')
}

export function dureeJours(secondes: number | null | undefined) {
  if (secondes === null || secondes === undefined) return '—'
  const j = secondes / 86400
  if (j < 1) return `${Math.round(secondes / 3600)} h`
  return `${Math.round(j)} j`
}

export const LIBELLE_ACTIVITE: Record<string, string> = {
  appel: 'Appel',
  dm_linkedin: 'DM LinkedIn',
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  email: 'Email',
  note: 'Note',
}

export const LIBELLE_RDV: Record<string, string> = {
  setting: 'Setting',
  closing: 'Closing',
  suivi: 'Suivi',
}

export const LIBELLE_STATUT_RDV: Record<string, string> = {
  planifie: 'Planifié',
  honore: 'Honoré',
  no_show: 'No-show',
  replanifie: 'Replanifié',
  annule: 'Annulé',
}

export const LIBELLE_ICP: Record<string, string> = {
  inconnu: 'ICP inconnu',
  icp: 'ICP validé',
  hors_icp: 'Hors ICP',
}

export const LIBELLE_PLAN: Record<string, string> = {
  '1x': 'One shot',
  '2x': '2 fois',
  '3x': '3 fois',
  '4x': '4 fois',
  '5x': '5 fois',
  '6x': '6 fois',
  '7x': '7 fois',
  '8x': '8 fois',
  '9x': '9 fois',
  '10x': '10 fois',
  autre: 'Autre',
}

export const LIBELLE_PROCESSEUR: Record<string, string> = {
  mollie: 'Mollie',
  stripe: 'Stripe',
  virement: 'Virement',
  especes: 'Espèces',
  autre: 'Autre',
}

export const LIBELLE_ENTITE: Record<string, string> = {
  auto: 'Auto-entreprise',
  sasu: 'SASU',
}
