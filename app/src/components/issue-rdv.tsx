'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cloturerPerdu, cloturerEnAttente, marquerNoShow } from '@/app/actions-closing'
import { ModaleClosing } from '@/components/modale-closing'
import { styleChamp, styleBouton, styleBoutonDoux } from '@/components/ui'

type Issue = 'aucune' | 'close' | 'perdu' | 'attente'

function dansNJours(n: number) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export function IssueRdv({
  rdvId,
  opportuniteId,
  contactId,
  contact,
  motifs,
  delaiPremiereRelance,
}: {
  rdvId: string
  opportuniteId: string
  contactId: string
  contact: string
  motifs: { id: string; label: string }[]
  delaiPremiereRelance: number
}) {
  const router = useRouter()
  const [enCours, demarrer] = useTransition()
  const [issue, setIssue] = useState<Issue>('aucune')
  const [erreur, setErreur] = useState('')
  const [fait, setFait] = useState<string | null>(null)

  // --- relance
  const [motifRelance, setMotifRelance] = useState('Relancer')
  const [contenu, setContenu] = useState('')
  const [quand, setQuand] = useState(dansNJours(delaiPremiereRelance))

  function fermer() { setIssue('aucune'); setErreur('') }

  function agir(fn: () => Promise<{ ok: true } | { ok: false; erreur: string }>, libelle: string) {
    demarrer(async () => {
      const r = await fn()
      if (r.ok) { setFait(libelle); fermer(); router.refresh() }
      else setErreur(r.erreur)
    })
  }

  if (fait) {
    const ton = fait === 'Closé' ? 'text-succes' : fait === 'Perdu' ? 'text-danger' : 'text-texte-doux'
    return <span className={`shrink-0 text-xs font-medium ${ton}`}>{fait}</span>
  }

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center gap-1">
        <button
          onClick={() => { setIssue('close'); setErreur('') }}
          className="rounded border border-bordure px-2 py-0.5 text-xs text-texte-doux transition hover:border-succes hover:text-succes"
        >
          Closé
        </button>
        <button
          onClick={() => { setIssue('perdu'); setErreur('') }}
          className="rounded border border-bordure px-2 py-0.5 text-xs text-texte-doux transition hover:border-danger hover:text-danger"
        >
          Perdu
        </button>
        <button
          onClick={() => { setIssue('attente'); setErreur('') }}
          className="rounded border border-bordure px-2 py-0.5 text-xs text-texte-doux transition hover:border-altitude hover:text-altitude"
        >
          En attente
        </button>
        <button
          onClick={() => agir(() => marquerNoShow(rdvId, opportuniteId), 'No-show')}
          disabled={enCours}
          title="Le prospect ne s'est pas présenté"
          className="rounded px-1.5 py-0.5 text-xs text-texte-faible transition hover:text-danger disabled:opacity-40"
        >
          No-show
        </button>
      </div>

      {issue === 'close' && (
        <ModaleClosing
          opportuniteId={opportuniteId}
          contact={contact}
          rdvId={rdvId}
          onFermer={fermer}
          onFait={() => setFait('Closé')}
        />
      )}

      {(issue === 'perdu' || issue === 'attente') && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-fond/80 p-6 text-left"
          onClick={fermer}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="apparait max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-bordure bg-surface p-5 shadow-2xl"
          >
            {/* ------------------------------------------------------ perdu */}
            {issue === 'perdu' && (
              <>
                <h2 className="text-base font-semibold">{contact} est perdu</h2>
                <p className="mt-2 text-sm text-texte-doux">
                  Un motif est nécessaire — c&apos;est lui qui rend les pertes analysables.
                </p>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {motifs.map((m) => (
                    <button
                      key={m.id}
                      disabled={enCours}
                      onClick={() => agir(() => cloturerPerdu(rdvId, opportuniteId, m.id), 'Perdu')}
                      className="rounded-lg border border-bordure px-3 py-1.5 text-sm text-texte-doux transition hover:border-danger hover:text-danger disabled:opacity-40"
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                {erreur && (
                  <p className="apparait mt-3 rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-danger">
                    {erreur}
                  </p>
                )}

                <div className="mt-5 flex justify-end">
                  <button onClick={fermer} className={styleBoutonDoux}>Annuler</button>
                </div>
              </>
            )}

            {/* ------------------------------------------------- en attente */}
            {issue === 'attente' && (
              <>
                <h2 className="text-base font-semibold">Relancer {contact}</h2>
                <p className="mt-2 text-sm text-texte-doux">
                  Les relances automatiques J+2 et J+5 sont posées de toute façon.
                  Celle-ci s&apos;y ajoute.
                </p>

                <div className="mt-4 space-y-3">
                  <div>
                    <label className="mb-1.5 block text-xs text-texte-doux">Motif de la relance *</label>
                    <input
                      value={motifRelance}
                      onChange={(e) => setMotifRelance(e.target.value)}
                      placeholder="Attend l'accord de son associé"
                      autoFocus
                      className={styleChamp}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs text-texte-doux">Contenu</label>
                    <textarea
                      value={contenu}
                      onChange={(e) => setContenu(e.target.value)}
                      rows={3}
                      placeholder="Ce qu'il faut lui redire"
                      className={styleChamp}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs text-texte-doux">Date de relance *</label>
                    <input
                      type="datetime-local"
                      value={quand}
                      onChange={(e) => setQuand(e.target.value)}
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
                    disabled={enCours}
                    onClick={() =>
                      agir(() => cloturerEnAttente(rdvId, opportuniteId, contactId, {
                        motif: motifRelance, contenu, quand,
                      }), 'En attente')
                    }
                    className={styleBouton}
                  >
                    {enCours ? 'Enregistrement…' : 'Planifier la relance'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
