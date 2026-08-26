import { createClient } from '@/lib/supabase/server'
import { exigerIdentite } from '@/lib/session'
import { Carte, EnTetePage, Stat, Vide } from '@/components/ui'
import { FiltresDashboard } from '@/components/filtres-dashboard'
import { euros, pct } from '@/lib/format'
import type { PipelineStage } from '@/lib/database.types'

export const dynamic = 'force-dynamic'

const PERIODES: Record<string, { label: string; jours: number | null }> = {
  '30j': { label: '30 derniers jours', jours: 30 },
  '90j': { label: '90 derniers jours', jours: 90 },
  '12m': { label: '12 derniers mois', jours: 365 },
  tout: { label: 'Depuis le début', jours: null },
}

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string; source?: string; qui?: string }>
}) {
  const sp = await searchParams
  const periode = sp.periode && PERIODES[sp.periode] ? sp.periode : '90j'
  await exigerIdentite()
  const supabase = await createClient()

  const jours = PERIODES[periode].jours
  const depuis = jours ? new Date(Date.now() - jours * 86400_000).toISOString() : null

  const [etapesRes, reachRes, rdvRes, sourcesRes, profilsRes] = await Promise.all([
    supabase.from('pipeline_stages').select('*').eq('is_active', true).order('position'),
    supabase.from('v_opportunity_reach').select('*'),
    supabase.from('appointments').select('id, kind, status, scheduled_at, host_id, opportunity_id'),
    supabase.from('sources').select('id, label').eq('is_active', true).order('position'),
    supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
  ])

  const etapes = ((etapesRes.data ?? []) as PipelineStage[]).filter((e) => !e.is_lost)

  // Filtres appliqués côté serveur : les taux doivent pouvoir être découpés,
  // sinon on sait qu'il y a un problème mais pas où.
  let opps = (reachRes.data ?? []).filter((o) => !o.is_disqualified)
  if (depuis) opps = opps.filter((o) => o.created_at >= depuis)
  if (sp.source) opps = opps.filter((o) => o.source_id === sp.source)
  if (sp.qui) opps = opps.filter((o) => o.setter_id === sp.qui || o.closer_id === sp.qui)

  const idsRetenus = new Set(opps.map((o) => o.opportunity_id))
  let rdvs = (rdvRes.data ?? []).filter((r) => idsRetenus.has(r.opportunity_id))
  if (sp.qui) rdvs = rdvs.filter((r) => r.host_id === sp.qui)

  /* ------------------------------------------------------------- entonnoir */
  const entonnoir = etapes.map((e) => ({
    label: e.label,
    position: e.position,
    atteintes: opps.filter((o) => o.max_position_reached >= e.position).length,
  }))

  const base = entonnoir[0]?.atteintes ?? 0
  const maxEntonnoir = Math.max(...entonnoir.map((e) => e.atteintes), 1)

  /* ------------------------------------------------------------------ KPIs */
  const gagnees = opps.filter((o) => o.won_at)
  const caSigne = gagnees.reduce((s, o) => s + (o.amount_signed ?? 0), 0)

  const rdvAboutis = rdvs.filter((r) => r.status === 'honore' || r.status === 'no_show').length
  const rdvHonores = rdvs.filter((r) => r.status === 'honore').length

  // Le close rate ne peut se calculer que sur les opportunités dont le RDV est
  // tracé. Rapporter TOUTES les gagnées au nombre de RDV honorés donnerait un
  // taux supérieur à 100 % dès qu'une vente est enregistrée sans RDV — ce qui
  // est le cas de toutes les affaires reprises d'un historique.
  const oppAvecRdvHonore = new Set(
    rdvs.filter((r) => r.status === 'honore').map((r) => r.opportunity_id),
  )
  const gagneesAvecRdv = gagnees.filter((o) => oppAvecRdvHonore.has(o.opportunity_id))
  const gagneesSansRdv = gagnees.length - gagneesAvecRdv.length

  // Une vente importée porte la même date de création et de signature : son
  // cycle vaudrait 0 jour et tirerait la médiane vers le bas. On ne garde que
  // les ventes dont la durée est réellement mesurable.
  const cycles = gagnees
    .map((o) => (new Date(o.won_at!).getTime() - new Date(o.created_at).getTime()) / 86400_000)
    .filter((j) => j >= 0.04)
    .sort((a, b) => a - b)
  const cycleMedian = cycles.length ? cycles[Math.floor(cycles.length / 2)] : null

  /* -------------------------------------------------------- par source/qui */
  const parSource = (sourcesRes.data ?? []).map((s) => {
    const lot = opps.filter((o) => o.source_id === s.id)
    const g = lot.filter((o) => o.won_at)
    return {
      label: s.label,
      opportunites: lot.length,
      gagnees: g.length,
      ca: g.reduce((acc, o) => acc + (o.amount_signed ?? 0), 0),
    }
  }).filter((l) => l.opportunites > 0).sort((a, b) => b.ca - a.ca)

  const parPersonne = (profilsRes.data ?? []).map((p) => {
    const commeSetter = opps.filter((o) => o.setter_id === p.id)
    const commeCloser = opps.filter((o) => o.closer_id === p.id)
    const gagneesCloser = commeCloser.filter((o) => o.won_at)
    const rdvsPerso = (rdvRes.data ?? []).filter(
      (r) => r.host_id === p.id && idsRetenus.has(r.opportunity_id),
    )
    const aboutis = rdvsPerso.filter((r) => r.status === 'honore' || r.status === 'no_show').length
    const honores = rdvsPerso.filter((r) => r.status === 'honore').length
    return {
      nom: p.full_name,
      setting: commeSetter.length,
      closing: commeCloser.length,
      gagnees: gagneesCloser.length,
      showRate: aboutis ? pct(honores, aboutis) : '—',
      ca: gagneesCloser.reduce((s, o) => s + (o.amount_signed ?? 0), 0),
    }
  }).filter((l) => l.setting || l.closing)

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
      <EnTetePage
        titre="Dashboard"
        sous={`${PERIODES[periode].label} · ${opps.length} opportunité${opps.length > 1 ? 's' : ''} (hors ICP exclues)`}
      />

      <FiltresDashboard
        periodes={Object.entries(PERIODES).map(([v, p]) => ({ v, l: p.label }))}
        sources={sourcesRes.data ?? []}
        profils={profilsRes.data ?? []}
        periode={periode}
        source={sp.source ?? ''}
        qui={sp.qui ?? ''}
      />

      {!opps.length ? (
        <Vide
          titre="Pas encore de données"
          sous="Les taux se calculent sur les opportunités. Crée des contacts et fais-les avancer dans le pipeline."
        />
      ) : (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Show rate"
              valeur={rdvAboutis ? pct(rdvHonores, rdvAboutis) : '—'}
              detail={`${rdvHonores} honorés / ${rdvAboutis} aboutis`}
              ton={rdvAboutis && rdvHonores / rdvAboutis < 0.6 ? 'alerte' : undefined}
            />
            <Stat
              label="Close rate"
              valeur={rdvHonores ? pct(gagneesAvecRdv.length, rdvHonores) : '—'}
              detail={
                gagneesSansRdv > 0
                  ? `${gagneesAvecRdv.length} / ${rdvHonores} RDV honorés · ${gagneesSansRdv} vente(s) sans RDV tracé, exclues`
                  : `${gagneesAvecRdv.length} gagnées / ${rdvHonores} RDV honorés`
              }
            />
            <Stat
              label="Lead → vente"
              valeur={base ? pct(gagnees.length, base) : '—'}
              detail={`${gagnees.length} sur ${base} entrées`}
            />
            <Stat
              label="CA signé"
              valeur={euros(caSigne)}
              detail={gagnees.length ? `Panier moyen ${euros(caSigne / gagnees.length)}` : undefined}
              ton="succes"
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            {/* ------------------------------------------------- entonnoir */}
            <Carte className="p-4">
              <h2 className="mb-4 text-sm font-medium">Entonnoir de conversion</h2>
              <div className="space-y-2.5">
                {entonnoir.map((e, i) => {
                  const precedente = i > 0 ? entonnoir[i - 1].atteintes : null
                  return (
                    <div key={e.position}>
                      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                        <span className="truncate">{e.label}</span>
                        <span className="shrink-0 tabular-nums text-texte-doux">
                          {e.atteintes}
                          {precedente !== null && (
                            <span className={`ml-2 text-xs ${
                              precedente && e.atteintes / precedente < 0.5 ? 'text-alerte' : 'text-texte-faible'
                            }`}>
                              {pct(e.atteintes, precedente)}
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                        <div
                          className="h-full rounded-full bg-altitude transition-all"
                          style={{ width: `${Math.max((e.atteintes / maxEntonnoir) * 100, e.atteintes ? 2 : 0)}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="mt-4 text-xs text-texte-faible">
                Le pourcentage compare chaque étape à la précédente. Une chute marquée
                indique où corriger.
              </p>
            </Carte>

            {/* ---------------------------------------------------- délais */}
            <div className="space-y-3">
              <Stat
                label="Délai de cycle médian"
                valeur={cycleMedian !== null ? `${Math.round(cycleMedian)} j` : '—'}
                detail={
                  cycleMedian !== null
                    ? `Création → signature · sur ${cycles.length} vente(s) datée(s)`
                    : 'Aucune vente avec une durée mesurable'
                }
              />
              <Stat
                label="Opportunités ouvertes"
                valeur={String(opps.filter((o) => !o.won_at && !o.lost_at).length)}
                detail={`${opps.filter((o) => o.lost_at).length} perdues sur la période`}
              />
            </div>
          </div>

          {/* --------------------------------------------------- par source */}
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <TableauCompact
              titre="Par source"
              colonnes={['Source', 'Opp.', 'Gagnées', 'CA']}
              lignes={parSource.map((s) => [
                s.label,
                String(s.opportunites),
                `${s.gagnees} (${pct(s.gagnees, s.opportunites)})`,
                euros(s.ca),
              ])}
              vide="Aucune source renseignée sur la période."
            />

            <TableauCompact
              titre="Par personne"
              colonnes={['Nom', 'Setting', 'Closing', 'Show', 'CA']}
              lignes={parPersonne.map((p) => [
                p.nom,
                String(p.setting),
                `${p.gagnees}/${p.closing}`,
                p.showRate,
                euros(p.ca),
              ])}
              vide="Aucune opportunité assignée sur la période."
            />
          </div>
        </>
      )}
    </div>
  )
}

function TableauCompact({
  titre,
  colonnes,
  lignes,
  vide,
}: {
  titre: string
  colonnes: string[]
  lignes: string[][]
  vide: string
}) {
  return (
    <Carte className="overflow-hidden">
      <h2 className="border-b border-bordure px-4 py-3 text-sm font-medium">{titre}</h2>
      {!lignes.length ? (
        <p className="px-4 py-8 text-center text-sm text-texte-faible">{vide}</p>
      ) : (
        <div className="scroll-fin overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bordure text-left text-xs text-texte-faible">
                {colonnes.map((c, i) => (
                  <th key={c} className={`px-4 py-2 font-medium ${i > 0 ? 'text-right' : ''}`}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-bordure">
              {lignes.map((l, i) => (
                <tr key={i}>
                  {l.map((v, j) => (
                    <td key={j} className={`px-4 py-2 ${j > 0 ? 'text-right tabular-nums text-texte-doux' : ''}`}>
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Carte>
  )
}
