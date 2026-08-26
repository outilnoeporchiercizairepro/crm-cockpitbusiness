'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { exigerIdentite, profilCourant } from '@/lib/session'
import type { ActivityType, ActivityDirection, AppointmentKind, AppointmentStatus, IcpStatus, PaymentPlan, PaymentProcessor, LegalEntity } from '@/lib/database.types'

export type Resultat = { ok: true } | { ok: false; erreur: string }

function echec(e: { message: string } | null, defaut: string): Resultat {
  if (!e) return { ok: true }
  // Une violation RLS se traduit par 0 ligne ou un 42501 : on la rend lisible.
  if (e.message.includes('row-level security') || e.message.includes('42501')) {
    return { ok: false, erreur: "Tu n'as pas les droits sur cet élément." }
  }
  return { ok: false, erreur: e.message || defaut }
}

/* ------------------------------------------------------------------ contacts */

export async function creerContact(form: FormData): Promise<Resultat> {
  // Seule action qui a besoin du rôle : il décide si l'opportunité s'ouvre
  // côté setter ou côté closer.
  const profil = await profilCourant()
  const supabase = await createClient()

  const nom = String(form.get('full_name') ?? '').trim()
  if (!nom) return { ok: false, erreur: 'Le nom est obligatoire.' }

  const source_id = String(form.get('source_id') ?? '')
  const { data, error } = await supabase
    .from('contacts')
    .insert({
      full_name: nom,
      email: String(form.get('email') ?? '').trim() || null,
      phone: String(form.get('phone') ?? '').trim() || null,
      company: String(form.get('company') ?? '').trim() || null,
      main_pain: String(form.get('main_pain') ?? '').trim() || null,
      source_id: source_id || null,
      owner_id: profil.id,
      created_by: profil.id,
    })
    .select('id')
    .single()

  if (error) return echec(error, 'Création impossible.')

  // Un contact sans opportunité n'entre pas dans l'entonnoir : on l'ouvre tout de suite.
  const { data: etape } = await supabase
    .from('pipeline_stages')
    .select('id')
    .eq('key', 'nouveau')
    .single()

  if (etape && data) {
    await supabase.from('opportunities').insert({
      contact_id: data.id,
      stage_id: etape.id,
      source_id: source_id || null,
      setter_id: profil.role === 'closer' ? null : profil.id,
      closer_id: profil.role === 'closer' ? profil.id : null,
      created_by: profil.id,
    })
  }

  revalidatePath('/contacts')
  revalidatePath('/pipeline')
  return { ok: true }
}

export async function majContact(id: string, form: FormData): Promise<Resultat> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('contacts')
    .update({
      full_name: String(form.get('full_name') ?? '').trim(),
      email: String(form.get('email') ?? '').trim() || null,
      phone: String(form.get('phone') ?? '').trim() || null,
      company: String(form.get('company') ?? '').trim() || null,
      main_pain: String(form.get('main_pain') ?? '').trim() || null,
      icp: (String(form.get('icp') ?? 'inconnu') as IcpStatus),
      notes: String(form.get('notes') ?? '').trim() || null,
    })
    .eq('id', id)

  revalidatePath('/contacts')
  revalidatePath('/pipeline')
  return echec(error, 'Modification impossible.')
}

export async function attribuerContact(id: string): Promise<Resultat> {
  const profil = await exigerIdentite()
  const supabase = await createClient()
  const { error } = await supabase.from('contacts').update({ owner_id: profil.id }).eq('id', id)
  revalidatePath('/contacts')
  return echec(error, 'Attribution impossible.')
}

/* ------------------------------------------------------- opportunités / étapes */

export async function deplacerEtape(opportuniteId: string, etapeId: string): Promise<Resultat> {
  const supabase = await createClient()

  const { data: etape } = await supabase
    .from('pipeline_stages')
    .select('is_lost')
    .eq('id', etapeId)
    .single()

  // Le trigger require_lost_reason refuserait l'update : on le dit clairement
  // plutôt que de laisser remonter une erreur Postgres.
  if (etape?.is_lost) {
    const { data: opp } = await supabase
      .from('opportunities')
      .select('lost_reason_id')
      .eq('id', opportuniteId)
      .single()
    if (!opp?.lost_reason_id) {
      return { ok: false, erreur: 'Renseigne un motif de perte avant de passer en Perdu.' }
    }
  }

  const { error } = await supabase
    .from('opportunities')
    .update({ stage_id: etapeId })
    .eq('id', opportuniteId)

  revalidatePath('/pipeline')
  revalidatePath(`/opportunites/${opportuniteId}`)
  revalidatePath('/dashboard')
  return echec(error, 'Déplacement impossible.')
}

export async function marquerPerdue(
  opportuniteId: string,
  motifId: string,
  note: string,
): Promise<Resultat> {
  const supabase = await createClient()

  const { data: etape } = await supabase
    .from('pipeline_stages')
    .select('id')
    .eq('is_lost', true)
    .limit(1)
    .single()

  if (!etape) return { ok: false, erreur: 'Aucune étape « perdue » configurée.' }

  // Motif d'abord, étape ensuite : le trigger lit lost_reason_id sur la ligne.
  const { error } = await supabase
    .from('opportunities')
    .update({ lost_reason_id: motifId, lost_note: note || null, stage_id: etape.id })
    .eq('id', opportuniteId)

  revalidatePath('/pipeline')
  revalidatePath(`/opportunites/${opportuniteId}`)
  revalidatePath('/dashboard')
  return echec(error, 'Impossible de marquer perdue.')
}

export async function majOpportunite(id: string, form: FormData): Promise<Resultat> {
  const supabase = await createClient()

  const montantPropose = String(form.get('amount_proposed') ?? '').trim()
  const montantSigne = String(form.get('amount_signed') ?? '').trim()
  const plan = String(form.get('payment_plan') ?? '').trim()
  const processeur = String(form.get('payment_processor') ?? '').trim()
  const entite = String(form.get('legal_entity') ?? '').trim()
  const closer = String(form.get('closer_id') ?? '').trim()
  const setter = String(form.get('setter_id') ?? '').trim()

  const { error } = await supabase
    .from('opportunities')
    .update({
      amount_proposed: montantPropose ? Number(montantPropose) : null,
      amount_signed: montantSigne ? Number(montantSigne) : null,
      payment_plan: (plan || null) as PaymentPlan | null,
      payment_processor: (processeur || null) as PaymentProcessor | null,
      legal_entity: (entite || null) as LegalEntity | null,
      setter_paid: form.get('setter_paid') === 'on',
      closer_id: closer || null,
      setter_id: setter || null,
      is_nurturing: form.get('is_nurturing') === 'on',
      is_disqualified: form.get('is_disqualified') === 'on',
    })
    .eq('id', id)

  revalidatePath(`/opportunites/${id}`)
  revalidatePath('/pipeline')
  return echec(error, 'Modification impossible.')
}

/* ---------------------------------------------------------------- activités */

export async function loggerActivite(form: FormData): Promise<Resultat> {
  const profil = await exigerIdentite()
  const supabase = await createClient()

  const { error } = await supabase.from('activities').insert({
    contact_id: String(form.get('contact_id')),
    opportunity_id: String(form.get('opportunity_id')) || null,
    type: String(form.get('type') ?? 'note') as ActivityType,
    direction: String(form.get('direction') ?? 'sortant') as ActivityDirection,
    outcome: String(form.get('outcome') ?? '').trim() || null,
    content: String(form.get('content') ?? '').trim() || null,
    author_id: profil.id,
  })

  const opp = String(form.get('opportunity_id') ?? '')
  if (opp) revalidatePath(`/opportunites/${opp}`)
  return echec(error, 'Impossible de logger cette activité.')
}

/* --------------------------------------------------------------------- RDV */

export async function creerRdv(form: FormData): Promise<Resultat> {
  const profil = await exigerIdentite()
  const supabase = await createClient()

  const quand = String(form.get('scheduled_at') ?? '')
  if (!quand) return { ok: false, erreur: 'Indique une date.' }

  const opportunityId = String(form.get('opportunity_id'))
  const { error } = await supabase.from('appointments').insert({
    opportunity_id: opportunityId,
    contact_id: String(form.get('contact_id')),
    kind: String(form.get('kind') ?? 'closing') as AppointmentKind,
    scheduled_at: new Date(quand).toISOString(),
    duration_min: Number(form.get('duration_min') ?? 45),
    host_id: String(form.get('host_id') ?? '') || profil.id,
    location: String(form.get('location') ?? '').trim() || null,
    created_by: profil.id,
  })

  revalidatePath(`/opportunites/${opportunityId}`)
  revalidatePath('/')
  return echec(error, 'Création du RDV impossible.')
}

export async function majStatutRdv(
  id: string,
  statut: AppointmentStatus,
  opportuniteId: string,
): Promise<Resultat> {
  const supabase = await createClient()
  const { error } = await supabase.from('appointments').update({ status: statut }).eq('id', id)

  revalidatePath(`/opportunites/${opportuniteId}`)
  revalidatePath('/')
  revalidatePath('/dashboard')
  return echec(error, 'Mise à jour impossible.')
}

/* ------------------------------------------------------------------- tâches */

export async function creerTache(form: FormData): Promise<Resultat> {
  const profil = await exigerIdentite()
  const supabase = await createClient()

  const quand = String(form.get('due_at') ?? '')
  if (!quand) return { ok: false, erreur: 'Indique une échéance.' }

  const opportunityId = String(form.get('opportunity_id') ?? '')
  const { error } = await supabase.from('tasks').insert({
    opportunity_id: opportunityId || null,
    contact_id: String(form.get('contact_id') ?? '') || null,
    title: String(form.get('title') ?? '').trim() || 'Relancer',
    details: String(form.get('details') ?? '').trim() || null,
    due_at: new Date(quand).toISOString(),
    assignee_id: String(form.get('assignee_id') ?? '') || profil.id,
    created_by: profil.id,
  })

  if (opportunityId) revalidatePath(`/opportunites/${opportunityId}`)
  revalidatePath('/')
  return echec(error, 'Création de la relance impossible.')
}

export async function terminerTache(id: string): Promise<Resultat> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('tasks')
    .update({ status: 'fait', completed_at: new Date().toISOString() })
    .eq('id', id)

  revalidatePath('/')
  return echec(error, 'Impossible de clore la relance.')
}

/** Remet une relance à faire — pour rattraper un clic malheureux. */
export async function rouvrirTache(id: string): Promise<Resultat> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('tasks')
    .update({ status: 'a_faire', completed_at: null })
    .eq('id', id)

  revalidatePath('/')
  return echec(error, 'Impossible de rouvrir la relance.')
}

/* -------------------------------------------------------------------- admin */

export async function majLigneConfig(
  table: 'pipeline_stages' | 'sources' | 'lost_reasons',
  id: string,
  champs: { label?: string; position?: number; is_active?: boolean },
): Promise<Resultat> {
  const supabase = await createClient()
  const { error } = await supabase.from(table).update(champs).eq('id', id)
  revalidatePath('/admin')
  revalidatePath('/pipeline')
  return echec(error, 'Modification impossible.')
}

export async function creerLigneConfig(
  table: 'sources' | 'lost_reasons',
  label: string,
): Promise<Resultat> {
  const supabase = await createClient()
  const key = label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')

  if (!key) return { ok: false, erreur: 'Libellé invalide.' }

  const { error } = await supabase.from(table).insert({ key, label, position: 50 })
  revalidatePath('/admin')
  return echec(error, 'Création impossible.')
}

/* -------------------------------------------------------------------- import */

export type LigneImport = {
  full_name: string
  email?: string
  phone?: string
  company?: string
  source_key?: string
  notes?: string
}

export type BilanImport = {
  ok: boolean
  crees: number
  ignores: number
  erreurs: string[]
}

/**
 * Import CSV. Une ligne sans nom est ignorée plutôt que de faire échouer
 * tout le lot : sur un export réel il y a toujours des lignes vides.
 * Chaque contact créé reçoit une opportunité en « Nouveau », sinon il
 * n'entre pas dans l'entonnoir et fausse les taux.
 */
export async function importerContacts(lignes: LigneImport[]): Promise<BilanImport> {
  const profil = await exigerIdentite()
  const supabase = await createClient()
  const erreurs: string[] = []

  const [{ data: sources }, { data: etape }] = await Promise.all([
    supabase.from('sources').select('id, key'),
    supabase.from('pipeline_stages').select('id').eq('key', 'nouveau').single(),
  ])

  const parCle = new Map((sources ?? []).map((s) => [s.key, s.id]))

  const valides = lignes.filter((l) => l.full_name?.trim())
  const ignores = lignes.length - valides.length

  if (!valides.length) return { ok: false, crees: 0, ignores, erreurs: ['Aucune ligne exploitable.'] }

  const aInserer = valides.map((l) => ({
    full_name: l.full_name.trim(),
    email: l.email?.trim() || null,
    phone: l.phone?.trim() || null,
    company: l.company?.trim() || null,
    notes: l.notes?.trim() || null,
    source_id: l.source_key ? (parCle.get(l.source_key) ?? null) : null,
    owner_id: null,
    created_by: profil.id,
  }))

  const { data: crees, error } = await supabase.from('contacts').insert(aInserer).select('id, source_id')

  if (error) {
    return { ok: false, crees: 0, ignores, erreurs: [error.message] }
  }

  if (etape && crees?.length) {
    const { error: eOpp } = await supabase.from('opportunities').insert(
      crees.map((c) => ({
        contact_id: c.id,
        stage_id: etape.id,
        source_id: c.source_id,
        created_by: profil.id,
      })),
    )
    if (eOpp) erreurs.push(`Contacts créés, mais opportunités non ouvertes : ${eOpp.message}`)
  }

  revalidatePath('/contacts')
  revalidatePath('/pipeline')
  return { ok: true, crees: crees?.length ?? 0, ignores, erreurs }
}

/* ------------------------------------------------------ suppression contact */

export type ApercuSuppression = {
  nom: string
  opportunites: number
  activites: number
  rdv: number
  taches: number
  caSigne: number
}

/**
 * Ce qu'une suppression détruirait. Affiché avant confirmation : effacer un
 * contact closé retire son chiffre d'affaires du dashboard, et c'est
 * irréversible — autant que ce soit dit avant, pas découvert après.
 */
export async function apercuSuppressionContact(
  contactId: string,
): Promise<{ ok: true; apercu: ApercuSuppression } | { ok: false; erreur: string }> {
  const supabase = await createClient()

  const { data: contact } = await supabase
    .from('contacts')
    .select('full_name')
    .eq('id', contactId)
    .maybeSingle()

  if (!contact) return { ok: false, erreur: 'Contact introuvable.' }

  const [opps, activites, rdv, taches] = await Promise.all([
    supabase.from('opportunities').select('id, amount_signed').eq('contact_id', contactId),
    supabase.from('activities').select('id', { count: 'exact', head: true }).eq('contact_id', contactId),
    supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('contact_id', contactId),
    supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('contact_id', contactId),
  ])

  return {
    ok: true,
    apercu: {
      nom: contact.full_name,
      opportunites: opps.data?.length ?? 0,
      activites: activites.count ?? 0,
      rdv: rdv.count ?? 0,
      taches: taches.count ?? 0,
      caSigne: (opps.data ?? []).reduce((s, o) => s + (o.amount_signed ?? 0), 0),
    },
  }
}

/** Suppression définitive. La RLS la réserve déjà à l'admin ; on le vérifie aussi ici. */
export async function supprimerContact(contactId: string): Promise<Resultat> {
  // Suppression irréversible : on vérifie le rôle, donc on charge le profil.
  const profil = await profilCourant()
  if (profil.role !== 'admin') {
    return { ok: false, erreur: "Seul l'administrateur peut supprimer un contact." }
  }

  const supabase = await createClient()
  const { error, count } = await supabase
    .from('contacts')
    .delete({ count: 'exact' })
    .eq('id', contactId)

  if (error) return echec(error, 'Suppression impossible.')
  if (!count) return { ok: false, erreur: 'Rien supprimé — le contact a peut-être déjà disparu.' }

  revalidatePath('/contacts')
  revalidatePath('/pipeline')
  revalidatePath('/dashboard')
  revalidatePath('/')
  return { ok: true }
}
