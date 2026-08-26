import { profilCourant } from '@/lib/session'
import { Navigation } from '@/components/navigation'

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const profil = await profilCourant()

  return (
    <div className="flex min-h-screen flex-col">
      <Navigation profil={profil} />
      <main className="flex-1">{children}</main>
    </div>
  )
}
