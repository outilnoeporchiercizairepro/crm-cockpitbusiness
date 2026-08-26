'use client'

import { useState } from 'react'
import { ModaleClosing } from '@/components/modale-closing'

/**
 * Bouton « Closer » réutilisable : liste contacts, fiche opportunité,
 * ou n'importe quel autre point d'entrée. Il ouvre la même modale que
 * « Ma journée » — un seul parcours de closing dans toute l'application.
 */
export function BoutonCloser({
  opportuniteId,
  contact,
  variante = 'discret',
}: {
  opportuniteId: string
  contact: string
  variante?: 'discret' | 'principal'
}) {
  const [ouvert, setOuvert] = useState(false)

  return (
    <>
      <button
        onClick={() => setOuvert(true)}
        title={`Closer ${contact}`}
        aria-label={`Closer ${contact}`}
        className={
          variante === 'principal'
            ? 'w-full rounded-lg bg-succes px-3.5 py-2 text-sm font-medium text-fond transition hover:opacity-90'
            : 'rounded px-2 py-0.5 text-xs text-texte-faible opacity-0 transition group-hover:opacity-100 hover:bg-succes/12 hover:text-succes focus:opacity-100'
        }
      >
        Closer
      </button>

      {ouvert && (
        <ModaleClosing
          opportuniteId={opportuniteId}
          contact={contact}
          onFermer={() => setOuvert(false)}
        />
      )}
    </>
  )
}
