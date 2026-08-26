import { createClient } from '@/lib/supabase/server'
import { exigerIdentite } from '@/lib/session'
import { Kanban } from '@/components/kanban'
import { EnTetePage } from '@/components/ui'
import type { PipelineStage } from '@/lib/database.types'

export const dynamic = 'force-dynamic'

export type CarteOpportunite = {
  id: string
  stage_id: string
  amount_proposed: number | null
  amount_signed: number | null
  is_no_show: boolean
  is_nurturing: boolean
  is_disqualified: boolean
  created_at: string
  contact: { full_name: string; company: string | null } | null
  setter: string | null
  closer: string | null
  source: string | null
}

export default async function Pipeline({
  searchParams,
}: {
  searchParams: Promise<{ qui?: string; source?: string }>
}) {
  const { qui, source } = await searchParams
  const moi = await exigerIdentite()
  const supabase = await createClient()

  const [etapesRes, oppsRes, profilsRes, sourcesRes] = await Promise.all([
    supabase.from('pipeline_stages').select('*').eq('is_active', true).order('position'),
    supabase
      .from('opportunities')
      .select(`
        id, stage_id, amount_proposed, amount_signed,
        is_no_show, is_nurturing, is_disqualified, created_at, setter_id, closer_id,
        contacts(full_name, company),
        setter:profiles!opportunities_setter_id_fkey(full_name),
        closer:profiles!opportunities_closer_id_fkey(full_name),
        sources(label)
      `)
      .order('created_at', { ascending: false }),
    supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
    supabase.from('sources').select('id, label').eq('is_active', true).order('position'),
  ])

  const etapes = (etapesRes.data ?? []) as PipelineStage[]

  let brut = oppsRes.data ?? []
  if (qui) brut = brut.filter((o) => o.setter_id === qui || o.closer_id === qui)
  if (source) brut = brut.filter((o) => (o as { source_id?: string }).source_id === source)

  const cartes: CarteOpportunite[] = brut.map((o) => ({
    id: o.id,
    stage_id: o.stage_id,
    amount_proposed: o.amount_proposed,
    amount_signed: o.amount_signed,
    is_no_show: o.is_no_show,
    is_nurturing: o.is_nurturing,
    is_disqualified: o.is_disqualified,
    created_at: o.created_at,
    contact: o.contacts as unknown as CarteOpportunite['contact'],
    setter: (o.setter as unknown as { full_name: string } | null)?.full_name ?? null,
    closer: (o.closer as unknown as { full_name: string } | null)?.full_name ?? null,
    source: (o.sources as unknown as { label: string } | null)?.label ?? null,
  }))

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col px-4 pt-8 sm:px-6">
      <EnTetePage
        titre="Pipeline"
        sous={`${cartes.length} opportunité${cartes.length > 1 ? 's' : ''} en cours`}
      />
      <Kanban
        etapes={etapes}
        cartes={cartes}
        profils={profilsRes.data ?? []}
        sources={sourcesRes.data ?? []}
        moi={moi.id}
        filtreQui={qui ?? ''}
        filtreSource={source ?? ''}
      />
    </div>
  )
}
