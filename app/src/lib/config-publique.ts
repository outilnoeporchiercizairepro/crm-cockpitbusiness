import 'server-only'
import { envSupabase } from '@/lib/env-supabase'

export type ConfigPublique = {
  url: string
  cleAnon: string
}

/**
 * Configuration Supabase destinée au navigateur.
 *
 * Lue à CHAQUE démarrage du serveur, pas au moment du build. Next inscrit
 * normalement les variables NEXT_PUBLIC_* dans le bundle au build : il faut
 * alors les fournir en argument de construction, et une image compilée sans
 * elles part en production avec « undefined » à l'intérieur, sans que rien
 * ne le signale avant la première connexion.
 *
 * Ici, le serveur les injecte dans la page à l'exécution. Une même image
 * fonctionne donc dans n'importe quel environnement, et il n'y a plus qu'un
 * seul endroit où renseigner ces valeurs : les variables d'environnement.
 */
export function configPublique(): ConfigPublique {
  return envSupabase()
}
