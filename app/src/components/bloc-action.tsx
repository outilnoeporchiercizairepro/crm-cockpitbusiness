'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  deplacerEtape, marquerPerdue, majOpportunite,
  creerRdv, creerTache, terminerTache,
} from '@/app/actions'
import { Carte, Badge, styleChamp, styleBouton, styleBoutonDoux } from '@/components/ui'
import { BoutonCloser } from '@/components/bouton-closer'
import { jourHeure, relatif, enRetard } from '@/lib/format'
import type { PipelineStage, PaymentPlan, PaymentProcessor, LegalEntity, Task } from '@/lib/database.types'

type OppFiche = {
  id: string
  stage_id: string
  amount_proposed: number | null
  amount_signed: number | null
  payment_plan: PaymentPlan | null
  payment_processor: PaymentProcessor | null
  legal_entity: LegalEntity | null
  setter_paid: boolean
  is_nurturing: boolean
  is_disqualified: boolean
  setter_id: string | null
  closer_id: string | null
}

export function BlocAction({
  opportunite,
  contactId,
  nomContact,
  etapes,
  motifs,
  profils,
  taches,
  moi,
}: {
  opportunite: OppFiche
  contactId: string
  nomContact: string
  etapes: PipelineStage[]
  motifs: { id: string; label: string }[]
  profils: { id: string; full_name: string; role: string }[]
  taches: Task[]
  moi: string
}) {
  const router = useRouter()
  const [, demarrer] = useTransition()
  const [erreur, setErreur] = useState('')
  const [panneau, setPanneau] = useState<'aucun' | 'rdv' | 'perdue' | 'chiffrage' | 'relance'>('aucun')

  const etapeActuelle = etapes.find((e) => e.id === opportunite.stage_id)

  // La première étape non perdue au-delà de l'actuelle — et non « position + 1 » :
  // depuis « En attente », la position suivante est « Perdu », ce qui ferait
  // disparaître le raccourci vers « Closé ».
  const suivante = etapes
    .filter((e) => !e.is_lost && e.position > (etapeActuelle?.position ?? 0))
    .sort((a, b) => a.position - b.position)[0]

  function agir(fn: () => Promise<{ ok: true } | { ok: false; erreur: string }>) {
    demarrer(async () => {
      const r = await fn()
      if (r.ok) { setErreur(''); setPanneau('aucun'); router.refresh() }
      else setErreur(r.erreur)
    })
  }

  return (
    <div className="space-y-4">
      {erreur && (
        <div className="apparait rounded-lg border border-danger/30 bg-danger/8 px-3 py-2">
          <p className="text-sm text-danger">{erreur}</p>
        </div>
      )}

      {/* ------------------------------------------------------ faire avancer */}
      <Carte className="p-4">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-texte-faible">
          Faire avancer
        </h2>

        <div className="space-y-2">
          {/* Closer ouvre la même saisie que « Ma journée » : montants, TVA,
              échéancier, commission. Un seul parcours de closing. */}
          {!etapeActuelle?.is_won && !etapeActuelle?.is_lost && (
            <BoutonCloser
              opportuniteId={opportunite.id}
              contact={nomContact}
              variante="principal"
            />
          )}

          {suivante && !suivante.is_won && (
            <button
              onClick={() => agir(() => deplacerEtape(opportunite.id, suivante.id))}
              className={`${styleBoutonDoux} w-full`}
            >
              Passer en « {suivante.label} »
            </button>
          )}

          <select
            value={opportunite.stage_id}
            onChange={(e) => {
              const cible = etapes.find((s) => s.id === e.target.value)
              if (cible?.is_lost) setPanneau('perdue')
              else agir(() => deplacerEtape(opportunite.id, e.target.value))
            }}
            className={styleChamp}
          >
            {etapes.map((e) => (
              <option key={e.id} value={e.id}>{e.label}</option>
            ))}
          </select>

          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setPanneau(panneau === 'rdv' ? 'aucun' : 'rdv')} className={styleBoutonDoux}>
              Poser un RDV
            </button>
            <button onClick={() => setPanneau(panneau === 'chiffrage' ? 'aucun' : 'chiffrage')} className={styleBoutonDoux}>
              Chiffrer
            </button>
          </div>

          <button
            onClick={() => setPanneau(panneau === 'perdue' ? 'aucun' : 'perdue')}
            className="w-full rounded-lg border border-bordure px-3.5 py-2 text-sm text-texte-doux transition hover:border-danger/50 hover:text-danger"
          >
            Marquer perdue
          </button>
        </div>

        {/* --------------------------------------------------- panneau RDV */}
        {panneau === 'rdv' && (
          <form
            action={(fd) => agir(() => creerRdv(fd))}
            className="apparait mt-3 space-y-2 border-t border-bordure pt-3"
          >
            <input type="hidden" name="opportunity_id" value={opportunite.id} />
            <input type="hidden" name="contact_id" value={contactId} />

            <select name="kind" className={styleChamp} defaultValue="closing">
              <option value="setting">RDV setting</option>
              <option value="closing">RDV closing</option>
              <option value="suivi">Suivi</option>
            </select>
            <input name="scheduled_at" type="datetime-local" required className={styleChamp} />
            <select name="host_id" className={styleChamp} defaultValue={opportunite.closer_id ?? moi}>
              {profils.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
            <input name="location" placeholder="Lien visio ou téléphone" className={styleChamp} />
            <button type="submit" className={`${styleBouton} w-full`}>Poser le RDV</button>
          </form>
        )}

        {/* --------------------------------------------- panneau chiffrage */}
        {panneau === 'chiffrage' && (
          <form
            action={(fd) => agir(() => majOpportunite(opportunite.id, fd))}
            className="apparait mt-3 space-y-2 border-t border-bordure pt-3"
          >
            <div>
              <label className="mb-1 block text-xs text-texte-doux">Montant proposé</label>
              <input
                name="amount_proposed" type="number" step="10" placeholder="1990"
                defaultValue={opportunite.amount_proposed ?? ''} className={styleChamp}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-texte-doux">Montant signé</label>
              <input
                name="amount_signed" type="number" step="10"
                defaultValue={opportunite.amount_signed ?? ''} className={styleChamp}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-texte-doux">Mode de paiement</label>
              <select name="payment_plan" className={styleChamp} defaultValue={opportunite.payment_plan ?? ''}>
                <option value="">—</option>
                <option value="1x">One shot</option>
                <option value="2x">2 fois</option>
                <option value="3x">3 fois</option>
                <option value="4x">4 fois</option>
                <option value="autre">Autre</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-texte-doux">Encaissé sur</label>
              <div className="grid grid-cols-2 gap-2">
                <select name="payment_processor" className={styleChamp} defaultValue={opportunite.payment_processor ?? ''}>
                  <option value="">Processeur…</option>
                  <option value="mollie">Mollie</option>
                  <option value="stripe">Stripe</option>
                  <option value="virement">Virement</option>
                  <option value="especes">Espèces</option>
                  <option value="autre">Autre</option>
                </select>
                <select name="legal_entity" className={styleChamp} defaultValue={opportunite.legal_entity ?? ''}>
                  <option value="">Entité…</option>
                  <option value="auto">Auto-entreprise</option>
                  <option value="sasu">SASU</option>
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-texte-doux">Setter</label>
              <select name="setter_id" className={styleChamp} defaultValue={opportunite.setter_id ?? ''}>
                <option value="">—</option>
                {profils.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-texte-doux">Closer</label>
              <select name="closer_id" className={styleChamp} defaultValue={opportunite.closer_id ?? ''}>
                <option value="">—</option>
                {profils.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            </div>

            <label className="flex items-center gap-2 text-sm text-texte-doux">
              <input type="checkbox" name="setter_paid" defaultChecked={opportunite.setter_paid} className="accent-succes" />
              Commission du setter versée
            </label>
            <label className="flex items-center gap-2 text-sm text-texte-doux">
              <input type="checkbox" name="is_nurturing" defaultChecked={opportunite.is_nurturing} className="accent-violet" />
              Nurturing
            </label>
            <label className="flex items-center gap-2 text-sm text-texte-doux">
              <input type="checkbox" name="is_disqualified" defaultChecked={opportunite.is_disqualified} className="accent-danger" />
              Hors ICP — exclure des taux de conversion
            </label>

            <button type="submit" className={`${styleBouton} w-full`}>Enregistrer</button>
          </form>
        )}

        {/* ------------------------------------------------ panneau perdue */}
        {panneau === 'perdue' && (
          <form
            action={(fd) =>
              agir(() =>
                marquerPerdue(
                  opportunite.id,
                  String(fd.get('motif') ?? ''),
                  String(fd.get('note') ?? ''),
                ),
              )
            }
            className="apparait mt-3 space-y-2 border-t border-bordure pt-3"
          >
            <p className="text-xs text-texte-faible">
              Le motif est obligatoire — c&apos;est lui qui rend les pertes analysables.
            </p>
            <select name="motif" required className={styleChamp} defaultValue="">
              <option value="" disabled>Motif de perte…</option>
              {motifs.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            <textarea name="note" rows={2} placeholder="Précision (facultatif)" className={styleChamp} />
            <button
              type="submit"
              className="w-full rounded-lg bg-danger px-3.5 py-2 text-sm font-medium text-white transition hover:opacity-90"
            >
              Confirmer la perte
            </button>
          </form>
        )}
      </Carte>

      {/* ------------------------------------------------------------ relances */}
      <Carte className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-medium uppercase tracking-wide text-texte-faible">Relances</h2>
          <button
            onClick={() => setPanneau(panneau === 'relance' ? 'aucun' : 'relance')}
            className="text-xs text-altitude hover:underline"
          >
            {panneau === 'relance' ? 'Fermer' : 'Ajouter'}
          </button>
        </div>

        {panneau === 'relance' && (
          <form
            action={(fd) => agir(() => creerTache(fd))}
            className="apparait mb-3 space-y-2"
          >
            <input type="hidden" name="opportunity_id" value={opportunite.id} />
            <input type="hidden" name="contact_id" value={contactId} />
            <input name="title" placeholder="Relancer par email" required className={styleChamp} />
            <input name="due_at" type="datetime-local" required className={styleChamp} />
            <select name="assignee_id" className={styleChamp} defaultValue={moi}>
              {profils.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
            <button type="submit" className={`${styleBouton} w-full`}>Créer</button>
          </form>
        )}

        {!taches.length ? (
          <p className="text-sm text-texte-faible">Aucune relance en attente.</p>
        ) : (
          <ul className="space-y-2">
            {taches.map((t) => (
              <li key={t.id} className="flex items-start gap-2">
                <button
                  onClick={() => agir(() => terminerTache(t.id))}
                  title="Marquer comme faite"
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border border-bordure-forte transition hover:border-succes"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{t.title}</p>
                  <p className={`text-xs ${enRetard(t.due_at) ? 'text-danger' : 'text-texte-faible'}`}>
                    <span suppressHydrationWarning>{relatif(t.due_at)}</span>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Carte>

      {opportunite.is_disqualified && (
        <Badge className="w-full justify-center py-1.5">
          Exclue des taux de conversion
        </Badge>
      )}
    </div>
  )
}
