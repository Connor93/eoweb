FROM node:24-alpine AS builder

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
# Pin pnpm to package.json's packageManager. Unpinned installs drifted onto
# 11.x, which aborts with "Cannot verify the identity of the
# @pnpm/exe.linux-x64 native binary" against this lockfileVersion 9 file.
RUN npm install -g pnpm@10.33.2
RUN pnpm install --frozen-lockfile

COPY . .

# Bake the production WebSocket host into the bundle so a missed /config.json
# fetch can never fall back to the dev socket. Passed by deploy.sh; empty in a
# plain `docker build` (then consts.ts falls back to the dev default).
ARG VITE_WS_HOST=""
ENV VITE_WS_HOST=$VITE_WS_HOST
RUN pnpm build

# Pre-compress the GFX (huge PE files full of zero-padded/redundant DIB bitmaps
# — they brotli down to ~1-20% of original). Done once here so the runtime can
# serve the .br sibling with Content-Encoding: br and zero per-request CPU.
# Originals are kept so non-br clients still work via compression-static.
RUN apk add --no-cache brotli \
 && find dist/gfx -name '*.egf' -print0 \
    | xargs -0 -P "$(nproc)" -n 1 brotli -q 10 -f

FROM joseluisq/static-web-server:2-alpine AS runtime

COPY --from=builder /app/dist /home/sws/public
COPY sws.toml /etc/sws.toml

# Serve pre-compressed .br siblings + apply the /gfx cache policy from the
# config. Config-file options take precedence over the base image's env.
ENV SERVER_CONFIG_FILE=/etc/sws.toml

EXPOSE 80
