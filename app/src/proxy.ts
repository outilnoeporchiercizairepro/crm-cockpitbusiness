import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// /api/sante doit répondre sans session : c'est la sonde des conteneurs.
const PUBLIC_PATHS = ['/login', '/desactive', '/api/sante']

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // getClaims() vérifie la signature localement (jetons ES256) au lieu
  // d'interroger le serveur d'authentification à chaque requête — y compris
  // sur les préchargements. Il rafraîchit tout de même la session quand le
  // jeton approche de l'expiration, et c'est là que setAll ci-dessus sert.
  // Contrairement à getSession(), il ne fait pas confiance au cookie sans
  // l'avoir vérifié.
  const { data } = await supabase.auth.getClaims()
  const connecte = !!data?.claims?.sub

  const { pathname } = request.nextUrl
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p))

  if (!connecte && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('suite', pathname)
    return NextResponse.redirect(url)
  }

  if (connecte && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
