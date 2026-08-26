import 'server-only'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

/**
 * Client à clé de service : contourne la RLS et donne accès à l'API Admin
 * (création de compte, mot de passe, bannissement).
 *
 * À n'utiliser QUE dans des server actions gardées par une vérification de
 * rôle admin. La clé ne doit jamais être préfixée NEXT_PUBLIC_, sinon elle
 * part dans le bundle navigateur et donne à n'importe qui les pleins droits
 * sur la base.
 */
export function createAdminClient() {
  const cle = process.env.SUPABASE_SECRET_KEY

  if (!cle) {
    throw new Error(
      "SUPABASE_SECRET_KEY absente de app/.env.local. " +
      "Récupère-la dans Supabase → Project Settings → API Keys (secret / service_role).",
    )
  }

  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, cle, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
