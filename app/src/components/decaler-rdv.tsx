'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { replanifierRdv } from '@/app/actions'
import { styleChamp, styleBouton, styleBoutonDoux } from '@/components/ui'
import { saisieDepuisInstant, jourHeure } from '@/lib/format'

/**
 * Report d'un rendez-vous à la demande du client.
 *
 * Composant unique, affiché depuis « Ma journée » et depuis l'historique de
 * la fiche : c'est le même geste, et deux modales séparées finiraient par
 * diverger sur la gestion du fuseau — celle-là est la partie fragile.
 */
export function DecalerRdv({
  rdvId,
  creneauActuel,
  contact,
  style = 'discret',
}: {
  rdvId: string
  creneauActuel: string
  contact: string
  style?: 'discret' | 'bouton'
}) {
  const router = useRouter()
  const [enCours, demarrer] = useTransition()
  const [ouvert, setOuvert] = useState(false)
  const [erreur, setErreur] = useState('')
  const [quand, setQuand] = useState(() => saisieDepuisInstant(creneauActuel))
  const [motif, setMotif] = useState('')

  function fermer() { setOuvert(false); setErreur(''); setMotif('') }

  return (
    <>
      <button
        onClick={() => {
          setQuand(saisieDepuisInstant(creneauActuel))
          setOuvert(true)
          setErreur('')
        }}
        title="Le client demande un autre créneau"
        className={
          style === 'bouton'
            ? 'rounded border border-bordure px-2 py-0.5 text-xs text-texte-doux transition hover:border-altitude hover:text-altitude'
            : 'rounded px-1.5 py-0.5 text-xs text-texte-faible transition hover:text-altitude'
        }
      >
        Décaler
      </button>

      {ouvert && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-fond/80 p-6 text-left"
          onClick={fermer}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="apparait w-full max-w-md rounded-xl border border-bordure bg-surface p-5 shadow-2xl"
          >
            <h2 className="text-base font-semibold">Décaler le RDV de {contact}</h2>
            <p className="mt-2 text-sm text-texte-doux">
              Créneau actuel : {jourHeure(creneauActuel)}. Il sera marqué
              « replanifié » et rattaché au nouveau — l&apos;historique garde
              la trace du report.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1.5 block text-xs text-texte-doux">Nouveau créneau *</label>
                <input
                  type="datetime-local"
                  value={quand}
                  autoFocus
                  onChange={(e) => setQuand(e.target.value)}
                  className={styleChamp}
                />
                <p className="mt-1 text-xs text-texte-faible">Heure de Paris.</p>
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-texte-doux">
                  Motif <span className="text-texte-faible">(facultatif)</span>
                </label>
                <input
                  value={motif}
                  onChange={(e) => setMotif(e.target.value)}
                  placeholder="Empêchement de dernière minute"
                  className={styleChamp}
                />
              </div>
            </div>

            {erreur && (
              <p className="apparait mt-3 rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-danger">
                {erreur}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={fermer} className={styleBoutonDoux}>Annuler</button>
              <button
                disabled={enCours || !quand}
                onClick={() =>
                  demarrer(async () => {
                    const r = await replanifierRdv(rdvId, quand, motif)
                    if (r.ok) { fermer(); router.refresh() }
                    else setErreur(r.erreur)
                  })
                }
                className={styleBouton}
              >
                {enCours ? 'Décalage…' : 'Décaler'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
