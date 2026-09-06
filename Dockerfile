# TECSOPS — Node Ops runtime (Express + static + /api + socket.io).
#
# Railway: builder=DOCKERFILE. Rebuild: merge main → Railway redeploy image này.

FROM node:20-bookworm-slim AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite inlines VITE_* at build time — Railway maps matching service vars to these ARGs.
ARG VITE_DATA_SUPABASE_URL
ARG VITE_DATA_SUPABASE_ANON_KEY
ENV VITE_DATA_SUPABASE_URL=$VITE_DATA_SUPABASE_URL
ENV VITE_DATA_SUPABASE_ANON_KEY=$VITE_DATA_SUPABASE_ANON_KEY

RUN npm run build

FROM node:20-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/railway.toml ./railway.toml
COPY --from=builder /app/nixpacks.toml ./nixpacks.toml

EXPOSE 3001

CMD ["node", "scripts/start-fullstack.mjs"]
