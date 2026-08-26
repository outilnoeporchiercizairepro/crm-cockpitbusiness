import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Masque la pastille « N » de Next.js en bas à gauche pendant le
  // développement. Purement cosmétique : elle n'existe pas en production.
  devIndicators: false,
}

export default nextConfig
