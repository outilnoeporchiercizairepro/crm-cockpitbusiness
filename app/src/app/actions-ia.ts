'use server'

import { createClient } from '@/lib/supabase/server'
import { profilCourant } from '@/lib/session'
import { LIBELLE_ACTIVITE, LIBELLE_STATUT_RDV, euros } from '@/lib/format'

export type ResultatIA =
  | { ok: true; message: string }
  | { ok: false; erreur: string }

const MODELE = process.env.OPENAI_MODEL ?? 'gpt-4o-mini'

/**
 * Rédige une relance WhatsApp à partir de tout ce que le CRM sait de
 * l'opportunité. Le message n'est jamais envoyé : il est rendu à l'écran,
 * modifiable, et c'est l'utilisateur qui décide de l'expédier.
 */
export async function genererRelanceWhatsApp(
  opportuniteId: string,
  consigne: string,
): Promise<ResultatIA> {
  const cle = process.env.OPENAI_API_KEY
  if (!cle) {
    return {
      ok: false,
      erreur:
        "Clé OpenAI absente. Ajoute OPENAI_API_KEY dans app/.env.local, puis relance le serveur.",
    }
  }

  const profil = await profilCourant()
  const supabase = await createClient()

  const { data: opp, error } = await supabase
    .from('opportunities')
    .select(`
      id, amount_proposed, amount_signed, payment_plan,
      is_nurturing, is_no_show, created_at,
      contacts(full_name, company, main_pain, notes),
      pipeline_stages(label, is_won, is_lost),
      lost_reasons(label)
    `)
    .eq('id', opportuniteId)
    .maybeSingle()

  if (error || !opp) {
    return { ok: false, erreur: error?.message ?? 'Opportunité introuvable.' }
  }

  const [{ data: activites }, { data: rdvs }] = await Promise.all([
    supabase
      .from('activities')
      .select('type, direction, outcome, content, occurred_at')
      .eq('opportunity_id', opportuniteId)
      .order('occurred_at', { ascending: false })
      .limit(10),
    supabase
      .from('appointments')
      .select('kind, status, scheduled_at')
      .eq('opportunity_id', opportuniteId)
      .order('scheduled_at', { ascending: false })
      .limit(5),
  ])

  const c = opp.contacts as unknown as {
    full_name: string; company: string | null
    main_pain: string | null; notes: string | null
  }
  const etape = opp.pipeline_stages as unknown as { label: string; is_won: boolean; is_lost: boolean }
  const motif = opp.lost_reasons as unknown as { label: string } | null

  const jour = (iso: string) =>
    new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })

  const joursDepuis = (iso: string | null | undefined) =>
    iso ? Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000) : null

  const dernierEchange = activites?.[0]?.occurred_at ?? null
  const dernierRdv = rdvs?.[0] ?? null

  const contexte = [
    `Prénom/nom du prospect : ${c.full_name}`,
    c.company && `Entreprise : ${c.company}`,
    c.main_pain && `Problème exprimé : ${c.main_pain}`,
    c.notes && `Notes internes : ${c.notes}`,
    `Étape actuelle dans le pipeline : ${etape.label}`,
    motif && `Motif de perte enregistré : ${motif.label}`,
    opp.is_nurturing && 'Marqué « nurturing » : pas mûr, à entretenir sans pousser.',
    opp.is_no_show && "A déjà manqué un rendez-vous (no-show).",
    opp.amount_signed
      ? `Montant signé : ${euros(opp.amount_signed)}`
      : opp.amount_proposed && `Montant proposé : ${euros(opp.amount_proposed)}`,
    dernierRdv &&
      `Dernier rendez-vous : ${jour(dernierRdv.scheduled_at)} — ${LIBELLE_STATUT_RDV[dernierRdv.status] ?? dernierRdv.status}`,
    dernierEchange &&
      `Dernier échange il y a ${joursDepuis(dernierEchange)} jour(s).`,
    `Opportunité ouverte il y a ${joursDepuis(opp.created_at)} jour(s).`,
  ].filter(Boolean).join('\n')

  const historique = (activites ?? [])
    .slice()
    .reverse()
    .map((a) =>
      `- ${jour(a.occurred_at)} · ${LIBELLE_ACTIVITE[a.type] ?? a.type} ${a.direction}` +
      (a.outcome ? ` (${a.outcome.replace(/_/g, ' ')})` : '') +
      (a.content ? ` : ${a.content}` : ''),
    )
    .join('\n') || '(aucun échange encore loggé)'

  const systeme = [
    "Tu rédiges des messages WhatsApp de relance commerciale pour Altitude, un programme d'accompagnement à l'IA pour indépendants et dirigeants de petites structures.",
    `Tu écris à la place de ${profil.full_name}, qui vend lui-même.`,
    '',
    'Règles :',
    '- Français, tutoiement, ton direct et chaleureux — jamais corporate.',
    '- Format WhatsApp : 3 à 5 phrases courtes, sautes de ligne, aucune formule de politesse figée.',
    "- Pas d'objet, pas de signature, pas de « Cher ».",
    '- Au plus un emoji, et seulement s\'il apporte quelque chose.',
    "- Raccroche-toi à un élément concret du contexte (ce qu'il a dit, un RDV manqué, le temps écoulé).",
    '- Termine par une seule question simple, facile à répondre en un mot.',
    "- Ne promets rien qui ne figure pas dans le contexte, n'invente ni prix ni date.",
    '- Ne relance pas comme un robot : si le dernier échange est très récent, sois léger.',
    '',
    'Réponds uniquement par le message, sans guillemets ni commentaire.',
  ].join('\n')

  const utilisateur = [
    'CONTEXTE',
    contexte,
    '',
    'HISTORIQUE DES ÉCHANGES',
    historique,
    '',
    consigne.trim() ? `CONSIGNE PARTICULIÈRE\n${consigne.trim()}` : '',
  ].filter(Boolean).join('\n')

  try {
    const reponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cle}`,
      },
      body: JSON.stringify({
        model: MODELE,
        temperature: 0.8,
        max_tokens: 400,
        messages: [
          { role: 'system', content: systeme },
          { role: 'user', content: utilisateur },
        ],
      }),
    })

    if (!reponse.ok) {
      const corps = await reponse.text()
      if (reponse.status === 401) {
        return { ok: false, erreur: 'Clé OpenAI refusée (401). Vérifie OPENAI_API_KEY.' }
      }
      if (reponse.status === 429) {
        return { ok: false, erreur: 'Quota OpenAI atteint ou trop de requêtes (429).' }
      }
      if (reponse.status === 404) {
        return { ok: false, erreur: `Modèle « ${MODELE} » indisponible sur ce compte. Change OPENAI_MODEL dans .env.local.` }
      }
      return { ok: false, erreur: `OpenAI a répondu ${reponse.status} : ${corps.slice(0, 300)}` }
    }

    const data = (await reponse.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    const message = data.choices?.[0]?.message?.content?.trim()

    if (!message) return { ok: false, erreur: 'OpenAI a renvoyé une réponse vide.' }

    return { ok: true, message }
  } catch (e) {
    return {
      ok: false,
      erreur: e instanceof Error ? `Appel OpenAI impossible : ${e.message}` : 'Appel OpenAI impossible.',
    }
  }
}
