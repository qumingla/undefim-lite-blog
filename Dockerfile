FROM node:24-bookworm-slim
ENV NODE_ENV=production ASTRO_TELEMETRY_DISABLED=1 HOST=0.0.0.0 PORT=4322 DATA_DIR=/app/data
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund
COPY astro.config.mjs tsconfig.json ./
COPY server ./server
COPY scripts ./scripts
COPY src ./src
COPY admin ./admin
COPY public ./public
RUN npx vite build --config admin/vite.config.ts && mkdir -p /app/data /app/.astro && chown -R node:node /app
USER node
EXPOSE 4322
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 CMD node -e "fetch('http://127.0.0.1:4322/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh","-c","node scripts/initialize.mjs && node server/index.mjs"]
