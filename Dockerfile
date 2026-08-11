# Multi-stage: build deps in one layer, ship only what runs.
FROM node:22-alpine AS deps
WORKDIR /app
# Copy manifests alone first — this layer is cached and only rebuilds when dependencies change,
# not on every source edit.
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app

# dumb-init becomes PID 1. Without it Node IS PID 1, and PID 1 on Linux ignores signals that
# have no explicit handler — which breaks the graceful shutdown in core/lifecycle.js and makes
# every deploy a hard kill. It also reaps zombie processes.
RUN apk add --no-cache dumb-init

ENV NODE_ENV=production
ENV PORT=5010

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Writable dirs must exist and be owned by the runtime user before we drop privileges.
RUN mkdir -p storage/logs storage/uploads && chown -R node:node /app

# Never run as root: a container escape from a root process is a host compromise.
USER node

EXPOSE 5010

# Docker's own check. Orchestrators generally use their own probes against these same paths —
# /health for liveness, /ready for readiness (see core/health.js for why they differ).
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||5010)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
