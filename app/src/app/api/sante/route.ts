import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Sonde de vivacité pour Docker, Dokploy ou un load balancer.
 *
 * Volontairement sans appel à Supabase : elle répond « ce conteneur sert des
 * requêtes ». Y ajouter un test de base ferait redémarrer l'application à
 * chaque hoquet réseau côté Supabase, alors que le conteneur, lui, va bien.
 */
export async function GET() {
  return NextResponse.json(
    { statut: 'ok', horodatage: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
