/**
 * Lecture des deux variables publiques, au même endroit pour tout le monde :
 * le middleware, le client serveur et l'injection vers le navigateur.
 *
 * Pas de `server-only` ici : le middleware s'exécute dans un contexte où
 * cette directive ne passe pas, et ces valeurs n'ont de toute façon rien
 * de secret — elles partent dans le navigateur par conception.
 */
export function envSupabase(): { url: string; cleAnon: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const cleAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !cleAnon) {
    const manquantes = [
      !url && 'NEXT_PUBLIC_SUPABASE_URL',
      !cleAnon && 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    ].filter(Boolean).join(' et ')

    throw new Error(
      `Configuration Supabase incomplète : ${manquantes} absente(s) de ` +
      `l'environnement du serveur. Renseigne-la dans les variables ` +
      `d'environnement du conteneur, ou dans app/.env.local en local.`,
    )
  }

  return { url, cleAnon }
}
