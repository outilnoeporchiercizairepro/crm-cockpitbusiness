import { Badge } from '@/components/ui'
import type { TonSource } from '@/lib/database.types'

/**
 * Étiquette de provenance d'un lead. La couleur vient de l'admin : c'est ce
 * qui permet de reconnaître d'où vient une affaire sans lire le libellé.
 *
 * Composant unique plutôt qu'un Badge recopié à cinq endroits : la source
 * doit s'afficher partout de la même façon, et un ton par défaut divergent
 * suffirait à casser la lecture au coup d'œil.
 */
export function EtiquetteSource({
  label,
  ton = 'neutre',
  vide,
  className = '',
}: {
  label: string | null | undefined
  ton?: TonSource | null
  /** Rendu quand la source est absente. Rien par défaut. */
  vide?: React.ReactNode
  className?: string
}) {
  if (!label) return <>{vide ?? null}</>
  return <Badge ton={ton ?? 'neutre'} className={className}>{label}</Badge>
}
