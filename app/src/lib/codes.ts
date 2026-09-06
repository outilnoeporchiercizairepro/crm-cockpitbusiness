/**
 * Normalise un code de correspondance (`sources.key`, `lost_reasons.key`).
 *
 * Ces codes voyagent dans les webhooks n8n (`p_source`) et les colonnes de
 * CSV importés : on tolère la casse et les accents à la saisie, mais ce qui
 * est stocké reste strictement comparable à ce qu'enverra l'extérieur.
 *
 * Module à part plutôt que dans `actions.ts` : un fichier `'use server'` ne
 * peut exporter que des fonctions asynchrones, et l'écran d'admin en a besoin
 * côté navigateur pour montrer le code avant de l'enregistrer.
 */
export function normaliserCle(brut: string) {
  return brut
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}
