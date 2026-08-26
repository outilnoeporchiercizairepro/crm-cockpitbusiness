'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { loggerActivite, majStatutRdv } from '@/app/actions'
import { Carte, Badge, styleChamp, styleBouton, styleBoutonDoux } from '@/components/ui'
import {
  jourHeure, relatif, dureeJours,
  LIBELLE_ACTIVITE, LIBELLE_RDV, LIBELLE_STATUT_RDV,
} from '@/lib/format'

export type Evenement =
  | {
      genre: 'activite'; id: string; quand: string; type: string; direction: string
      outcome: string | null; contenu: string | null; auteur: string | null
    }
  | {
      genre: 'rdv'; id: string; quand: string; kind: string; statut: string
      hote: string | null; opportuniteId: string
    }
  | {
      genre: 'etape'; id: string; quand: string; de: string | null; vers: string
      auteur: string | null; secondes: number | null
    }

export function Timeline({
  evenements,
  contactId,
  opportuniteId,
}: {
  evenements: Evenement[]
  contactId: string
  opportuniteId: string
}) {
  const router = useRouter()
  const [, demarrer] = useTransition()
  const [ouvert, setOuvert] = useState(false)
  const [erreur, setErreur] = useState('')

  return (
    <Carte className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-bordure px-4 py-3">
        <h2 className="text-sm font-medium">Historique</h2>
        <button onClick={() => setOuvert((v) => !v)} className={styleBoutonDoux}>
          {ouvert ? 'Fermer' : 'Logger un échange'}
        </button>
      </div>

      {ouvert && (
        <form
          action={(fd) =>
            demarrer(async () => {
              const r = await loggerActivite(fd)
              if (r.ok) { setOuvert(false); setErreur(''); router.refresh() }
              else setErreur(r.erreur)
            })
          }
          className="apparait border-b border-bordure bg-surface-2/40 p-4"
        >
          <input type="hidden" name="contact_id" value={contactId} />
          <input type="hidden" name="opportunity_id" value={opportuniteId} />

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs text-texte-doux">Canal</label>
              <select name="type" className={styleChamp} defaultValue="appel">
                {Object.entries(LIBELLE_ACTIVITE).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-texte-doux">Sens</label>
              <select name="direction" className={styleChamp} defaultValue="sortant">
                <option value="sortant">Sortant</option>
                <option value="entrant">Entrant</option>
                <option value="interne">Interne</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-texte-doux">Résultat</label>
              <select name="outcome" className={styleChamp} defaultValue="">
                <option value="">—</option>
                <option value="repondu">A répondu</option>
                <option value="pas_de_reponse">Pas de réponse</option>
                <option value="rappel_demande">Rappel demandé</option>
                <option value="refus">Refus</option>
              </select>
            </div>
          </div>

          <div className="mt-3">
            <label className="mb-1.5 block text-xs text-texte-doux">Ce qui s&apos;est dit</label>
            <textarea name="content" rows={3} className={styleChamp} autoFocus />
          </div>

          {erreur && <p className="mt-2 text-sm text-danger">{erreur}</p>}

          <div className="mt-3 flex items-center gap-2">
            <button type="submit" className={styleBouton}>Enregistrer</button>
            <p className="text-xs text-texte-faible">
              Le journal est immuable : une correction se fait par une nouvelle entrée.
            </p>
          </div>
        </form>
      )}

      {!evenements.length ? (
        <p className="px-4 py-10 text-center text-sm text-texte-faible">
          Aucun échange encore. Logge le premier contact.
        </p>
      ) : (
        <ol className="divide-y divide-bordure">
          {evenements.map((e) => (
            <li key={`${e.genre}-${e.id}`} className="flex gap-3 px-4 py-3">
              <Pastille genre={e.genre} />
              <div className="min-w-0 flex-1">
                {e.genre === 'activite' && (
                  <>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium">{LIBELLE_ACTIVITE[e.type] ?? e.type}</span>
                      <Badge>{e.direction}</Badge>
                      {e.outcome && <Badge ton="neutre">{e.outcome.replace(/_/g, ' ')}</Badge>}
                    </div>
                    {e.contenu && (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-texte-doux">{e.contenu}</p>
                    )}
                    <p className="mt-1 text-xs text-texte-faible">
                      {e.auteur ?? 'Inconnu'} · {jourHeure(e.quand)}
                    </p>
                  </>
                )}

                {e.genre === 'rdv' && (
                  <>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium">RDV {LIBELLE_RDV[e.kind] ?? e.kind}</span>
                      <Badge
                        ton={
                          e.statut === 'honore' ? 'succes'
                          : e.statut === 'no_show' ? 'danger'
                          : e.statut === 'annule' ? 'neutre' : 'alerte'
                        }
                      >
                        {LIBELLE_STATUT_RDV[e.statut] ?? e.statut}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-texte-faible">
                      {jourHeure(e.quand)}
                      {e.hote ? ` · ${e.hote}` : ''}
                    </p>

                    {e.statut === 'planifie' && (
                      <div className="mt-2 flex gap-1.5">
                        {(['honore', 'no_show'] as const).map((s) => (
                          <button
                            key={s}
                            onClick={() =>
                              demarrer(async () => {
                                await majStatutRdv(e.id, s, e.opportuniteId)
                                router.refresh()
                              })
                            }
                            className={`rounded border border-bordure px-2 py-0.5 text-xs text-texte-doux transition ${
                              s === 'honore' ? 'hover:border-succes hover:text-succes' : 'hover:border-danger hover:text-danger'
                            }`}
                          >
                            {s === 'honore' ? 'Honoré' : 'No-show'}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {e.genre === 'etape' && (
                  <>
                    <p className="text-sm">
                      {e.de ? (
                        <>
                          <span className="text-texte-faible">{e.de}</span>
                          <span className="mx-1.5 text-texte-faible">→</span>
                        </>
                      ) : (
                        <span className="text-texte-faible">Créée en </span>
                      )}
                      <span className="font-medium">{e.vers}</span>
                    </p>
                    <p className="mt-1 text-xs text-texte-faible">
                      {jourHeure(e.quand)}
                      {e.auteur ? ` · ${e.auteur}` : ''}
                      {e.secondes !== null && e.secondes !== undefined
                        ? ` · ${dureeJours(e.secondes)} à l'étape précédente`
                        : ''}
                    </p>
                  </>
                )}
              </div>

              <span suppressHydrationWarning className="shrink-0 text-xs text-texte-faible">
                {relatif(e.quand)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Carte>
  )
}

function Pastille({ genre }: { genre: Evenement['genre'] }) {
  const couleur =
    genre === 'activite' ? 'bg-altitude'
    : genre === 'rdv' ? 'bg-violet'
    : 'bg-texte-faible'

  return <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${couleur}`} />
}
