'use client'

import { useState, useOptimistic, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { deplacerEtape } from '@/app/actions'
import { createClient } from '@/lib/supabase/client'
import { euros, nomContact } from '@/lib/format'
import { Badge, styleChamp, styleChampInline } from '@/components/ui'
import type { PipelineStage } from '@/lib/database.types'
import type { CarteOpportunite } from '@/app/(app)/pipeline/page'

const CLE_PLI = 'crm-altitude:colonnes-repliees'

export function Kanban({
  etapes,
  cartes,
  profils,
  sources,
  filtreQui,
  filtreSource,
}: {
  etapes: PipelineStage[]
  cartes: CarteOpportunite[]
  profils: { id: string; full_name: string }[]
  sources: { id: string; label: string }[]
  moi: string
  filtreQui: string
  filtreSource: string
}) {
  const router = useRouter()
  const [enTransition, demarrer] = useTransition()
  const [enDeplacement, setEnDeplacement] = useState<CarteOpportunite | null>(null)
  const [erreur, setErreur] = useState('')

  // Le pli des colonnes survit au rechargement : c'est un réglage d'espace de
  // travail, pas un état de session.
  const [repliees, setRepliees] = useState<Set<string>>(new Set())
  const [pliChargé, setPliChargé] = useState(false)

  useEffect(() => {
    try {
      const brut = localStorage.getItem(CLE_PLI)
      if (brut) setRepliees(new Set(JSON.parse(brut) as string[]))
    } catch { /* réglage d'affichage : son absence n'est pas une erreur */ }
    setPliChargé(true)
  }, [])

  function basculerPli(cle: string) {
    setRepliees((actuel) => {
      const suivant = new Set(actuel)
      if (suivant.has(cle)) suivant.delete(cle)
      else suivant.add(cle)
      try { localStorage.setItem(CLE_PLI, JSON.stringify([...suivant])) } catch { /* idem */ }
      return suivant
    })
  }

  // Le déplacement s'affiche immédiatement ; si le serveur refuse, on revient
  // à l'état réel et on explique pourquoi.
  const [vue, deplacerLocal] = useOptimistic(
    cartes,
    (etat, { id, versEtape }: { id: string; versEtape: string }) =>
      etat.map((c) => (c.id === id ? { ...c, stage_id: versEtape } : c)),
  )

  // Le kanban se met à jour quand un collègue bouge une carte. Le refresh est
  // temporisé : sans ça, un déplacement déclenche plusieurs événements Postgres
  // d'affilée et autant de rechargements complets, ce qui fait sauter l'écran.
  useEffect(() => {
    const supabase = createClient()
    let minuteur: ReturnType<typeof setTimeout> | undefined

    const canal = supabase
      .channel('pipeline')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'opportunities' }, () => {
        clearTimeout(minuteur)
        minuteur = setTimeout(() => router.refresh(), 600)
      })
      .subscribe()

    return () => {
      clearTimeout(minuteur)
      void supabase.removeChannel(canal)
    }
  }, [router])

  const capteurs = useSensors(
    // 6 px de tolérance : un clic sur la carte ouvre la fiche au lieu de la traîner.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  function debut(e: DragStartEvent) {
    setEnDeplacement(vue.find((c) => c.id === e.active.id) ?? null)
  }

  function fin(e: DragEndEvent) {
    setEnDeplacement(null)
    const versEtape = e.over?.id as string | undefined
    if (!versEtape) return

    const carte = vue.find((c) => c.id === e.active.id)
    if (!carte || carte.stage_id === versEtape) return

    setErreur('')
    demarrer(async () => {
      deplacerLocal({ id: carte.id, versEtape })
      const r = await deplacerEtape(carte.id, versEtape)
      if (!r.ok) {
        setErreur(r.erreur)
        router.refresh()
      }
    })
  }

  function filtrer(champ: 'qui' | 'source', valeur: string) {
    const p = new URLSearchParams(window.location.search)
    if (valeur) p.set(champ, valeur)
    else p.delete(champ)
    // replace + scroll:false : filtrer n'est pas une navigation, ça ne doit ni
    // empiler l'historique ni renvoyer l'utilisateur en haut de page.
    demarrer(() => router.replace(`/pipeline?${p.toString()}`, { scroll: false }))
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={filtreQui}
          onChange={(e) => filtrer('qui', e.target.value)}
          className={styleChampInline}
        >
          <option value="">Toute l&apos;équipe</option>
          {profils.map((p) => (
            <option key={p.id} value={p.id}>{p.full_name}</option>
          ))}
        </select>

        <select
          value={filtreSource}
          onChange={(e) => filtrer('source', e.target.value)}
          className={styleChampInline}
        >
          <option value="">Toutes les sources</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>

        {enTransition && (
          <span className="text-xs text-texte-faible">Mise à jour…</span>
        )}

        {erreur && (
          <p className="apparait rounded-lg border border-danger/30 bg-danger/8 px-3 py-1.5 text-sm text-danger">
            {erreur}
          </p>
        )}
      </div>

      {/* id explicite : sans lui dnd-kit numérote ses aria-describedby avec un
          compteur de module qui diverge entre le rendu serveur et le rendu
          client, ce qui casse l'hydratation. */}
      <DndContext id="kanban-pipeline" sensors={capteurs} onDragStart={debut} onDragEnd={fin}>
        <div className="scroll-fin flex flex-1 gap-3 overflow-x-auto pb-6">
          {etapes.map((etape) => (
            <Colonne
              key={etape.id}
              etape={etape}
              cartes={vue.filter((c) => c.stage_id === etape.id)}
              equipeMultiple={profils.length > 1}
              repliee={pliChargé && repliees.has(etape.key)}
              onBasculer={() => basculerPli(etape.key)}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {enDeplacement && <Carte carte={enDeplacement} survol equipeMultiple={profils.length > 1} />}
        </DragOverlay>
      </DndContext>
    </>
  )
}

function Colonne({
  etape,
  cartes,
  equipeMultiple,
  repliee,
  onBasculer,
}: {
  etape: PipelineStage
  cartes: CarteOpportunite[]
  equipeMultiple: boolean
  repliee: boolean
  onBasculer: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: etape.id })

  const total = cartes.reduce((s, c) => s + (c.amount_signed ?? c.amount_proposed ?? 0), 0)
  const pastille = etape.is_won ? 'bg-succes' : etape.is_lost ? 'bg-danger' : 'bg-altitude'

  // Repliée, la colonne reste une cible de dépôt : on doit pouvoir y glisser
  // une carte sans avoir à la déplier d'abord.
  if (repliee) {
    return (
      <div className="flex w-11 shrink-0 flex-col">
        <button
          onClick={onBasculer}
          title={`Déplier « ${etape.label} »`}
          className="mb-2 flex h-6 items-center justify-center rounded text-texte-faible transition hover:bg-surface hover:text-texte"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>

        <div
          ref={setNodeRef}
          onClick={onBasculer}
          className={`flex flex-1 cursor-pointer flex-col items-center gap-3 rounded-xl border py-3 transition ${
            isOver ? 'border-altitude/50 bg-altitude/5' : 'border-bordure bg-surface/40 hover:bg-surface/70'
          }`}
        >
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${pastille}`} />
          <span className="text-xs font-medium tabular-nums text-texte-doux">{cartes.length}</span>
          <span
            className="whitespace-nowrap text-xs font-medium text-texte-doux"
            style={{ writingMode: 'vertical-rl' }}
          >
            {etape.label}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex w-[264px] shrink-0 flex-col">
      <div className="mb-2 flex items-baseline gap-1.5 px-1">
        <button
          onClick={onBasculer}
          title={`Réduire « ${etape.label} »`}
          className="-ml-1 flex h-5 w-5 shrink-0 items-center justify-center self-center rounded text-texte-faible transition hover:bg-surface hover:text-texte"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <span className={`h-1.5 w-1.5 shrink-0 self-center rounded-full ${pastille}`} />
        <h2 className="truncate text-sm font-medium">{etape.label}</h2>
        <span className="text-xs tabular-nums text-texte-faible">{cartes.length}</span>
        {total > 0 && (
          <span className="ml-auto shrink-0 text-xs tabular-nums text-texte-faible">
            {euros(total)}
          </span>
        )}
      </div>

      <div
        ref={setNodeRef}
        className={`scroll-fin flex-1 space-y-2 overflow-y-auto rounded-xl border p-2 transition ${
          isOver ? 'border-altitude/50 bg-altitude/5' : 'border-bordure bg-surface/40'
        }`}
      >
        {cartes.map((c) => (
          <Carte key={c.id} carte={c} equipeMultiple={equipeMultiple} />
        ))}
        {!cartes.length && (
          <p className="px-2 py-6 text-center text-xs text-texte-faible">Vide</p>
        )}
      </div>
    </div>
  )
}

function Carte({
  carte,
  survol = false,
  equipeMultiple = false,
}: {
  carte: CarteOpportunite
  survol?: boolean
  equipeMultiple?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: carte.id,
  })

  const porteurs = [...new Set([carte.setter, carte.closer].filter(Boolean))] as string[]
  const montant = carte.amount_signed ?? carte.amount_proposed

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={`cursor-grab touch-none rounded-lg border bg-surface p-2.5 transition active:cursor-grabbing ${
        survol ? 'rotate-1 border-altitude/60 shadow-2xl' : 'border-bordure hover:border-bordure-forte'
      } ${isDragging && !survol ? 'opacity-30' : ''}`}
    >
      <a
        href={`/opportunites/${carte.id}`}
        onClick={(e) => e.stopPropagation()}
        draggable={false}
        className="block truncate text-sm font-medium hover:text-altitude"
      >
        {nomContact(carte.contact)}
      </a>

      {carte.contact?.company && (
        <p className="mt-0.5 truncate text-xs text-texte-faible">{carte.contact.company}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1">
        {montant ? <Badge ton="altitude">{euros(montant)}</Badge> : null}
        {carte.is_no_show && <Badge ton="danger">No-show</Badge>}
        {carte.is_nurturing && <Badge ton="violet">Nurturing</Badge>}
        {carte.is_disqualified && <Badge>Hors ICP</Badge>}
      </div>

      {/* Dédoublonné : quand la même personne porte le setting et le closing,
          « Noé → Noé » n'apprend rien. Masqué si une seule personne travaille. */}
      {porteurs.length > 0 && equipeMultiple && (
        <p className="mt-1.5 truncate text-xs text-texte-faible">{porteurs.join(' → ')}</p>
      )}
    </div>
  )
}
