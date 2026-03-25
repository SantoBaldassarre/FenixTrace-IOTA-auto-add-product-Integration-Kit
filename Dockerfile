# ═══════════════════════════════════════════════════════
# FenixTrace Integration Kit — Docker Image
# ═══════════════════════════════════════════════════════

# ── Base ──────────────────────────────────────────────
FROM node:18-alpine AS base
WORKDIR /app
RUN apk add --no-cache wget curl
COPY package*.json ./

# ── Development ──────────────────────────────────────
FROM base AS development
RUN npm ci
COPY . .
RUN mkdir -p uploads processed logs && chmod 755 uploads processed logs
EXPOSE 3005 9229
CMD ["npm", "run", "dev"]

# ── Production ───────────────────────────────────────
FROM base AS production
RUN npm ci --omit=dev && npm cache clean --force
COPY . .
RUN mkdir -p uploads processed logs && chmod 755 uploads processed logs
RUN addgroup -g 1001 -S nodejs && \
    adduser -S fenixtrace -u 1001 -G nodejs && \
    chown -R fenixtrace:nodejs /app
USER fenixtrace
EXPOSE 3005
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3005/health || exit 1
CMD ["node", "server.js"]

# Default target
FROM production
