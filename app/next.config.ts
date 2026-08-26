import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Sortie autonome : Next produit un serveur minimal avec uniquement les
  // dépendances réellement utilisées. Sans ça, l'image Docker embarquerait
  // tout node_modules (plusieurs centaines de Mo pour rien).
  output: 'standalone',

  // Masque la pastille « N » de Next.js en bas à gauche pendant le
  // développement. Purement cosmétique : elle n'existe pas en production.
  devIndicators: false,
}

export default nextConfig
