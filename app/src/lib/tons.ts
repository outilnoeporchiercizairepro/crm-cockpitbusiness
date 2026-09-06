import type { TonSource } from '@/lib/database.types'

/**
 * Palette des étiquettes, partagée par les sources et les étapes du pipeline.
 *
 * Fermée et nommée plutôt qu'hexadécimale : les valeurs sont des variables de
 * thème, donc une étiquette reste lisible en sombre comme en clair. Un code
 * couleur libre finirait par produire du gris sur gris sur l'un des deux.
 */
export const TONS: { ton: TonSource; nom: string }[] = [
  { ton: 'neutre', nom: 'Gris' },
  { ton: 'altitude', nom: 'Bleu' },
  { ton: 'succes', nom: 'Vert' },
  { ton: 'alerte', nom: 'Orange' },
  { ton: 'danger', nom: 'Rouge' },
  { ton: 'violet', nom: 'Violet' },
]

/** Aplat plein — pastilles de l'admin et puce de colonne du kanban. */
export const FOND_TON: Record<TonSource, string> = {
  neutre: 'bg-texte-faible',
  altitude: 'bg-altitude',
  succes: 'bg-succes',
  alerte: 'bg-alerte',
  danger: 'bg-danger',
  violet: 'bg-violet',
}

/** Bordure assortie, pour la pastille cliquable du sélecteur. */
export const BORDURE_TON: Record<TonSource, string> = {
  neutre: 'border-bordure-forte',
  altitude: 'border-altitude/40',
  succes: 'border-succes/40',
  alerte: 'border-alerte/40',
  danger: 'border-danger/40',
  violet: 'border-violet/40',
}
