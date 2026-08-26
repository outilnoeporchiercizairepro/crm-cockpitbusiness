import { createClient } from '@/lib/supabase/server'
import { exigerIdentite, profilCourant } from '@/lib/session'
import { TableContacts, type LigneContact } from '@/components/table-contacts'

export const dynamic = 'force-dynamic'

export default async function Contacts() {
  const moi = await exigerIdentite()
  const supabase = await createClient()

  // Tout est chargé en une fois puis filtré dans le navigateur : à cette
  // volumétrie, la recherche devient instantanée au lieu de faire un
  // aller-retour serveur à chaque frappe.
  const [profil, { data: contacts }, { data: sources }] = await Promise.all([
    profilCourant(),
    supabase
      .from('contacts')
      .select(`
        id, full_name, email, phone, company, icp, owner_id, created_at,
        sources(label),
        proprietaire:profiles!contacts_owner_id_fkey(full_name),
        opportunities(id, amount_signed, amount_proposed,
                      pipeline_stages(label, is_won, is_lost))
      `)
      .order('created_at', { ascending: false })
      .limit(1000),
    supabase.from('sources').select('id, label').eq('is_active', true).order('position'),
  ])

  const lignes: LigneContact[] = (contacts ?? []).map((c) => {
    const opp = (c.opportunities as unknown as {
      id: string
      amount_signed: number | null
      amount_proposed: number | null
      pipeline_stages: { label: string; is_won: boolean; is_lost: boolean } | null
    }[] | null)?.[0]

    return {
      id: c.id,
      nom: c.full_name,
      email: c.email,
      telephone: c.phone,
      entreprise: c.company,
      icp: c.icp,
      cree_le: c.created_at,
      source: (c.sources as unknown as { label: string } | null)?.label ?? null,
      proprietaire: (c.proprietaire as unknown as { full_name: string } | null)?.full_name ?? null,
      estMoi: c.owner_id === moi.id,
      sansProprietaire: c.owner_id === null,
      opportuniteId: opp?.id ?? null,
      etape: opp?.pipeline_stages?.label ?? null,
      gagnee: opp?.pipeline_stages?.is_won ?? false,
      perdue: opp?.pipeline_stages?.is_lost ?? false,
      montant: opp?.amount_signed ?? opp?.amount_proposed ?? null,
    }
  })

  return (
    <TableContacts
      lignes={lignes}
      sources={sources ?? []}
      estAdmin={profil.role === 'admin'}
    />
  )
}
