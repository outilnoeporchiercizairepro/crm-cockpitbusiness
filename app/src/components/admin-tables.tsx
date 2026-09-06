'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { majLigneConfig, creerLigneConfig } from '@/app/actions'
import { normaliserCle } from '@/lib/codes'
import { Carte, Badge, styleChamp, styleBouton } from '@/components/ui'
import { TONS, FOND_TON, BORDURE_TON } from '@/lib/tons'
import type { TonSource } from '@/lib/database.types'

type LigneConfig = {
  id: string
  key: string
  label: string
  position: number
  is_active: boolean
  is_won?: boolean
  is_lost?: boolean
  color?: TonSource
}

export function TableConfig({
  table,
  titre,
  aide,
  lignes,
  creation,
}: {
  table: 'pipeline_stages' | 'sources' | 'lost_reasons'
  titre: string
  aide: string
  lignes: LigneConfig[]
  creation: boolean
}) {
  const router = useRouter()
  const [, demarrer] = useTransition()
  const [erreur, setErreur] = useState('')
  const [nouveau, setNouveau] = useState('')
  const [nouveauCode, setNouveauCode] = useState('')

  // Les codes d'étapes sont lus en dur par l'app et par la fonction d'entrée
  // n8n : les laisser modifier casserait la prise de RDV en silence.
  const codeModifiable = table !== 'pipeline_stages'
  // Sources et étapes s'affichent en étiquette dans tout le CRM ; les motifs
  // de perte n'apparaissent qu'en texte, une couleur n'y servirait à rien.
  const couleurModifiable = table === 'sources' || table === 'pipeline_stages'

  function agir(fn: () => Promise<{ ok: true } | { ok: false; erreur: string }>) {
    demarrer(async () => {
      const r = await fn()
      if (r.ok) { setErreur(''); router.refresh() }
      else setErreur(r.erreur)
    })
  }

  return (
    <Carte className="overflow-hidden">
      <div className="border-b border-bordure px-4 py-3">
        <h2 className="text-sm font-medium">{titre}</h2>
        <p className="mt-1 text-xs text-texte-faible">{aide}</p>
      </div>

      {erreur && <p className="border-b border-bordure bg-danger/8 px-4 py-2 text-sm text-danger">{erreur}</p>}

      <ul className="divide-y divide-bordure">
        {lignes.map((l) => (
          <li key={l.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="w-7 shrink-0 text-xs tabular-nums text-texte-faible">{l.position}</span>

            <input
              defaultValue={l.label}
              onBlur={(e) => {
                if (e.target.value !== l.label && e.target.value.trim()) {
                  agir(() => majLigneConfig(table, l.id, { label: e.target.value.trim() }))
                }
              }}
              className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-2 py-1 text-sm outline-none transition hover:border-bordure focus:border-altitude"
            />

            {codeModifiable ? (
              <input
                defaultValue={l.key}
                title="Code envoyé par n8n et les imports CSV"
                onBlur={(e) => {
                  const voulu = normaliserCle(e.target.value)
                  if (voulu === l.key) { e.target.value = l.key; return }
                  if (!voulu) {
                    e.target.value = l.key
                    setErreur('Code invalide : lettres et chiffres uniquement.')
                    return
                  }
                  agir(() => majLigneConfig(table, l.id, { key: voulu }))
                }}
                className="w-28 shrink-0 rounded border border-transparent bg-transparent px-2 py-1 font-mono text-xs text-texte-faible outline-none transition hover:border-bordure focus:border-altitude focus:text-texte"
              />
            ) : (
              <code className="hidden shrink-0 text-xs text-texte-faible sm:block">{l.key}</code>
            )}

            {l.is_won && <Badge ton="succes">Gagné</Badge>}
            {l.is_lost && <Badge ton="danger">Perdu</Badge>}

            {couleurModifiable && (
              <div className="flex shrink-0 items-center gap-1">
                {TONS.map((t) => {
                  const choisi = l.color === t.ton
                  return (
                    <button
                      key={t.ton}
                      title={t.nom}
                      aria-label={`Étiquette ${t.nom}`}
                      aria-pressed={choisi}
                      onClick={() => agir(() => majLigneConfig(table, l.id, { color: t.ton }))}
                      className={`h-4 w-4 rounded-full border transition ${BORDURE_TON[t.ton]} ${FOND_TON[t.ton]} ${
                        choisi
                          ? 'ring-2 ring-texte-doux ring-offset-1 ring-offset-surface'
                          : 'opacity-60 hover:opacity-100'
                      }`}
                    />
                  )
                })}
              </div>
            )}

            {couleurModifiable && (
              <Badge ton={l.color ?? 'altitude'} className="hidden shrink-0 md:inline-flex">
                {l.label}
              </Badge>
            )}

            <button
              onClick={() => agir(() => majLigneConfig(table, l.id, { is_active: !l.is_active }))}
              className={`shrink-0 rounded px-2 py-0.5 text-xs transition ${
                l.is_active
                  ? 'bg-succes/12 text-succes hover:bg-succes/20'
                  : 'bg-surface-2 text-texte-faible hover:bg-bordure'
              }`}
            >
              {l.is_active ? 'Actif' : 'Inactif'}
            </button>
          </li>
        ))}
      </ul>

      {creation && (
        <div className="flex flex-wrap gap-2 border-t border-bordure p-3">
          <input
            value={nouveau}
            onChange={(e) => setNouveau(e.target.value)}
            placeholder="Nouveau libellé…"
            className={`${styleChamp} min-w-40 flex-1`}
          />
          <input
            value={nouveauCode}
            onChange={(e) => setNouveauCode(e.target.value)}
            placeholder="code"
            title="Laisse vide pour le dériver du libellé"
            className={`${styleChamp} w-28 shrink-0 font-mono`}
          />
          <button
            disabled={!nouveau.trim()}
            onClick={() =>
              agir(async () => {
                const r = await creerLigneConfig(
                  table as 'sources' | 'lost_reasons',
                  nouveau.trim(),
                  nouveauCode.trim() || undefined,
                )
                if (r.ok) { setNouveau(''); setNouveauCode('') }
                return r
              })
            }
            className={styleBouton}
          >
            Ajouter
          </button>
          <p className="w-full text-xs text-texte-faible">
            Code enregistré :{' '}
            <code className="text-texte-doux">
              {normaliserCle(nouveauCode.trim() || nouveau) || '—'}
            </code>
            {' · '}laisse le champ vide pour le dériver du libellé.
          </p>
        </div>
      )}
    </Carte>
  )
}
