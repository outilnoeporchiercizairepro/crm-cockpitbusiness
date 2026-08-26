import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/** Décrit une variable sans jamais en révéler la valeur. */
function etat(nom: string) {
  const brute = process.env[nom]

  if (brute === undefined || brute === '') {
    return { presente: false, probleme: 'absente' }
  }

  // Piège fréquent : des guillemets saisis autour de la valeur dans
  // l'interface de la plateforme. Ils font partie de la chaîne et
  // rendent l'URL invalide.
  if (/^["']|["']$/.test(brute)) {
    return { presente: true, probleme: 'entourée de guillemets — retire-les' }
  }
  if (brute !== brute.trim()) {
    return { presente: true, probleme: 'espace en début ou fin de valeur' }
  }

  return { presente: true, probleme: null, longueur: brute.length }
}

function etatUrl(nom: string) {
  const base = etat(nom)
  if (!base.presente || base.probleme) return base

  const brute = process.env[nom]!
  try {
    const u = new URL(brute)
    if (u.protocol !== 'https:') {
      return { ...base, probleme: `protocole ${u.protocol} au lieu de https:` }
    }
    return { ...base, hote: u.host }
  } catch {
    return { ...base, probleme: "n'est pas une URL valide" }
  }
}

/**
 * Sonde de vivacité, et diagnostic de configuration.
 *
 * Ne lit aucune donnée et ne révèle aucune valeur : seulement la présence et
 * la forme des variables attendues. C'est la même information que le message
 * d'erreur du serveur, mais consultable depuis un navigateur — indispensable
 * quand la plateforme masque les logs derrière plusieurs écrans.
 */
export async function GET() {
  const configuration = {
    NEXT_PUBLIC_SUPABASE_URL: etatUrl('NEXT_PUBLIC_SUPABASE_URL'),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: etat('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    SUPABASE_SECRET_KEY: etat('SUPABASE_SECRET_KEY'),
  }

  const manquantes = Object.entries(configuration)
    .filter(([, e]) => !e.presente || e.probleme)
    .map(([nom]) => nom)

  return NextResponse.json(
    {
      // Toujours 200 : la sonde dit « ce conteneur répond ». La rendre
      // rouge sur une configuration incomplète ferait sortir le conteneur
      // du routage, et l'erreur redeviendrait un 502 muet.
      statut: 'ok',
      pret: manquantes.length === 0,
      aCorriger: manquantes,
      configuration,
      horodatage: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
