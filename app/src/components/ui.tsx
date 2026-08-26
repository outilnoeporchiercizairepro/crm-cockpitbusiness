import Link from 'next/link'

export function Badge({
  children,
  ton = 'neutre',
  className = '',
}: {
  children: React.ReactNode
  ton?: 'neutre' | 'altitude' | 'succes' | 'alerte' | 'danger' | 'violet'
  className?: string
}) {
  const tons = {
    neutre: 'bg-surface-2 text-texte-doux',
    altitude: 'bg-altitude/12 text-altitude',
    succes: 'bg-succes/12 text-succes',
    alerte: 'bg-alerte/12 text-alerte',
    danger: 'bg-danger/12 text-danger',
    violet: 'bg-violet/12 text-violet',
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${tons[ton]} ${className}`}>
      {children}
    </span>
  )
}

export function Carte({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-xl border border-bordure bg-surface ${className}`}>{children}</div>
  )
}

export function EnTetePage({
  titre,
  sous,
  action,
}: {
  titre: string
  sous?: string
  action?: React.ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{titre}</h1>
        {sous && <p className="mt-1 text-sm text-texte-doux">{sous}</p>}
      </div>
      {action}
    </div>
  )
}

export function Vide({
  titre,
  sous,
  action,
}: {
  titre: string
  sous?: string
  action?: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-dashed border-bordure px-6 py-12 text-center">
      <p className="text-sm font-medium text-texte-doux">{titre}</p>
      {sous && <p className="mx-auto mt-1.5 max-w-md text-sm text-texte-faible">{sous}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Stat({
  label,
  valeur,
  detail,
  ton,
}: {
  label: string
  valeur: string
  detail?: string
  ton?: 'succes' | 'alerte' | 'danger'
}) {
  const couleur = ton === 'succes' ? 'text-succes' : ton === 'alerte' ? 'text-alerte' : ton === 'danger' ? 'text-danger' : 'text-texte'
  return (
    <Carte className="p-4">
      <p className="text-xs text-texte-faible">{label}</p>
      <p className={`mt-1.5 text-2xl font-semibold tabular-nums tracking-tight ${couleur}`}>{valeur}</p>
      {detail && <p className="mt-1 text-xs text-texte-faible">{detail}</p>}
    </Carte>
  )
}

export function LienOpportunite({
  id,
  children,
  className = '',
}: {
  id: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <Link href={`/opportunites/${id}`} className={`transition hover:text-altitude ${className}`}>
      {children}
    </Link>
  )
}

const champBase =
  'rounded-lg border border-bordure bg-surface-2 px-3 py-2 text-sm outline-none transition placeholder:text-texte-faible focus:border-altitude focus:ring-2 focus:ring-altitude/25'

/** Champ de formulaire, pleine largeur. */
export const styleChamp = `w-full ${champBase}`

/**
 * Champ de filtre, largeur intrinsèque. Style distinct plutôt que
 * `styleChamp w-auto` : les deux classes ont la même spécificité, c'est
 * l'ordre dans la feuille générée qui trancherait — pas celui de la chaîne.
 */
export const styleChampInline = champBase

export const styleBouton =
  'rounded-lg bg-altitude px-3.5 py-2 text-sm font-medium text-white transition hover:bg-altitude-sombre disabled:opacity-50'

export const styleBoutonDoux =
  'rounded-lg border border-bordure bg-surface-2 px-3.5 py-2 text-sm text-texte-doux transition hover:border-bordure-forte hover:text-texte disabled:opacity-50'
