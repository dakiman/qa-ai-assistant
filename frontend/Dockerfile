FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# Bake the API URL at build time. Default is the relative /api/v1 used in production
# (reverse-proxied to the backend by the parent server). Dev compose overrides via
# --build-arg NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
ARG NEXT_PUBLIC_API_URL=/api/v1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Skip generate-types (api-types.ts is committed); run next build directly
RUN npx next build

FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
# Next's standalone server binds to $HOSTNAME, which Docker sets to the container
# id — that isn't loopback, so an in-container healthcheck to localhost fails.
# Pin it to 0.0.0.0 so it listens on all interfaces (including loopback).
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# The standalone server is read-only at runtime, so drop root. node:alpine ships
# a `node` user (uid 1000); the copied files are world-readable.
USER node

EXPOSE 3000

# Readiness probe for depends_on and the operator (busybox wget on alpine).
# Use 127.0.0.1, not localhost: the server binds IPv4 0.0.0.0, but localhost
# resolves to IPv6 ::1 first inside the container and would be refused.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null 2>&1 || exit 1

CMD ["node", "server.js"]
