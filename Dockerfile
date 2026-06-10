FROM node:24-alpine AS builder

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

COPY . .

# Bake the production WebSocket host into the bundle so a missed /config.json
# fetch can never fall back to the dev socket. Passed by deploy.sh; empty in a
# plain `docker build` (then consts.ts falls back to the dev default).
ARG VITE_WS_HOST=""
ENV VITE_WS_HOST=$VITE_WS_HOST
RUN pnpm build

FROM joseluisq/static-web-server:2-alpine AS runtime

COPY --from=builder /app/dist /home/sws/public

EXPOSE 80
