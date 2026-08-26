'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { basculerEncaissement } from '@/app/actions-closing'
import { Carte, Badge, styleBoutonDoux } from '@/components/ui'
import { euros, jour, enRetard } from '@/lib/format'
import type { Payment } from '@/lib/database.types'

export function Echeancier({ echeances }: { echeances: Payment[] }) {
  const router = useRouter()
  const [enCours, demarrer] = useTransition()
  const [erreur, setErreur] = useState('')

  if (!echeances.length) return null

  const attendu = echeances.reduce((s, e) => s + Number(e.amount_expected), 0)
  const encaisse = echeances
    .filter((e) => e.status === 'encaisse')
    .reduce((s, e) => s + Number(e.amount_received ?? e.amount_expected), 0)
  const reste = attendu - encaisse

  return (
    <Carte className="p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-texte-faible">
          Échéancier
        </h2>
        <span className="text-xs tabular-nums text-texte-faible">
          {echeances.length} versement{echeances.length > 1 ? 's' : ''}
        </span>
      </div>

      <ul className="space-y-1.5">
        {echeances.map((e) => {
          const encaisseCeLa = e.status === 'encaisse'
          const enRetardCeLa = !encaisseCeLa && enRetard(e.due_date)
          return (
            <li key={e.id} className="flex items-center gap-2.5">
              <button
                disabled={enCours}
                onClick={() =>
                  demarrer(async () => {
                    const r = await basculerEncaissement(e.id, !encaisseCeLa)
                    if (r.ok) { setErreur(''); router.refresh() }
                    else setErreur(r.erreur)
                  })
                }
                title={encaisseCeLa ? 'Marquer comme non encaissé' : 'Marquer comme encaissé'}
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition disabled:opacity-40 ${
                  encaisseCeLa
                    ? 'border-succes bg-succes text-fond'
                    : 'border-bordure-forte hover:border-succes'
                }`}
              >
                {encaisseCeLa && (
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </button>

              <span className="w-4 shrink-0 text-xs tabular-nums text-texte-faible">
                {e.installment_no}
              </span>

              <span className={`flex-1 text-sm ${enRetardCeLa ? 'text-danger' : 'text-texte-doux'}`}>
                {jour(e.due_date)}
              </span>

              <span className={`shrink-0 text-sm tabular-nums ${encaisseCeLa ? 'text-succes' : ''}`}>
                {euros(Number(e.amount_expected))}
              </span>
            </li>
          )
        })}
      </ul>

      <div className="mt-3 border-t border-bordure pt-3 text-sm">
        <div className="flex items-baseline justify-between">
          <span className="text-texte-doux">Encaissé</span>
          <span className="tabular-nums text-succes">{euros(encaisse)}</span>
        </div>
        {reste > 0 && (
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-texte-doux">Reste à venir</span>
            <span className="tabular-nums text-texte-doux">{euros(reste)}</span>
          </div>
        )}
        {reste <= 0 && (
          <Badge ton="succes" className="mt-2 w-full justify-center py-1">
            Intégralement encaissé
          </Badge>
        )}
      </div>

      {erreur && (
        <p className="apparait mt-3 rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-danger">
          {erreur}
        </p>
      )}

      {enCours && <p className="mt-2 text-xs text-texte-faible">Mise à jour…</p>}
    </Carte>
  )
}

export { styleBoutonDoux }
