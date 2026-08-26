# =====================================================================
# CRM Altitude — image de production
#
# Contexte de build : la RACINE du dépôt (l'application vit dans app/).
#   docker build -t crm-altitude .
#
# Aucune variable n'est nécessaire au build : l'application lit sa
# configuration Supabase au DÉMARRAGE et l'injecte dans la page. La même
# image fonctionne donc dans n'importe quel environnement.
#
# Tout se règle en variables d'environnement du conteneur :
#   NEXT_PUBLIC_SUPABASE_URL       (publique)
#   NEXT_PUBLIC_SUPABASE_ANON_KEY  (publique)
#   SUPABASE_SECRET_KEY            (secrète — jamais en --build-arg,
#                                   un argument de build reste lisible
#                                   dans les couches de l'image)
# =====================================================================

# ---------- 1. Dépendances -------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app

# npm ci exige le couple package.json + package-lock.json et installe
# exactement ce que le lockfile décrit.
COPY app/package.json app/package-lock.json ./
RUN npm ci

# ---------- 2. Build --------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY app/ ./

# Build sans secret ni configuration : rien d'environnemental n'est figé
# dans l'image, et elle est donc rejouable à l'identique.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------- 3. Exécution ---------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Utilisateur non privilégié : un serveur web n'a aucune raison d'être root.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# La sortie « standalone » embarque uniquement les dépendances réellement
# atteintes par le code. Les fichiers statiques et public/ ne sont pas
# inclus dedans : ils se copient à part.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

# Sonde écrite avec node : c'est le seul binaire dont la présence dans
# l'image soit garantie. S'appuyer sur wget ou curl fait dépendre la santé
# du conteneur d'un outil qui peut manquer — et une sonde qui échoue
# toujours fait sortir le conteneur du routage, ce qui se manifeste par un
# 502 sans autre explication.
#
# start-period généreux : le premier démarrage doit avoir le temps de se
# faire avant que les échecs ne comptent.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/sante').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
