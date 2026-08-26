import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { exigerIdentite, profilCourant } from '@/lib/session'
import { Carte, Badge } from '@/components/ui'
import { PanneauContact } from '@/components/panneau-contact'
import { Timeline, type Evenement } from '@/components/timeline'
import { BlocAction } from '@/components/bloc-action'
import { RelanceWhatsApp } from '@/components/relance-whatsapp'
import { Echeancier } from '@/components/echeancier'
import { SuppressionContact } from '@/components/suppression-contact'
import { euros, nomContact, LIBELLE_ICP } from '@/lib/format'
import type { PipelineStage } from '@/lib/database.types'

export const dynamic = 'force-dynamic'

export default async function FicheOpportunite({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const moi = await exigerIdentite()
  const supabase = await createClient()

  const { data: opp } = await supabase
    .from('opportunities')
    .select(`
      *,
      contacts(*),
      pipeline_stages(*),
      sources(label),
      lost_reasons(label),
      setter:profiles!opportunities_setter_id_fkey(id, full_name),
      closer:profiles!opportunities_closer_id_fkey(id, full_name)
    `)
    .eq('id', id)
    .maybeSingle()

  if (!opp) notFound()

  const contact = opp.contacts as unknown as {
    id: string; full_name: string; email: string | null
    phone: string | null; company: string | null
    main_pain: string | null; icp: string; notes: string | null
  }
  const etape = opp.pipeline_stages as unknown as PipelineStage

  const [profil, activites, rdvs, transitions, etapes, motifs, profils, taches, echeances] = await Promise.all([
    // Déjà chargé par le layout et mémorisé pour la requête : aucun
    // aller-retour supplémentaire.
    profilCourant(),
    supabase
      .from('activities')
      .select('*')
      .eq('contact_id', contact.id)
      .order('occurred_at', { ascending: false }),
    supabase
      // appointments a deux FK vers profiles (host_id, created_by) : il faut nommer laquelle.
      .from('appointments')
      .select('*, hote:profiles!appointments_host_id_fkey(full_name)')
      .eq('opportunity_id', id)
      .order('scheduled_at', { ascending: false }),
    supabase
      .from('stage_transitions')
      .select('*, de:pipeline_stages!stage_transitions_from_stage_id_fkey(label), vers:pipeline_stages!stage_transitions_to_stage_id_fkey(label), profiles(full_name)')
      .eq('opportunity_id', id)
      .order('changed_at', { ascending: false }),
    supabase.from('pipeline_stages').select('*').eq('is_active', true).order('position'),
    supabase.from('lost_reasons').select('*').eq('is_active', true).order('position'),
    supabase.from('profiles').select('id, full_name, role').eq('is_active', true).order('full_name'),
    supabase.from('tasks').select('*').eq('opportunity_id', id).eq('status', 'a_faire').order('due_at'),
    supabase.from('payments').select('*').eq('opportunity_id', id).order('installment_no'),
  ])

  const evenements: Evenement[] = [
    ...(activites.data ?? []).map((a) => ({
      genre: 'activite' as const,
      id: a.id,
      quand: a.occurred_at,
      type: a.type,
      direction: a.direction,
      outcome: a.outcome,
      contenu: a.content,
      auteur: a.author_name,
    })),
    ...(rdvs.data ?? []).map((r) => ({
      genre: 'rdv' as const,
      id: r.id,
      quand: r.scheduled_at,
      kind: r.kind,
      statut: r.status,
      hote: (r.hote as unknown as { full_name: string } | null)?.full_name ?? null,
      opportuniteId: id,
    })),
    ...(transitions.data ?? []).map((t) => ({
      genre: 'etape' as const,
      id: String(t.id),
      quand: t.changed_at,
      de: (t.de as unknown as { label: string } | null)?.label ?? null,
      vers: (t.vers as unknown as { label: string } | null)?.label ?? '—',
      auteur: (t.profiles as unknown as { full_name: string } | null)?.full_name ?? null,
      secondes: t.seconds_in_previous_stage,
    })),
  ].sort((a, b) => new Date(b.quand).getTime() - new Date(a.quand).getTime())

  const montant = opp.amount_signed ?? opp.amount_proposed
  const setter = opp.setter as unknown as { full_name: string } | null
  const closer = opp.closer as unknown as { full_name: string } | null
  // Dédoublonné : « Noé → Noé » n'apprend rien quand la même personne
  // porte le setting et le closing.
  const porteurs = [...new Set([setter?.full_name, closer?.full_name].filter(Boolean))]
  const motifPerte = opp.lost_reasons as unknown as { label: string } | null

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6">
      {/* ------------------------------------------------------------ en-tête */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{nomContact(contact)}</h1>
            <Badge ton={etape.is_won ? 'succes' : etape.is_lost ? 'danger' : 'altitude'}>
              {etape.label}
            </Badge>
            {opp.is_no_show && <Badge ton="danger">No-show</Badge>}
            {opp.is_nurturing && <Badge ton="violet">Nurturing</Badge>}
            {opp.is_disqualified && <Badge>Hors ICP — exclue des taux</Badge>}
          </div>
          <p className="mt-1 text-sm text-texte-doux">
            {contact.company ?? 'Entreprise inconnue'}
            {porteurs.length ? ` · ${porteurs.join(' → ')}` : ''}
          </p>
        </div>

        <div className="text-right">
          <p className="text-2xl font-semibold tabular-nums tracking-tight">{euros(montant)}</p>
          <p className="text-xs text-texte-faible">
            {opp.amount_signed ? `Signé${opp.payment_plan ? ` · ${opp.payment_plan}` : ''}` : 'Proposé'}
          </p>
        </div>
      </div>

      {etape.is_lost && motifPerte && (
        <Carte className="mb-5 border-danger/25 bg-danger/5 p-3">
          <p className="text-sm">
            <span className="text-danger">Perdue</span>
            <span className="text-texte-doux"> — {motifPerte.label}</span>
            {opp.lost_note && <span className="text-texte-faible"> · {opp.lost_note}</span>}
          </p>
        </Carte>
      )}

      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)_320px]">
        <PanneauContact contact={contact} libelleIcp={LIBELLE_ICP[contact.icp] ?? contact.icp} />

        <Timeline
          evenements={evenements}
          contactId={contact.id}
          opportuniteId={id}
        />

        <div className="space-y-4">
          <Echeancier echeances={echeances.data ?? []} />

          <RelanceWhatsApp
            opportuniteId={id}
            contactId={contact.id}
            telephone={contact.phone}
            cleIaPresente={!!process.env.OPENAI_API_KEY}
          />

          <BlocAction
            opportunite={{
              id,
              stage_id: opp.stage_id,
              amount_proposed: opp.amount_proposed,
              amount_signed: opp.amount_signed,
              payment_plan: opp.payment_plan,
              payment_processor: opp.payment_processor,
              legal_entity: opp.legal_entity,
              setter_paid: opp.setter_paid,
              is_nurturing: opp.is_nurturing,
              is_disqualified: opp.is_disqualified,
              setter_id: opp.setter_id,
              closer_id: opp.closer_id,
            }}
            contactId={contact.id}
            nomContact={nomContact(contact)}
            etapes={(etapes.data ?? []) as PipelineStage[]}
            motifs={motifs.data ?? []}
            profils={profils.data ?? []}
            taches={taches.data ?? []}
            moi={moi.id}
          />

          {profil.role === 'admin' && (
            <Carte className="p-4">
              <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-texte-faible">
                Zone sensible
              </h2>
              <p className="mb-3 text-xs text-texte-faible">
                Efface le contact et tout son historique. Irréversible.
              </p>
              <SuppressionContact
                contactId={contact.id}
                nom={nomContact(contact)}
                variante="bouton"
                apresSuppression="liste"
              />
            </Carte>
          )}
        </div>
      </div>
    </div>
  )
}
