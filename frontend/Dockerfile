# Frontend: Next.js (Standalone-Build)
#   docker build -t pv-prognose-frontend --build-context certs=certs \n#     --build-arg NEXT_PUBLIC_API_URL=https://api.example.de/api/v1 frontend
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Zusätzliche Stammzertifikate aus certs/ (Kontext „certs“, siehe docker-compose.yml)
COPY --from=certs . /tmp/certs/
RUN cat /tmp/certs/*.crt > /tmp/extra-ca.pem 2>/dev/null || true;     if [ -s /tmp/extra-ca.pem ]; then export NODE_EXTRA_CA_CERTS=/tmp/extra-ca.pem; fi;     npm ci

FROM node:22-alpine AS build
WORKDIR /app
# Adresse des Backends, wie der BROWSER sie erreicht. Wird beim Build fest eingebaut.
# Leer = gleicher Hostname wie die Website, Port 8000 (siehe lib/api/client.js).
ARG NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
