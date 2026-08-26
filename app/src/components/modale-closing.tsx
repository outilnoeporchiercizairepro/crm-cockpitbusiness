'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cloturerGagne } from '@/app/actions-closing'
import { styleChamp, styleBoutonDoux } from '@/components/ui'
import { NOMBRE_ECHEANCES, repartirEcheances } from '@/lib/echeances'
import { euros } from '@/lib/format'
import type { PaymentPlan, LegalEntity } from '@/lib/database.types'

/**
 * Taux proposé par défaut selon l'entité : 20 % sur la SASU, 0 % sur
 * l'auto-entreprise en franchise de TVA. Proposé, pas imposé — une
 * auto-entreprise qui dépasse le seuil facture la TVA.
 */
const TVA_PAR_DEFAUT: Record<LegalEntity, number> = { sasu: 20, auto: 0 }

function moisSuivant(depart: Date, decalage: number) {
  const d = new Date(depart)
  d.setMonth(d.getMonth() + decalage)
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

export function ModaleClosing({
  opportuniteId,
  contact,
  rdvId,
  onFermer,
  onFait,
}: {
  opportuniteId: string
  contact: string
  /** Renseigné seulement depuis « Ma journée » : le RDV passe alors honoré. */
  rdvId?: string | null
  onFermer: () => void
  onFait?: () => void
}) {
  const router = useRouter()
  const [enCours, demarrer] = useTransition()
  const [erreur, setErreur] = useState('')

  const [entite, setEntite] = useState<LegalEntity>('auto')
  const [ht, setHt] = useState('')
  const [ttc, setTtc] = useState('')
  const [ttcModifie, setTtcModifie] = useState(false)
  const [tva, setTva] = useState(TVA_PAR_DEFAUT.auto)
  const [plan, setPlan] = useState<PaymentPlan>('1x')
  const [commission, setCommission] = useState('')

  const ttcSuggere = ht && !Number.isNaN(Number(ht))
    ? (Number(ht) * (1 + tva / 100)).toFixed(2)
    : ''
  const ttcEffectif = ttcModifie ? ttc : ttcSuggere

  const nbEcheances = NOMBRE_ECHEANCES[plan] ?? 1
  const echeances = Number(ttcEffectif) > 0 ? repartirEcheances(Number(ttcEffectif), nbEcheances) : []
  const aujourdhui = new Date()

  function valider() {
    demarrer(async () => {
      const r = await cloturerGagne(
        opportuniteId,
        { montantHt: ht, montantTtc: ttcEffectif, plan, entite, commissionSetter: commission },
        rdvId,
      )
      if (r.ok) { onFait?.(); onFermer(); router.refresh() }
      else setErreur(r.erreur)
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-fond/80 p-6 text-left"
      onClick={onFermer}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="apparait max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-bordure bg-surface p-5 shadow-2xl"
      >
        <h2 className="text-base font-semibold">Closer {contact}</h2>

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1.5 block text-xs text-texte-doux">Encaissé sur</label>
            <div className="grid grid-cols-2 gap-2">
              {(['auto', 'sasu'] as LegalEntity[]).map((e) => (
                <button
                  key={e}
                  onClick={() => { setEntite(e); setTva(TVA_PAR_DEFAUT[e]); setTtcModifie(false) }}
                  className={`rounded-lg border px-3 py-2 text-sm transition ${
                    entite === e
                      ? 'border-altitude bg-altitude/10 text-texte'
                      : 'border-bordure text-texte-doux hover:border-bordure-forte'
                  }`}
                >
                  {e === 'auto' ? 'Auto-entreprise' : 'SASU'}
                  <span className="mt-0.5 block text-xs text-texte-faible">
                    {e === 'auto' ? 'Mollie' : 'Stripe'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-[1fr_5rem_1fr] gap-2">
            <div>
              <label className="mb-1.5 block text-xs text-texte-doux">Montant HT *</label>
              <input
                type="number" step="10" min="0" autoFocus
                value={ht}
                onChange={(e) => setHt(e.target.value)}
                placeholder="1500"
                className={styleChamp}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-texte-doux">TVA</label>
              <select
                value={tva}
                onChange={(e) => { setTva(Number(e.target.value)); setTtcModifie(false) }}
                className={styleChamp}
              >
                {[0, 5.5, 10, 20].map((t) => <option key={t} value={t}>{t} %</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-texte-doux">
                Montant TTC
                {!ttcModifie && ttcSuggere && <span className="ml-1 text-texte-faible">(calculé)</span>}
              </label>
              <input
                type="number" step="10" min="0"
                value={ttcEffectif}
                onChange={(e) => { setTtcModifie(true); setTtc(e.target.value) }}
                className={styleChamp}
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-texte-doux">Mode de paiement</label>
            <div className="flex flex-wrap gap-1.5">
              {([['1x', 'One shot'], ['2x', '2 fois'], ['3x', '3 fois'], ['4x', '4 fois']] as [PaymentPlan, string][]).map(
                ([v, l]) => (
                  <button
                    key={v}
                    onClick={() => setPlan(v)}
                    className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                      plan === v
                        ? 'border-altitude bg-altitude/10 text-texte'
                        : 'border-bordure text-texte-doux hover:border-bordure-forte'
                    }`}
                  >
                    {l}
                  </button>
                ),
              )}
            </div>
          </div>

          {echeances.length > 0 && (
            <div className="apparait rounded-lg border border-bordure bg-surface-2/50 p-3">
              <p className="mb-2 text-xs text-texte-faible">
                Ce que tu encaisses {nbEcheances > 1 ? `en ${nbEcheances} mensualités` : 'en une fois'}
              </p>
              <ul className="space-y-1 text-sm">
                {echeances.map((montant, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-3">
                    <span className="text-texte-doux">
                      {nbEcheances > 1 ? `${i + 1}. ` : ''}{moisSuivant(aujourdhui, i)}
                    </span>
                    <span className="tabular-nums">{euros(montant)}</span>
                  </li>
                ))}
              </ul>
              {nbEcheances > 1 && (
                <p className="mt-2 border-t border-bordure pt-2 text-xs text-texte-faible">
                  Total {euros(Number(ttcEffectif))} TTC
                  {tva > 0 && ` · dont ${euros(Number(ttcEffectif) - Number(ht))} de TVA`}
                </p>
              )}
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs text-texte-doux">
              Commission du setter <span className="text-texte-faible">(%, vide si pas de setter)</span>
            </label>
            <input
              type="number" step="1" min="0" max="100"
              value={commission}
              onChange={(e) => setCommission(e.target.value)}
              placeholder="10"
              className={styleChamp}
            />
            {commission && ht && !Number.isNaN(Number(ht)) && (
              <p className="mt-1 text-xs text-texte-faible">
                Soit {euros((Number(ht) * Number(commission)) / 100)} sur le HT.
              </p>
            )}
          </div>
        </div>

        {erreur && (
          <p className="apparait mt-3 rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-danger">
            {erreur}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onFermer} className={styleBoutonDoux}>Annuler</button>
          <button
            disabled={enCours || !ht}
            onClick={valider}
            className="rounded-lg bg-succes px-3.5 py-2 text-sm font-medium text-fond transition hover:opacity-90 disabled:opacity-40"
          >
            {enCours ? 'Enregistrement…' : 'Marquer closé'}
          </button>
        </div>
      </div>
    </div>
  )
}
