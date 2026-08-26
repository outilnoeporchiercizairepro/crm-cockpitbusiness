'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { initiales } from '@/lib/format'
import type { Profile } from '@/lib/database.types'

const LIENS = [
  { href: '/', label: 'Ma journée' },
  { href: '/pipeline', label: 'Pipeline' },
  { href: '/contacts', label: 'Contacts' },
  { href: '/dashboard', label: 'Dashboard' },
]

const LIBELLE_ROLE: Record<string, string> = {
  admin: 'Admin',
  setter: 'Setter',
  closer: 'Closer',
}

export function Navigation({ profil }: { profil: Profile }) {
  const pathname = usePathname()
  const router = useRouter()
  const [menu, setMenu] = useState(false)

  const liens = profil.role === 'admin' ? [...LIENS, { href: '/admin', label: 'Admin' }] : LIENS

  async function deconnexion() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="sticky top-0 z-40 border-b border-bordure bg-fond/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-1 px-4 sm:px-6">
        <Link href="/" className="mr-4 flex shrink-0 items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-altitude/15 text-altitude">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="m3 17 6-6 4 4 8-8" />
              <path d="M17 7h4v4" />
            </svg>
          </div>
          <span className="hidden text-sm font-semibold tracking-tight sm:block">Altitude</span>
        </Link>

        <nav className="flex flex-1 items-center gap-0.5 overflow-x-auto scroll-fin">
          {liens.map((l) => {
            const actif = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href)
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`shrink-0 rounded-md px-3 py-1.5 text-sm transition ${
                  actif
                    ? 'bg-surface-2 text-texte'
                    : 'text-texte-doux hover:bg-surface hover:text-texte'
                }`}
              >
                {l.label}
              </Link>
            )
          })}
        </nav>

        <div className="relative shrink-0">
          <button
            onClick={() => setMenu((v) => !v)}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 transition hover:bg-surface"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-2 text-xs font-medium text-texte-doux">
              {initiales(profil.full_name)}
            </span>
            <span className="hidden text-sm text-texte-doux sm:block">
              {LIBELLE_ROLE[profil.role]}
            </span>
          </button>

          {menu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
              <div className="apparait absolute right-0 z-50 mt-1.5 w-56 rounded-lg border border-bordure bg-surface p-1 shadow-xl">
                <div className="px-3 py-2">
                  <p className="truncate text-sm font-medium">{profil.full_name}</p>
                  <p className="truncate text-xs text-texte-faible">{profil.email}</p>
                </div>
                <div className="my-1 h-px bg-bordure" />
                <button
                  onClick={deconnexion}
                  className="w-full rounded-md px-3 py-2 text-left text-sm text-texte-doux transition hover:bg-surface-2 hover:text-texte"
                >
                  Se déconnecter
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
