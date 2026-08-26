'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  apercuSuppressionContact, supprimerContact, type ApercuSuppression,
} from '@/app/actions'
import { styleBoutonDoux } from '@/components/ui'
import { euros } from '@/lib/format'

export function SuppressionContact({
  contactId,
  nom,
  variante = 'discret',
  apresSuppression = 'rafraichir',
}: {
  contactId: string
  nom: string
  /** « discret » : icône au survol d'une ligne. « bouton » : toujours visible. */
  variante?: 'discret' | 'bouton'
  /**
   * Depuis la fiche, la page disparaît avec le contact : rafraîchir
   * afficherait un 404. On repart alors vers la liste.
   */
  apresSuppression?: 'rafraichir' | 'liste'
}) {
  const router = useRouter()
  const [enCours, demarrer] = useTransition()
  const [ouvert, setOuvert] = useState(false)
  const [apercu, setApercu] = useState<ApercuSuppression | null>(null)
  const [erreur, setErreur] = useState('')

  function demander() {
    // La boîte s'ouvre tout de suite ; le décompte de ce qui sera détruit
    // demande un aller-retour serveur et se remplit ensuite. Sans ça, le
    // bouton semble ne rien faire pendant une seconde ou deux.
    setOuvert(true)
    setApercu(null)
    setErreur('')

    demarrer(async () => {
      const r = await apercuSuppressionContact(contactId)
      if (r.ok) setApercu(r.apercu)
      else setErreur(r.erreur)
    })
  }

  function fermer() {
    setOuvert(false)
    setApercu(null)
    setErreur('')
  }

  function confirmer() {
    demarrer(async () => {
      const r = await supprimerContact(contactId)
      if (!r.ok) { setErreur(r.erreur); return }

      fermer()
      if (apresSuppression === 'liste') router.replace('/contacts')
      else router.refresh()
    })
  }

  return (
    <>
      <button
        onClick={demander}
        disabled={enCours}
        title={`Supprimer ${nom}`}
        aria-label={`Supprimer ${nom}`}
        className={
          variante === 'bouton'
            ? 'flex w-full items-center justify-center gap-1.5 rounded-lg border border-bordure px-3.5 py-2 text-sm text-texte-doux transition hover:border-danger/50 hover:text-danger disabled:opacity-40'
            : 'rounded p-1.5 text-texte-faible opacity-0 transition group-hover:opacity-100 hover:bg-danger/12 hover:text-danger focus:opacity-100 disabled:opacity-40'
        }
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V6" />
        </svg>
        {variante === 'bouton' && 'Supprimer le contact'}
      </button>

      {ouvert && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-fond/80 p-6 text-left"
          onClick={fermer}
        >
          <div
            className="apparait w-full max-w-md rounded-xl border border-bordure bg-surface p-5 shadow-2xl"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold">Supprimer {nom} ?</h2>
            <p className="mt-2 text-sm text-texte-doux">
              Cette suppression est définitive et emporte tout l&apos;historique du contact :
            </p>

            <ul className="mt-3 space-y-1.5 rounded-lg border border-bordure bg-surface-2/50 p-3 text-sm">
              <Ligne label="Opportunités"      valeur={apercu?.opportunites} />
              <Ligne label="Activités loggées" valeur={apercu?.activites} />
              <Ligne label="Rendez-vous"       valeur={apercu?.rdv} />
              <Ligne label="Relances"          valeur={apercu?.taches} />
            </ul>

            {apercu && apercu.caSigne > 0 && (
              <p className="apparait mt-3 rounded-lg border border-alerte/30 bg-alerte/8 px-3 py-2 text-sm text-alerte">
                {euros(apercu.caSigne)} de chiffre d&apos;affaires signé disparaîtront aussi
                du dashboard.
              </p>
            )}

            {erreur && (
              <p className="apparait mt-3 rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-danger">
                {erreur}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={fermer} className={styleBoutonDoux}>Annuler</button>
              <button
                onClick={confirmer}
                disabled={enCours || !apercu}
                className="rounded-lg bg-danger px-3.5 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
              >
                {enCours ? 'Un instant…' : 'Supprimer définitivement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Ligne({ label, valeur }: { label: string; valeur: number | undefined }) {
  return (
    <li className="flex items-baseline justify-between gap-3">
      <span className="text-texte-doux">{label}</span>
      {valeur === undefined ? (
        <span className="squelette h-3.5 w-6" />
      ) : (
        <span className={`tabular-nums ${valeur ? 'text-texte' : 'text-texte-faible'}`}>
          {valeur}
        </span>
      )}
    </li>
  )
}
