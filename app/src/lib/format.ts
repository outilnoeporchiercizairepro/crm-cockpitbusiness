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
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function heure(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
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
  const d = new Date(iso)
  const n = new Date()
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()
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
