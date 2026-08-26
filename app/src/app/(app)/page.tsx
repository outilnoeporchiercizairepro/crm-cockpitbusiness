import { createClient } from '@/lib/supabase/server'
import { exigerIdentite, profilCourant } from '@/lib/session'
import { Carte, EnTetePage, Vide, Badge, LienOpportunite } from '@/components/ui'
import { IssueRdv } from '@/components/issue-rdv'
import { ListeRelances, type Relance } from '@/components/liste-relances'
import { heure, jourHeure, nomContact, relatif, enRetard, LIBELLE_RDV } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function MaJournee() {
  // L'identité vient du jeton (vérifié localement, aucun aller-retour) : les
  // requêtes peuvent donc partir immédiatement, profil compris.
  const moi = await exigerIdentite()
  const supabase = await createClient()

  const debutJour = new Date(); debutJour.setHours(0, 0, 0, 0)
  const finJour = new Date(); finJour.setHours(23, 59, 59, 999)

  const [profil, rdvs, taches, nouveaux, motifs, premiereRegle] = await Promise.all([
    profilCourant(),
    supabase
      .from('appointments')
      .select('*, contacts(full_name, company, phone)')
      .eq('host_id', moi.id)
      .eq('status', 'planifie')
      .gte('scheduled_at', debutJour.toISOString())
      .lte('scheduled_at', finJour.toISOString())
      .order('scheduled_at'),

    supabase
      .from('tasks')
      .select('*, contacts(full_name, company)')
      .eq('assignee_id', moi.id)
      .eq('status', 'a_faire')
      .lte('due_at', finJour.toISOString())
      .order('due_at'),

    supabase
      .from('opportunities')
      .select('*, contacts(full_name, company), pipeline_stages(key, label)')
      .eq('setter_id', moi.id)
      .is('won_at', null)
      .is('lost_at', null)
      .order('created_at', { ascending: false })
      .limit(50),

    supabase.from('lost_reasons').select('id, label').eq('is_active', true).order('position'),

    supabase.from('relance_rules').select('delai_jours').eq('is_active', true)
      .order('position').limit(1).maybeSingle(),
  ])

  const aContacter = (nouveaux.data ?? []).filter(
    (o) => (o.pipeline_stages as unknown as { key: string } | null)?.key === 'nouveau',
  )

  const relances: Relance[] = (taches.data ?? []).map((t) => {
    const c = t.contacts as unknown as { full_name: string; company: string | null } | null
    return {
      id: t.id,
      titre: t.title,
      echeance: t.due_at,
      contact: c ? nomContact(c) : null,
      entreprise: c?.company ?? null,
      opportuniteId: t.opportunity_id,
    }
  }).sort((a, b) => a.echeance.localeCompare(b.echeance))

  const prenom = profil.full_name.split(' ')[0]
  const rien = !(rdvs.data ?? []).length && !relances.length && !aContacter.length

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6">
      <EnTetePage
        titre={`Bonjour ${prenom}`}
        sous={new Date().toLocaleDateString('fr-FR', {
          weekday: 'long', day: 'numeric', month: 'long',
        })}
      />

      {rien && (
        <Vide
          titre="Rien à traiter aujourd'hui"
          sous="Aucun RDV, aucune relance due, aucun lead en attente de premier contact. Le pipeline est à jour."
        />
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ------------------------------------------------------- RDV du jour */}
        {!!(rdvs.data ?? []).length && (
          <Section titre="RDV du jour" compte={rdvs.data!.length}>
            {rdvs.data!.map((r) => {
              const c = r.contacts as unknown as { full_name: string; company: string | null; phone: string | null } | null
              return (
                <div key={r.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="w-12 shrink-0 pt-0.5 text-sm font-medium tabular-nums text-altitude">
                    {heure(r.scheduled_at)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <LienOpportunite id={r.opportunity_id} className="block truncate text-sm font-medium">
                      {nomContact(c)}
                    </LienOpportunite>
                    <p className="mt-0.5 truncate text-xs text-texte-faible">
                      {LIBELLE_RDV[r.kind]}
                      {c?.company ? ` · ${c.company}` : ''}
                      {c?.phone ? ` · ${c.phone}` : ''}
                    </p>
                  </div>
                  <IssueRdv
                    rdvId={r.id}
                    opportuniteId={r.opportunity_id}
                    contactId={r.contact_id}
                    contact={nomContact(c)}
                    motifs={motifs.data ?? []}
                    delaiPremiereRelance={premiereRegle.data?.delai_jours ?? 2}
                  />
                </div>
              )
            })}
          </Section>
        )}

        {/* -------------------------------------------------------- relances */}
        {!!relances.length && (
          <Carte className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-bordure px-4 py-3">
              <h2 className="text-sm font-medium">Relances dues</h2>
              <span className="text-xs tabular-nums text-texte-faible">{relances.length}</span>
            </div>
            <ListeRelances relances={relances} />
          </Carte>
        )}

        {/* ------------------------------------------------ leads à contacter */}
        {!!aContacter.length && (
          <Section titre="Leads à contacter" compte={aContacter.length}>
            {aContacter.slice(0, 12).map((o) => {
              const c = o.contacts as unknown as { full_name: string; company: string | null } | null
              return (
                <div key={o.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <LienOpportunite id={o.id} className="block truncate text-sm font-medium">
                      {nomContact(c)}
                    </LienOpportunite>
                    <p className="mt-0.5 truncate text-xs text-texte-faible">
                      {c?.company ?? 'Entreprise inconnue'} · créé {relatif(o.created_at)}
                    </p>
                  </div>
                </div>
              )
            })}
            {aContacter.length > 12 && (
              <p className="px-4 py-2.5 text-xs text-texte-faible">
                et {aContacter.length - 12} autres — voir le pipeline
              </p>
            )}
          </Section>
        )}
      </div>
    </div>
  )
}

function Section({
  titre,
  compte,
  children,
}: {
  titre: string
  compte: number
  children: React.ReactNode
}) {
  return (
    <Carte className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-bordure px-4 py-3">
        <h2 className="text-sm font-medium">{titre}</h2>
        <span className="text-xs tabular-nums text-texte-faible">{compte}</span>
      </div>
      <div className="divide-y divide-bordure">{children}</div>
    </Carte>
  )
}
