'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { majNotesContact } from '@/app/actions'
import { Carte, styleChamp, styleBouton, styleBoutonDoux } from '@/components/ui'

/**
 * Notes libres du contact. C'est le seul champ qu'un setter peut écrire :
 * il consulte son périmètre et y ajoute ce qu'il apprend.
 */
export function NotesContact({
  contactId,
  notes,
}: {
  contactId: string
  notes: string | null
}) {
  const router = useRouter()
  const [enCours, demarrer] = useTransition()
  const [edition, setEdition] = useState(false)
  const [texte, setTexte] = useState(notes ?? '')
  const [erreur, setErreur] = useState('')

  function enregistrer() {
    demarrer(async () => {
      const r = await majNotesContact(contactId, texte)
      if (r.ok) { setErreur(''); setEdition(false); router.refresh() }
      else setErreur(r.erreur)
    })
  }

  return (
    <Carte className="p-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-texte-faible">
          Notes
        </h2>
        {!edition && (
          <button
            onClick={() => { setTexte(notes ?? ''); setEdition(true); setErreur('') }}
            className="text-xs text-texte-doux transition hover:text-altitude"
          >
            {notes ? 'Modifier' : 'Ajouter'}
          </button>
        )}
      </div>

      {edition ? (
        <>
          <textarea
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            rows={6}
            autoFocus
            placeholder="Ce que tu apprends sur ce contact"
            className={styleChamp}
          />
          {erreur && (
            <p className="apparait mt-2 rounded-lg border border-danger/30 bg-danger/8 px-2.5 py-1.5 text-xs text-danger">
              {erreur}
            </p>
          )}
          <div className="mt-2 flex gap-2">
            <button disabled={enCours} onClick={enregistrer} className={styleBouton}>
              {enCours ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button onClick={() => { setEdition(false); setErreur('') }} className={styleBoutonDoux}>
              Annuler
            </button>
          </div>
        </>
      ) : notes ? (
        <p className="whitespace-pre-wrap text-sm text-texte-doux">{notes}</p>
      ) : (
        <p className="text-sm text-texte-faible">Aucune note.</p>
      )}
    </Carte>
  )
}
