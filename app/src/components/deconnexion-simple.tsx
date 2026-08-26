'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { styleBoutonDoux } from '@/components/ui'

export function DeconnexionSimple() {
  const router = useRouter()

  return (
    <button
      onClick={async () => {
        await createClient().auth.signOut()
        router.push('/login')
        router.refresh()
      }}
      className={`${styleBoutonDoux} mt-6`}
    >
      Se déconnecter
    </button>
  )
}
