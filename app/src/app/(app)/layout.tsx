import { profilCourant } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { Navigation } from '@/components/navigation'
import type { Notification } from '@/lib/database.types'

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const profil = await profilCourant()
  const supabase = await createClient()

  // La RLS filtre déjà par périmètre de sources : aucune condition à écrire
  // ici, et rien à filtrer côté client.
  const { data: notifications } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(30)

  return (
    <div className="flex min-h-screen flex-col">
      <Navigation
        profil={profil}
        notifications={(notifications ?? []) as Notification[]}
      />
      <main className="flex-1">{children}</main>
    </div>
  )
}
