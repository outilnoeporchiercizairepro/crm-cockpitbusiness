'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  majRegleRelance, creerRegleRelance, supprimerRegleRelance, type Resultat,
} from '@/app/actions-admin'
import { Carte, styleChamp, styleChampInline, styleBouton } from '@/components/ui'
import type { RelanceRule } from '@/lib/database.types'

export function AdminRelances({ regles }: { regles: RelanceRule[] }) {
  const router = useRouter()
  const [, demarrer] = useTransition()
  const [erreur, setErreur] = useState('')
  const [label, setLabel] = useState('')
  const [delai, setDelai] = useState('')

  function agir(fn: () => Promise<Resultat>, apres?: () => void) {
    demarrer(async () => {
      const r = await fn()
      if (r.ok) { setErreur(''); apres?.(); router.refresh() }
      else setErreur(r.erreur)
    })
  }

  return (
    <Carte className="overflow-hidden">
      <div className="border-b border-bordure px-4 py-3">
        <h2 className="text-sm font-medium">Relances automatiques</h2>
        <p className="mt-1 text-xs text-texte-faible">
          Créées dès qu&apos;un rendez-vous est marqué honoré, sauf si l&apos;affaire est
          déjà gagnée ou perdue. Elles s&apos;annulent d&apos;elles-mêmes au closing ou à la
          perte. Le délai se compte à partir de la date du rendez-vous.
        </p>
      </div>

      {erreur && (
        <p className="border-b border-bordure bg-danger/8 px-4 py-2 text-sm text-danger">{erreur}</p>
      )}

      <ul className="divide-y divide-bordure">
        {regles.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
            <input
              defaultValue={r.label}
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v && v !== r.label) agir(() => majRegleRelance(r.id, { label: v }))
              }}
              className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-2 py-1 text-sm outline-none transition hover:border-bordure focus:border-altitude"
            />

            <div className="flex shrink-0 items-center gap-1.5">
              <span className="text-xs text-texte-faible">J+</span>
              <input
                type="number" min="1" step="1"
                defaultValue={r.delai_jours}
                onBlur={(e) => {
                  const v = Number(e.target.value)
                  if (v && v !== r.delai_jours) agir(() => majRegleRelance(r.id, { delai_jours: v }))
                }}
                className={`${styleChampInline} w-20`}
              />
            </div>

            <button
              onClick={() => agir(() => majRegleRelance(r.id, { is_active: !r.is_active }))}
              className={`shrink-0 rounded px-2 py-0.5 text-xs transition ${
                r.is_active
                  ? 'bg-succes/12 text-succes hover:bg-succes/20'
                  : 'bg-surface-2 text-texte-faible hover:bg-bordure'
              }`}
            >
              {r.is_active ? 'Active' : 'Inactive'}
            </button>

            <button
              onClick={() => {
                if (confirm(`Supprimer la règle « ${r.label} » ?`)) {
                  agir(() => supprimerRegleRelance(r.id))
                }
              }}
              title="Supprimer la règle"
              className="shrink-0 rounded p-1 text-texte-faible transition hover:bg-danger/12 hover:text-danger"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M8 6V4h8v2m2 0v14H6V6" />
              </svg>
            </button>
          </li>
        ))}

        {!regles.length && (
          <li className="px-4 py-6 text-center text-sm text-texte-faible">
            Aucune relance automatique. Les rendez-vous honorés ne génèreront rien.
          </li>
        )}
      </ul>

      <div className="flex flex-wrap gap-2 border-t border-bordure p-3">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Libellé — ex : Relance J+10"
          className={`${styleChamp} flex-1`}
        />
        <input
          type="number" min="1" step="1"
          value={delai}
          onChange={(e) => setDelai(e.target.value)}
          placeholder="Jours"
          className={`${styleChampInline} w-24`}
        />
        <button
          disabled={!label.trim() || !Number(delai)}
          onClick={() =>
            agir(() => creerRegleRelance(label, Number(delai)), () => { setLabel(''); setDelai('') })
          }
          className={styleBouton}
        >
          Ajouter
        </button>
      </div>
    </Carte>
  )
}
