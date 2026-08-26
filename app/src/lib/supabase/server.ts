import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/lib/database.types'
import { envSupabase } from '@/lib/env-supabase'

export async function createClient() {
  const cookieStore = await cookies()
  const { url, cleAnon } = envSupabase()

  return createServerClient<Database>(
    url,
    cleAnon,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Appelé depuis un Server Component : le middleware rafraîchit la session.
          }
        },
      },
    },
  )
}
