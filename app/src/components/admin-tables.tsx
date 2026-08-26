'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { majLigneConfig, creerLigneConfig } from '@/app/actions'
import { Carte, Badge, styleChamp, styleBouton } from '@/components/ui'

type LigneConfig = {
  id: string
  key: string
  label: string
  position: number
  is_active: boolean
  is_won?: boolean
  is_lost?: boolean
}

export function TableConfig({
  table,
  titre,
  aide,
  lignes,
  creation,
}: {
  table: 'pipeline_stages' | 'sources' | 'lost_reasons'
  titre: string
  aide: string
  lignes: LigneConfig[]
  creation: boolean
}) {
  const router = useRouter()
  const [, demarrer] = useTransition()
  const [erreur, setErreur] = useState('')
  const [nouveau, setNouveau] = useState('')

  function agir(fn: () => Promise<{ ok: true } | { ok: false; erreur: string }>) {
    demarrer(async () => {
      const r = await fn()
      if (r.ok) { setErreur(''); router.refresh() }
      else setErreur(r.erreur)
    })
  }

  return (
    <Carte className="overflow-hidden">
      <div className="border-b border-bordure px-4 py-3">
        <h2 className="text-sm font-medium">{titre}</h2>
        <p className="mt-1 text-xs text-texte-faible">{aide}</p>
      </div>

      {erreur && <p className="border-b border-bordure bg-danger/8 px-4 py-2 text-sm text-danger">{erreur}</p>}

      <ul className="divide-y divide-bordure">
        {lignes.map((l) => (
          <li key={l.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="w-7 shrink-0 text-xs tabular-nums text-texte-faible">{l.position}</span>

            <input
              defaultValue={l.label}
              onBlur={(e) => {
                if (e.target.value !== l.label && e.target.value.trim()) {
                  agir(() => majLigneConfig(table, l.id, { label: e.target.value.trim() }))
                }
              }}
              className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-2 py-1 text-sm outline-none transition hover:border-bordure focus:border-altitude"
            />

            <code className="hidden shrink-0 text-xs text-texte-faible sm:block">{l.key}</code>

            {l.is_won && <Badge ton="succes">Gagné</Badge>}
            {l.is_lost && <Badge ton="danger">Perdu</Badge>}

            <button
              onClick={() => agir(() => majLigneConfig(table, l.id, { is_active: !l.is_active }))}
              className={`shrink-0 rounded px-2 py-0.5 text-xs transition ${
                l.is_active
                  ? 'bg-succes/12 text-succes hover:bg-succes/20'
                  : 'bg-surface-2 text-texte-faible hover:bg-bordure'
              }`}
            >
              {l.is_active ? 'Actif' : 'Inactif'}
            </button>
          </li>
        ))}
      </ul>

      {creation && (
        <div className="flex gap-2 border-t border-bordure p-3">
          <input
            value={nouveau}
            onChange={(e) => setNouveau(e.target.value)}
            placeholder="Nouveau libellé…"
            className={styleChamp}
          />
          <button
            disabled={!nouveau.trim()}
            onClick={() =>
              agir(async () => {
                const r = await creerLigneConfig(table as 'sources' | 'lost_reasons', nouveau.trim())
                if (r.ok) setNouveau('')
                return r
              })
            }
            className={styleBouton}
          >
            Ajouter
          </button>
        </div>
      )}
    </Carte>
  )
}
