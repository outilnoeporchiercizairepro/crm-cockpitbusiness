'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/lib/database.types'
import { CLE_GLOBALE } from '@/lib/cle-globale'

type ConfigInjectee = { url: string; cleAnon: string }

function lireConfig(): ConfigInjectee {
  // Injectée par le serveur au rendu de la page : la même image fonctionne
  // dans tous les environnements sans être reconstruite.
  const injectee = (window as unknown as Record<string, ConfigInjectee | undefined>)[CLE_GLOBALE]
  if (injectee?.url && injectee?.cleAnon) return injectee

  // Repli sur les valeurs inscrites au build, si elles ont été fournies.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const cleAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (url && cleAnon) return { url, cleAnon }

  throw new Error(
    "Configuration Supabase absente de la page. Vérifie NEXT_PUBLIC_SUPABASE_URL " +
    "et NEXT_PUBLIC_SUPABASE_ANON_KEY dans l'environnement du serveur.",
  )
}

export function createClient() {
  const { url, cleAnon } = lireConfig()
  return createBrowserClient<Database>(url, cleAnon)
}
