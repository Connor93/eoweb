# eoweb GFX compression + caching — design

**Date:** 2026-06-12
**Status:** Approved (design); implementation pending
**Area:** eoweb static serving (`Dockerfile`, new `sws.toml`)

## Problem

eoweb ships **383 MB of `.egf`** GFX (PE files full of *uncompressed* DIB bitmaps; `gfx021.egf` alone is 123 MB) and the static server (`joseluisq/static-web-server`, "SWS") serves them with **no compression and no cache policy**. The GFX loader `fetch()`es each whole `.egf` as one `arrayBuffer()` before rendering, so a fresh page load / first visit to a map shows a black screen for 10+ s while a multi-MB file downloads, and there's no browser caching so it recurs.

## Goal (this round)

Server-layer only, **no app/loader code changes**: cut GFX transfer size via compression and make repeat loads instant via caching.

### Non-goals (deferred)
- Loading UI / progress indicator (black-screen UX).
- Progressive/lazy loading, splitting EGF, or converting to WebP/atlas formats.
- Optimizing the 123 MB `gfx021` at the source.

## Design — all in the eoweb `Dockerfile` (+ one new `sws.toml`)

### 1. Precompress at build (builder stage)
After `pnpm build`, install brotli and compress every built `.egf` to a `.br` sibling, in parallel, keeping originals:
```dockerfile
RUN apk add --no-cache brotli \
 && find dist/gfx -name '*.egf' -print0 \
    | xargs -0 -P "$(nproc)" -I{} brotli -q 10 -o {}.br {}
```
- Quality 10 = good ratio, far faster than 11; parallel across cores so the 123 MB file doesn't dominate build time.
- Originals retained so SWS `compression-static` can fall back for any client not sending `Accept-Encoding: br`.
- Brotli only (eoweb is served over HTTPS to modern browsers, all of which accept `br`). Adding `.gz` later is a one-line option.

### 2. Serve precompressed + cache (runtime stage)
Add a baked `sws.toml` and run SWS against it (`-w` / `SERVER_CONFIG_FILE`). The config:
- Sets server root (`/home/sws/public`) and port (`80`) — matching the current base-image defaults.
- Enables **`compression-static`**: for `/gfx/gfx021.egf` with `Accept-Encoding: br`, SWS serves `gfx021.egf.br` with `Content-Encoding: br`. The browser's `fetch().arrayBuffer()` decompresses transparently → **GFX loader unchanged**.
- An `[[advanced.headers]]` rule sets `Cache-Control: public, max-age=86400` on `source = "/gfx/**"` (1 day — instant same-day repeat loads; a future GFX change propagates within ~a day; no cache-bust machinery needed).

Exact SWS TOML key casing for the general section is confirmed empirically in the verification step (the load-bearing facts — `.br` sibling serving via `compression-static`, and per-glob `Cache-Control` via `[[advanced.headers]]` — are confirmed against SWS docs).

### 3. Untouched
`config.json` mount, Traefik routing, compose file, and all app/loader code.

## Expected result
`gfx021.egf` transfers as roughly 30–50 MB instead of 123 MB (DIB bitmaps compress 50–80%); repeat loads within a day come from browser cache; the loader is unchanged. First-ever-load wait shrinks substantially but isn't eliminated (that's the deferred "+Loading UI / deeper rework").

## Tradeoffs / risks
- **Image size** grows ~+100 MB (the `.br` siblings alongside originals). Acceptable; the deploy already notes "large — bakes GFX."
- **Build time** grows (brotli over ~383 MB) — bounded by `-q 10` + parallelism.
- **Cache vs updates:** 1-day max-age means a GFX content change isn't seen by returning clients for up to a day. Acceptable for rarely-changing assets; bump shorter or add a `?v=` busting later if needed.

## Verification (manual — no test suite)
1. `docker build` the image locally.
2. `curl -s -H 'Accept-Encoding: br' -I localhost:<port>/gfx/gfx021.egf` → expect `Content-Encoding: br`, a `Content-Length` far below 123 MB, and `Cache-Control: public, max-age=86400`.
3. `curl -s -I localhost:<port>/gfx/gfx021.egf` (no `Accept-Encoding`) → original served, no `Content-Encoding`.
4. In-browser DevTools: `gfx021.egf` transfer size drops sharply; second load served `(disk cache)`.
5. Sanity: the game still renders sprites (loader decode path unaffected).

## Files touched
- `Dockerfile` — brotli precompress step (builder); add `sws.toml` + run SWS against it (runtime).
- `sws.toml` (new) — root/port, `compression-static`, `/gfx/**` Cache-Control.
