import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { profilCourant } from '@/lib/session'
import { EnTetePage } from '@/components/ui'
import { TableConfig } from '@/components/admin-tables'
import { AdminUtilisateurs } from '@/components/admin-utilisateurs'
import { AdminRelances } from '@/components/admin-relances'

export const dynamic = 'force-dynamic'

export default async function Admin() {
  const profil = await profilCourant()
  // La RLS refuserait déjà les écritures, mais autant ne pas afficher l'écran.
  if (profil.role !== 'admin') redirect('/')

  const supabase = await createClient()
  const [etapes, sources, motifs, profils, regles] = await Promise.all([
    supabase.from('pipeline_stages').select('*').order('position'),
    supabase.from('sources').select('*').order('position'),
    supabase.from('lost_reasons').select('*').order('position'),
    supabase.from('profiles').select('*').order('full_name'),
    supabase.from('relance_rules').select('*').order('position'),
  ])

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6">
      <EnTetePage
        titre="Administration"
        sous="Étapes, sources, motifs de perte, relances automatiques et utilisateurs."
      />

      <div className="space-y-5">
        <TableConfig
          table="pipeline_stages"
          titre="Étapes du pipeline"
          aide="L'ordre définit les colonnes du kanban et sert au calcul des taux de conversion. Désactiver une étape la retire du kanban sans effacer l'historique."
          lignes={etapes.data ?? []}
          creation={false}
        />

        <TableConfig
          table="sources"
          titre="Sources d'acquisition"
          aide="Le découpage du dashboard par source dépend de cette liste."
          lignes={sources.data ?? []}
          creation
        />

        <TableConfig
          table="lost_reasons"
          titre="Motifs de perte"
          aide="Obligatoire au passage en Perdu. C'est ce qui rend les pertes analysables."
          lignes={motifs.data ?? []}
          creation
        />

        <AdminRelances regles={regles.data ?? []} />

        <AdminUtilisateurs
          profils={profils.data ?? []}
          moi={profil.id}
          cleServicePresente={!!process.env.SUPABASE_SECRET_KEY}
        />
      </div>
    </div>
  )
}
