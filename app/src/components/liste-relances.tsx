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
          <div key={r.id} className="flex items-start gap-4 px-5 py-5">
            {/* Cible de clic large : c'est le geste le plus répété de la
                journée, une case de 16 px se rate une fois sur trois. */}
            <button
              onClick={() => cocher(r)}
              title="Marquer comme faite"
              aria-label={`Marquer « ${r.titre} » comme faite`}
              className="group mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 border-bordure-forte transition hover:border-succes hover:bg-succes/10"
            >
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"
                className="text-succes opacity-0 transition group-hover:opacity-100"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </button>

            <div className="min-w-0 flex-1">
              {r.opportuniteId ? (
                <Link
                  href={`/opportunites/${r.opportuniteId}`}
                  prefetch={false}
                  className="block text-lg font-medium tracking-tight transition hover:text-altitude"
                >
                  {r.titre}
                </Link>
              ) : (
                <p className="text-lg font-medium tracking-tight">{r.titre}</p>
              )}
              <p className="mt-1 text-sm text-texte-doux">
                {[r.contact, r.entreprise].filter(Boolean).join(' · ') || '—'}
              </p>
            </div>

            <Badge
              ton={enRetard(r.echeance) ? 'danger' : 'neutre'}
              className="mt-1 shrink-0 px-2.5 py-1 text-sm"
            >
              <span suppressHydrationWarning>{relatif(r.echeance)}</span>
            </Badge>
          </div>
        ))}

        {!restantes.length && (
          <p className="px-6 py-12 text-center text-base text-texte-faible">
            {relances.length
              ? 'Toutes les relances du jour sont traitées.'
              : 'Aucune relance due aujourd\u2019hui.'}
          </p>
        )}
      </div>

      {erreur && (
        <p className="apparait border-t border-bordure bg-danger/8 px-4 py-2.5 text-sm text-danger">
          {erreur}
        </p>
      )}

      {derniereFaite && (
        <div className="apparait flex items-center justify-between gap-3 border-t border-bordure bg-succes/8 px-5 py-3">
          <p className="min-w-0 truncate text-sm text-succes">
            « {derniereFaite.titre} » marquée faite
          </p>
          <button
            onClick={() => annuler(derniereFaite)}
            className="shrink-0 rounded-lg border border-bordure px-3 py-1.5 text-sm text-texte-doux transition hover:border-bordure-forte hover:text-texte"
          >
            Annuler
          </button>
        </div>
      )}
    </>
  )
}

export { nomContact }
