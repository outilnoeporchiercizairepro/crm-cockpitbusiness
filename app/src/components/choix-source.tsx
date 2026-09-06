'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { definirSource } from '@/app/actions'
import { EtiquetteSource } from '@/components/etiquette-source'
import { styleChamp } from '@/components/ui'
import type { Source } from '@/lib/database.types'

/**
 * Saisie de la provenance depuis la fiche. Indispensable au rattrapage : le
 * webhook n8n laisse la source vide dès que son code ne correspond à rien,
 * et jusqu'ici l'affaire restait sans source pour toujours.
 */
export function ChoixSource({
  opportuniteId,
  contactId,
  sourceId,
  sources,
}: {
  opportuniteId: string
  contactId: string
  sourceId: string | null
  sources: Source[]
}) {
  const router = useRouter()
  const [enCours, demarrer] = useTransition()
  const [erreur, setErreur] = useState('')

  const choisie = sources.find((s) => s.id === sourceId) ?? null

  return (
    <div>
      <div className="mb-2">
        <EtiquetteSource
          label={choisie?.label}
          ton={choisie?.color}
          vide={<span className="text-sm text-texte-faible">Non renseignée</span>}
        />
      </div>

      <select
        value={sourceId ?? ''}
        disabled={enCours}
        aria-label="Source de l'affaire"
        onChange={(e) => {
          const valeur = e.target.value || null
          demarrer(async () => {
            const r = await definirSource(opportuniteId, contactId, valeur)
            if (r.ok) { setErreur(''); router.refresh() }
            else setErreur(r.erreur)
          })
        }}
        className={styleChamp}
      >
        <option value="">— Aucune source</option>
        {sources.map((s) => (
          <option key={s.id} value={s.id}>{s.label}</option>
        ))}
      </select>

      {enCours && <p className="mt-1.5 text-xs text-texte-faible">Enregistrement…</p>}

      {erreur && (
        <p className="apparait mt-2 rounded-lg border border-danger/30 bg-danger/8 px-2.5 py-1.5 text-xs text-danger">
          {erreur}
        </p>
      )}
    </div>
  )
}
