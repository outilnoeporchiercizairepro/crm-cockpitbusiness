import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { exigerIdentite, profilCourant } from '@/lib/session'
import { Carte, EnTetePage, LienOpportunite } from '@/components/ui'
import { IssueRdv } from '@/components/issue-rdv'
import { EtiquetteSource } from '@/components/etiquette-source'
import { ListeRelances, type Relance } from '@/components/liste-relances'
import { heure, nomContact, relatif, bornesDuJour, FUSEAU, LIBELLE_RDV } from '@/lib/format'
import type { TonSource } from '@/lib/database.types'

export const dynamic = 'force-dynamic'

export default async function MaJournee() {
  // L'identité vient du jeton (vérifié localement, aucun aller-retour) : les
  // requêtes peuvent donc partir immédiatement, profil compris.
  const moi = await exigerIdentite()
  const supabase = await createClient()

  // Le setter n'a que Contacts et Pipeline : sans cette redirection, sa
  // page d'arrivée après connexion serait un écran absent de son menu.
  const profilArrivee = await profilCourant()
  if (profilArrivee.role === 'setter') redirect('/contacts')

  const { debut: debutJour, fin: finJour } = bornesDuJour()

  const [profil, rdvs, taches, nouveaux, motifs, premiereRegle] = await Promise.all([
    profilCourant(),
    supabase
      .from('appointments')
      .select('*, contacts(full_name, company, phone, sources(label, color))')
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
      .select('*, contacts(full_name, company, sources(label, color)), pipeline_stages(key, label)')
      .eq('setter_id', moi.id)
      .is('won_at', null)
      .is('lost_at', null)
      .order('created_at', { ascending: false })
      .limit(50),

    supabase.from('lost_reasons').select('id, label').eq('is_active', true).order('position'),

    supabase.from('relance_rules').select('delai_jours').eq('is_active', true)
      .order('position').limit(1).maybeSingle(),
  ])

  // « lead » et non « nouveau » : cette dernière étape n'a jamais existé en
  // base, le filtre ne renvoyait donc jamais rien et la section restait vide.
  const aContacter = (nouveaux.data ?? []).filter(
    (o) => (o.pipeline_stages as unknown as { key: string } | null)?.key === 'lead',
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
  const rdvsDuJour = rdvs.data ?? []

  return (
    <div className="mx-auto max-w-[1700px] px-4 py-8 sm:px-8">
      <EnTetePage
        titre={`Bonjour ${prenom}`}
        sous={new Date().toLocaleDateString('fr-FR', {
          timeZone: FUSEAU, weekday: 'long', day: 'numeric', month: 'long',
        })}
      />

      {/* Deux colonnes égales : la journée se lit d'un côté, se traite de
          l'autre. Chacune garde sa place même vide — une colonne qui
          disparaît fait sauter la mise en page d'un jour à l'autre. */}
      <div className="grid items-start gap-6 xl:grid-cols-2">
        {/* ------------------------------------------------------- RDV du jour */}
        <Colonne titre="RDV du jour" compte={rdvsDuJour.length}>
          {!rdvsDuJour.length ? (
            <p className="px-6 py-12 text-center text-base text-texte-faible">
              Aucun rendez-vous aujourd&apos;hui.
            </p>
          ) : (
            <div className="divide-y divide-bordure">
              {rdvsDuJour.map((r) => {
                const c = r.contacts as unknown as {
                  full_name: string; company: string | null; phone: string | null
                  sources: { label: string; color: TonSource } | null
                } | null
                return (
                  <div key={r.id} className="px-5 py-5">
                    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
                      <span className="text-3xl font-semibold tabular-nums tracking-tight text-altitude">
                        {heure(r.scheduled_at)}
                      </span>
                      <LienOpportunite
                        id={r.opportunity_id}
                        className="min-w-0 text-xl font-semibold tracking-tight"
                      >
                        {nomContact(c)}
                      </LienOpportunite>
                      <EtiquetteSource label={c?.sources?.label} ton={c?.sources?.color} />
                    </div>

                    <p className="mt-1.5 text-sm text-texte-doux">
                      {LIBELLE_RDV[r.kind]}
                      {c?.company ? ` · ${c.company}` : ''}
                      {c?.phone && (
                        <>
                          {' · '}
                          <a href={`tel:${c.phone}`} className="text-altitude hover:underline">
                            {c.phone}
                          </a>
                        </>
                      )}
                    </p>

                    <div className="mt-4">
                      <IssueRdv
                        rdvId={r.id}
                        opportuniteId={r.opportunity_id}
                        contactId={r.contact_id}
                        contact={nomContact(c)}
                        motifs={motifs.data ?? []}
                        delaiPremiereRelance={premiereRegle.data?.delai_jours ?? 2}
                        creneau={r.scheduled_at}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Colonne>

        {/* -------------------------------------------------------- relances */}
        <Colonne titre="Relances dues" compte={relances.length}>
          <ListeRelances relances={relances} />
        </Colonne>
      </div>

      {/* ------------------------------------------------ leads à contacter */}
      {!!aContacter.length && (
        <div className="mt-6">
          <Colonne titre="Leads à contacter" compte={aContacter.length}>
            <div className="grid gap-px bg-bordure sm:grid-cols-2 xl:grid-cols-3">
              {aContacter.slice(0, 12).map((o) => {
                const c = o.contacts as unknown as {
                  full_name: string; company: string | null
                  sources: { label: string; color: TonSource } | null
                } | null
                return (
                  <div key={o.id} className="bg-surface px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <LienOpportunite id={o.id} className="min-w-0 text-base font-medium">
                        {nomContact(c)}
                      </LienOpportunite>
                      <EtiquetteSource label={c?.sources?.label} ton={c?.sources?.color} />
                    </div>
                    <p className="mt-1 truncate text-sm text-texte-faible">
                      {c?.company ?? 'Entreprise inconnue'} · créé {relatif(o.created_at)}
                    </p>
                  </div>
                )
              })}
            </div>
            {aContacter.length > 12 && (
              <p className="px-5 py-3 text-sm text-texte-faible">
                et {aContacter.length - 12} autres — voir le pipeline
              </p>
            )}
          </Colonne>
        </div>
      )}
    </div>
  )
}

function Colonne({
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
      <div className="flex items-center justify-between border-b border-bordure px-5 py-4">
        <h2 className="text-base font-semibold tracking-tight">{titre}</h2>
        <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-sm font-medium tabular-nums text-texte-doux">
          {compte}
        </span>
      </div>
      {children}
    </Carte>
  )
}
