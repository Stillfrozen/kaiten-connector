FROM node:20-slim

WORKDIR /app

# Reproducible install from the lockfile (fails if package-lock.json is stale
# or missing). Avoids pulling in unexpected transitive versions at build time.
COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build && npm prune --production

# Drop root before running the app. Built artifacts are world-readable
# (default umask), so the unprivileged `node` user can still execute them.
USER node

EXPOSE 3000

# Lightweight healthcheck using node's built-in fetch (no wget/curl in slim).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
