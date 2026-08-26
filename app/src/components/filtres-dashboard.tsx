'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { styleChamp, styleChampInline } from '@/components/ui'

export function FiltresDashboard({
  periodes,
  sources,
  profils,
  periode,
  source,
  qui,
}: {
  periodes: { v: string; l: string }[]
  sources: { id: string; label: string }[]
  profils: { id: string; full_name: string }[]
  periode: string
  source: string
  qui: string
}) {
  const router = useRouter()
  const [enCours, demarrer] = useTransition()

  function set(champ: string, valeur: string) {
    const p = new URLSearchParams(window.location.search)
    if (valeur) p.set(champ, valeur); else p.delete(champ)
    demarrer(() => router.replace(`/dashboard?${p.toString()}`, { scroll: false }))
  }

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <select value={periode} onChange={(e) => set('periode', e.target.value)} className={styleChampInline}>
        {periodes.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
      </select>

      <select value={source} onChange={(e) => set('source', e.target.value)} className={styleChampInline}>
        <option value="">Toutes les sources</option>
        {sources.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>

      <select value={qui} onChange={(e) => set('qui', e.target.value)} className={styleChampInline}>
        <option value="">Toute l&apos;équipe</option>
        {profils.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
      </select>

      {enCours && <span className="text-xs text-texte-faible">Calcul…</span>}
    </div>
  )
}
