import type { Metadata } from 'next'
import './globals.css'
import { ConfigNavigateur } from '@/components/config-navigateur'

/**
 * Rendu à la demande pour TOUTE l'application, y compris /login.
 * Une page prérendue au build figerait la configuration Supabase dans son
 * HTML — vide si le build tourne sans environnement, ce qui est justement
 * le cas sur une plateforme de déploiement.
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'CRM Altitude',
  description: 'Pipeline de vente Altitude — lead à vente, mesuré étape par étape.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        {/* Avant tout script de l'application : le client Supabase du
            navigateur lit cette configuration au moment où il se crée. */}
        <ConfigNavigateur />
      </head>
      <body className="min-h-screen">{children}</body>
    </html>
  )
}
