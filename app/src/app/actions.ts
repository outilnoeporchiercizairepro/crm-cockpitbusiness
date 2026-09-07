'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { exigerIdentite, profilCourant } from '@/lib/session'
import { normaliserCle } from '@/lib/codes'
import { instantDepuisSaisieParis } from '@/lib/format'
import type { ActivityType, ActivityDirection, AppointmentKind, AppointmentStatus, IcpStatus, PaymentPlan, PaymentProcessor, LegalEntity, TonSource } from '@/lib/database.types'

export type Resultat = { ok: true } | { ok: false; erreur: string }

function echec(e: { message: string } | null, defaut: string): Resultat {
  if (!e) return { ok: true }
  // Une violation RLS se traduit par 0 ligne ou un 42501 : on la rend lisible.
  if (e.message.includes('row-level security') || e.message.includes('42501')) {
    return { ok: false, erreur: "Tu n'as pas les droits sur cet élément." }
  }
  return { ok: false, erreur: e.message || defaut }
}

/**
 * Première étape du pipeline : la plus à gauche du kanban, hors gagné/perdu.
 *
 * Résolue par position et non par clé en dur. Les précédentes versions
 * cherchaient `key = 'nouveau'`, une étape qui n'a jamais existé en base :
 * `.single()` échouait en silence et le contact était créé sans opportunité,
 * donc absent du pipeline et de tous les taux de conversion.
 */
async function premiereEtape(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from('pipeline_stages')
    .select('id')
    .eq('is_active', true)
    .eq('is_won', false)
    .eq('is_lost', false)
    .order('position')
    .limit(1)
    .maybeSingle()
  return data
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

  if (error) {
    // Un compte au périmètre restreint ne peut créer que dans ses sources —
    // et pas sans source du tout, sinon la restriction se contourne en
    // laissant le champ vide. Le message brut de la RLS ne le dirait pas.
    const refusRls = error.message.includes('row-level security') || error.message.includes('42501')
    if (refusRls) {
      return {
        ok: false,
        erreur: source_id
          ? "Ton compte n'a pas accès à cette source."
          : 'Ton compte est limité à certaines sources : choisis-en une pour créer ce contact.',
      }
    }
    return echec(error, 'Création impossible.')
  }

  // Un contact sans opportunité n'entre pas dans l'entonnoir : on l'ouvre tout de suite.
  const etape = await premiereEtape(supabase)
  if (!etape) {
    return {
      ok: false,
      erreur:
        "Contact créé, mais aucune étape de pipeline active n'est configurée : "
        + "son opportunité n'a pas pu être ouverte. Vérifie l'écran d'administration.",
    }
  }

  const { error: eOpp } = await supabase.from('opportunities').insert({
    contact_id: data.id,
    stage_id: etape.id,
    source_id: source_id || null,
    setter_id: profil.role === 'closer' ? null : profil.id,
    closer_id: profil.role === 'closer' ? profil.id : null,
    created_by: profil.id,
  })

  revalidatePath('/contacts')
  revalidatePath('/pipeline')
  if (eOpp) {
    return { ok: false, erreur: `Contact créé, mais sans opportunité : ${eOpp.message}` }
  }
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

/**
 * Change la source d'une affaire depuis sa fiche.
 *
 * Écrit sur le contact ET sur l'opportunité : le dashboard découpe par
 * `opportunities.source_id`, la liste Contacts affiche `contacts.source_id`.
 * N'en corriger qu'un seul ferait diverger les deux écrans sur la même
 * affaire — précisément ce qu'on cherche à réparer en saisissant la source.
 */
export async function definirSource(
  opportuniteId: string,
  contactId: string,
  sourceId: string | null,
): Promise<Resultat> {
  await exigerIdentite()
  const supabase = await createClient()

  const { error: eOpp } = await supabase
    .from('opportunities')
    .update({ source_id: sourceId })
    .eq('id', opportuniteId)
  if (eOpp) return echec(eOpp, 'Modification impossible.')

  const { error: eContact } = await supabase
    .from('contacts')
    .update({ source_id: sourceId })
    .eq('id', contactId)
  if (eContact) {
    return {
      ok: false,
      erreur: `Source posée sur l'affaire mais pas sur le contact : ${eContact.message}`,
    }
  }

  revalidatePath(`/opportunites/${opportuniteId}`)
  revalidatePath('/contacts')
  revalidatePath('/pipeline')
  revalidatePath('/dashboard')
  revalidatePath('/')
  return { ok: true }
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
  /**
   * Étape perdue visée. Le kanban en a plusieurs — « Perdu » et « Mauvais
   * ICP » — et sans ce paramètre, glisser une carte vers l'une atterrissait
   * dans l'autre : la première étape perdue trouvée.
   */
  etapeId?: string,
): Promise<Resultat> {
  const supabase = await createClient()

  if (!motifId) return { ok: false, erreur: 'Choisis un motif de perte.' }

  const { data: etape } = etapeId
    ? await supabase.from('pipeline_stages').select('id').eq('id', etapeId).eq('is_lost', true).maybeSingle()
    : await supabase.from('pipeline_stages').select('id').eq('is_lost', true).order('position').limit(1).maybeSingle()

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
    scheduled_at: instantDepuisSaisieParis(quand),
    duration_min: Number(form.get('duration_min') ?? 45),
    host_id: String(form.get('host_id') ?? '') || profil.id,
    location: String(form.get('location') ?? '').trim() || null,
    created_by: profil.id,
  })

  revalidatePath(`/opportunites/${opportunityId}`)
  revalidatePath('/')
  return echec(error, 'Création du RDV impossible.')
}

/**
 * Décale un rendez-vous : l'ancien créneau est marqué « replanifié » et
 * pointe vers le nouveau, qui reprend son type, sa durée, son hôte et son
 * lieu.
 *
 * Deux lignes plutôt qu'un simple changement de date : le no-show et le
 * report ne se ressemblent pas, et l'historique doit montrer qu'un client a
 * fait glisser son créneau — c'est un signal commercial. Les colonnes
 * `rescheduled_to` et le statut « replanifie » étaient prévus pour ça depuis
 * le début du schéma.
 */
export async function replanifierRdv(
  rdvId: string,
  nouvelleDate: string,
  motif?: string,
): Promise<Resultat> {
  const profil = await exigerIdentite()
  const supabase = await createClient()

  if (!nouvelleDate) return { ok: false, erreur: 'Indique le nouveau créneau.' }

  const { data: ancien } = await supabase
    .from('appointments')
    .select('id, opportunity_id, contact_id, kind, duration_min, host_id, location, status, scheduled_at')
    .eq('id', rdvId)
    .maybeSingle()

  if (!ancien) return { ok: false, erreur: 'Rendez-vous introuvable.' }
  if (ancien.status !== 'planifie') {
    return { ok: false, erreur: 'Seul un rendez-vous encore planifié peut être décalé.' }
  }

  const quand = instantDepuisSaisieParis(nouvelleDate)
  if (quand === ancien.scheduled_at) {
    return { ok: false, erreur: "C'est déjà le créneau actuel." }
  }

  const { data: nouveau, error: eCreation } = await supabase
    .from('appointments')
    .insert({
      opportunity_id: ancien.opportunity_id,
      contact_id: ancien.contact_id,
      kind: ancien.kind,
      scheduled_at: quand,
      duration_min: ancien.duration_min,
      host_id: ancien.host_id,
      location: ancien.location,
      notes: motif?.trim() || null,
      created_by: profil.id,
    })
    .select('id')
    .single()

  if (eCreation) return echec(eCreation, 'Impossible de créer le nouveau créneau.')

  // L'ancien n'est fermé qu'une fois le nouveau créé : si l'insertion échoue,
  // on garde un rendez-vous valide plutôt que d'en perdre un.
  const { error: eAncien } = await supabase
    .from('appointments')
    .update({ status: 'replanifie', rescheduled_to: nouveau.id })
    .eq('id', rdvId)

  if (eAncien) {
    return {
      ok: false,
      erreur: `Nouveau créneau créé, mais l'ancien est resté planifié : ${eAncien.message}`,
    }
  }

  revalidatePath(`/opportunites/${ancien.opportunity_id}`)
  revalidatePath('/')
  revalidatePath('/pipeline')
  return { ok: true }
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
    due_at: instantDepuisSaisieParis(quand),
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

/* ------------------------------------------------------------ notifications */

/**
 * Horodate l'ouverture de la cloche. Le compteur de non-lues se déduit de
 * cette date : une table de lectures par utilisateur et par notification
 * coûterait bien plus que ce qu'elle apporterait pour un simple badge.
 */
export async function marquerNotificationsVues(): Promise<Resultat> {
  const profil = await exigerIdentite()
  const supabase = await createClient()

  const { error } = await supabase
    .from('profiles')
    .update({ notifications_vues_le: new Date().toISOString() })
    .eq('id', profil.id)

  return echec(error, 'Impossible de marquer les notifications comme lues.')
}

/* -------------------------------------------------------------------- admin */

function echecConfig(e: { message: string } | null, defaut: string): Resultat {
  // 23505 = unique_violation. Le message brut de Postgres nomme la contrainte,
  // pas le problème : deux lignes ne peuvent pas partager le même code.
  if (e && (e.message.includes('duplicate key') || e.message.includes('23505'))) {
    return { ok: false, erreur: 'Ce code est déjà utilisé par une autre ligne.' }
  }
  return echec(e, defaut)
}

export async function majLigneConfig(
  table: 'pipeline_stages' | 'sources' | 'lost_reasons',
  id: string,
  champs: { label?: string; key?: string; color?: TonSource; position?: number; is_active?: boolean },
): Promise<Resultat> {
  const supabase = await createClient()

  // Sources et étapes portent une couleur d'étiquette ; les motifs de perte
  // n'apparaissent nulle part sous forme de badge, donc non.
  const { color, ...communs } = champs
  const porteUneCouleur = table === 'sources' || table === 'pipeline_stages'
  if (color !== undefined && !porteUneCouleur) {
    return { ok: false, erreur: "Les motifs de perte ne portent pas de couleur d'étiquette." }
  }

  // Les clés d'étapes sont lues en dur (« lead », « closing_planifie »,
  // « en_attente ») par l'app et par la fonction d'entrée n8n : les rendre
  // modifiables casserait la prise de RDV sans le moindre message d'erreur.
  if (communs.key !== undefined) {
    if (table === 'pipeline_stages') {
      return { ok: false, erreur: "Le code d'une étape ne se modifie pas : il est référencé par le code." }
    }
    const cle = normaliserCle(communs.key)
    if (!cle) return { ok: false, erreur: 'Code invalide : lettres et chiffres uniquement.' }
    communs.key = cle
  }

  // Appels distincts plutôt qu'un objet fourre-tout : `color` n'existe pas
  // sur `lost_reasons`, et le typage de la table le refuserait.
  const avecCouleur = { ...communs, ...(color !== undefined && { color }) }
  const { error } =
    table === 'sources'
      ? await supabase.from('sources').update(avecCouleur).eq('id', id)
      : table === 'pipeline_stages'
        ? await supabase.from('pipeline_stages').update(avecCouleur).eq('id', id)
        : await supabase.from(table).update(communs).eq('id', id)

  revalidatePath('/admin')
  revalidatePath('/pipeline')
  revalidatePath('/contacts')
  revalidatePath('/')
  return echecConfig(error, 'Modification impossible.')
}

export async function creerLigneConfig(
  table: 'sources' | 'lost_reasons',
  label: string,
  cleSaisie?: string,
): Promise<Resultat> {
  const supabase = await createClient()

  if (!label.trim()) return { ok: false, erreur: 'Le libellé est obligatoire.' }

  // Code laissé vide = dérivé du libellé, comme avant. Renseigné, il fait foi :
  // c'est lui que n8n enverra.
  const key = normaliserCle(cleSaisie?.trim() || label)
  if (!key) return { ok: false, erreur: 'Code invalide : lettres et chiffres uniquement.' }

  const { error } = await supabase.from(table).insert({ key, label: label.trim(), position: 50 })
  revalidatePath('/admin')
  return echecConfig(error, 'Création impossible.')
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
 * Chaque contact créé reçoit une opportunité à la première étape du pipeline,
 * sinon il n'entre pas dans l'entonnoir et fausse les taux.
 */
export async function importerContacts(lignes: LigneImport[]): Promise<BilanImport> {
  const profil = await exigerIdentite()
  const supabase = await createClient()
  const erreurs: string[] = []

  const [{ data: sources }, etape] = await Promise.all([
    supabase.from('sources').select('id, key'),
    premiereEtape(supabase),
  ])

  // Les deux côtés sont normalisés : une colonne CSV qui dit « SL » ou
  // « Setter LinkedIn » retombe sur le même code que l'admin a enregistré.
  // Sans ça la source est silencieusement perdue, comme sur le webhook n8n.
  const parCle = new Map((sources ?? []).map((s) => [normaliserCle(s.key), s.id]))

  const valides = lignes.filter((l) => l.full_name?.trim())
  const ignores = lignes.length - valides.length

  if (!valides.length) return { ok: false, crees: 0, ignores, erreurs: ['Aucune ligne exploitable.'] }

  const aInserer = valides.map((l) => ({
    full_name: l.full_name.trim(),
    email: l.email?.trim() || null,
    phone: l.phone?.trim() || null,
    company: l.company?.trim() || null,
    notes: l.notes?.trim() || null,
    source_id: l.source_key ? (parCle.get(normaliserCle(l.source_key)) ?? null) : null,
    owner_id: null,
    created_by: profil.id,
  }))

  const { data: crees, error } = await supabase.from('contacts').insert(aInserer).select('id, source_id')

  if (error) {
    return { ok: false, crees: 0, ignores, erreurs: [error.message] }
  }

  if (!etape) {
    erreurs.push(
      "Aucune étape de pipeline active : les contacts sont créés mais sans opportunité, "
      + "donc absents du kanban et des taux.",
    )
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
