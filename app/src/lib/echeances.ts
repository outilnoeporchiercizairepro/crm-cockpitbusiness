import type { PaymentPlan } from '@/lib/database.types'

export const NOMBRE_ECHEANCES: Record<PaymentPlan, number> = {
  '1x': 1,
  '2x': 2,
  '3x': 3,
  '4x': 4,
  autre: 1,
}

/**
 * Répartit un montant en N mensualités. Les centimes perdus à l'arrondi sont
 * réinjectés dans la dernière échéance : la somme des versements égale
 * toujours le montant dû, au centime près.
 *
 * Partagé entre l'aperçu affiché dans la modale et l'écriture en base — deux
 * implémentations séparées finiraient par diverger d'un centime.
 */
export function repartirEcheances(montant: number, nombre: number): number[] {
  if (nombre <= 1) return [Math.round(montant * 100) / 100]
  const base = Math.floor((montant / nombre) * 100) / 100
  return [
    ...Array.from({ length: nombre - 1 }, () => base),
    Math.round((montant - base * (nombre - 1)) * 100) / 100,
  ]
}
