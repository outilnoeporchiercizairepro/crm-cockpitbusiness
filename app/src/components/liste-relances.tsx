'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { terminerTache, rouvrirTache } from '@/app/actions'
import { Badge } from '@/components/ui'
import { relatif, enRetard, nomContact } from '@/lib/format'

export type Relance = {
  id: string
  titre: string
  echeance: string
  contact: string | null
  entreprise: string | null
  opportuniteId: string | null
}

export function ListeRelances({ relances }: { relances: Relance[] }) {
  const router = useRouter()
  const [, demarrer] = useTransition()
  const [faites, setFaites] = useState<Record<string, boolean>>({})

  // On garde l'objet, pas seulement son identifiant : la server action
  // revalide la route, donc la relance quitte la liste reçue en props et un
  // simple `find` ne la retrouverait plus pour proposer l'annulation.
  const [derniereFaite, setDerniereFaite] = useState<Relance | null>(null)
  const [erreur, setErreur] = useState('')

  const restantes = relances.filter((r) => !faites[r.id])

  function cocher(relance: Relance) {
    setFaites((f) => ({ ...f, [relance.id]: true }))
    setDerniereFaite(relance)
    setErreur('')

    demarrer(async () => {
      const r = await terminerTache(relance.id)
      if (!r.ok) {
        setFaites((f) => ({ ...f, [relance.id]: false }))
        setDerniereFaite(null)
        setErreur(r.erreur)
      }
    })
  }

  function annuler(relance: Relance) {
    setFaites((f) => ({ ...f, [relance.id]: false }))
    setDerniereFaite(null)

    demarrer(async () => {
      const r = await rouvrirTache(relance.id)
      if (!r.ok) setErreur(r.erreur)
      router.refresh()
    })
  }

  return (
    <>
      <div className="divide-y divide-bordure">
        {restantes.map((r) => (
          <div key={r.id} className="flex items-start gap-3 px-4 py-3">
            <button
              onClick={() => cocher(r)}
              title="Marquer comme faite"
              aria-label={`Marquer « ${r.titre} » comme faite`}
              className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-bordure-forte transition hover:border-succes hover:bg-succes/10"
            />

            <div className="min-w-0 flex-1">
              {r.opportuniteId ? (
                <Link
                  href={`/opportunites/${r.opportuniteId}`}
                  prefetch={false}
                  className="block truncate text-sm transition hover:text-altitude"
                >
                  {r.titre}
                </Link>
              ) : (
                <p className="truncate text-sm">{r.titre}</p>
              )}
              <p className="mt-0.5 truncate text-xs text-texte-faible">
                {[r.contact, r.entreprise].filter(Boolean).join(' · ') || '—'}
              </p>
            </div>

            <Badge ton={enRetard(r.echeance) ? 'danger' : 'neutre'}>
              <span suppressHydrationWarning>{relatif(r.echeance)}</span>
            </Badge>
          </div>
        ))}

        {!restantes.length && (
          <p className="px-4 py-8 text-center text-sm text-texte-faible">
            Toutes les relances du jour sont traitées.
          </p>
        )}
      </div>

      {erreur && (
        <p className="apparait border-t border-bordure bg-danger/8 px-4 py-2.5 text-sm text-danger">
          {erreur}
        </p>
      )}

      {derniereFaite && (
        <div className="apparait flex items-center justify-between gap-3 border-t border-bordure bg-succes/8 px-4 py-2.5">
          <p className="min-w-0 truncate text-sm text-succes">
            « {derniereFaite.titre} » marquée faite
          </p>
          <button
            onClick={() => annuler(derniereFaite)}
            className="shrink-0 text-sm text-texte-doux underline-offset-2 transition hover:text-texte hover:underline"
          >
            Annuler
          </button>
        </div>
      )}
    </>
  )
}

export { nomContact }
