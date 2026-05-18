FROM node:24-alpine

WORKDIR /app

COPY package.json ./
COPY server.mjs ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts
COPY storage ./storage

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321

EXPOSE 4321

CMD ["node", "server.mjs"]
