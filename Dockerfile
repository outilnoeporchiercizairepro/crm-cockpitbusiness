# =====================================================================
# CRM Altitude — image de production
#
# Contexte de build : la RACINE du dépôt (l'application vit dans app/).
#   docker build -t crm-altitude .
#
# ⚠️ Les variables NEXT_PUBLIC_* sont inscrites dans le bundle navigateur
# AU MOMENT DU BUILD, pas au démarrage. Elles doivent donc être passées en
# --build-arg. La clé de service, elle, ne doit JAMAIS l'être : un build-arg
# reste lisible dans les couches de l'image. Elle se fournit à l'exécution.
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

# Publiques par nature : elles partent dans le navigateur de toute façon.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

# Échoue tôt plutôt que de produire une image qui plantera à la connexion :
# sans ces valeurs, le bundle client contiendrait "undefined".
RUN test -n "$NEXT_PUBLIC_SUPABASE_URL" \
 || (echo "NEXT_PUBLIC_SUPABASE_URL manquante (--build-arg)" && exit 1)
RUN test -n "$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
 || (echo "NEXT_PUBLIC_SUPABASE_ANON_KEY manquante (--build-arg)" && exit 1)

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

# wget est présent dans l'image alpine de node : pas de dépendance à ajouter.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/sante || exit 1

CMD ["node", "server.js"]
