#!/usr/bin/env bash
set -euo pipefail
# Vendors the framework-agnostic vfx-engine (src/vfx-engine/*.ts) verbatim
# into aio-editor's frontend, so pub-authoring suggestions can be regenerated
# from the real effect palette instead of a hand-maintained list. The engine
# has zero imports outside its own directory (no Pixi/Preact/repo modules),
# which is what makes copying it into a different app safe.
#
# Each destination file gets a single do-not-edit header line prepended, then
# the source content verbatim and unmodified — nothing else is rewritten (the
# files only use relative `./` imports internally, so they need no import
# rewriting to work from a new location). This script never reads the
# destination, only the source, so it is idempotent: running it any number of
# times produces byte-identical output, and `git status` is unchanged on a
# second run. Destination files whose source no longer exists are removed, so
# the destination is always an exact mirror (+ header) of the source.
#
# Do NOT hand-edit the aio-editor copy. If it's wrong, fix it here and re-run
# this script.
#
# Usage: scripts/sync-vfx-engine.sh [AIO_EDITOR_DIR]
#   AIO_EDITOR_DIR defaults to $AIO_EDITOR_DIR env, else ../aio-editor next to
#   this repo checkout.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EOWEB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC_DIR="$EOWEB_DIR/src/vfx-engine"

AIO_EDITOR_DIR="${1:-${AIO_EDITOR_DIR:-$EOWEB_DIR/../aio-editor}}"
if [[ ! -d "$AIO_EDITOR_DIR" ]]; then
  echo "aio-editor checkout not found: $AIO_EDITOR_DIR" >&2
  exit 1
fi
AIO_EDITOR_DIR="$(cd "$AIO_EDITOR_DIR" && pwd)"
DEST_DIR="$AIO_EDITOR_DIR/packages/frontend/src/vfx-engine"

if [[ ! -d "$SRC_DIR" ]]; then
  echo "vfx-engine source not found: $SRC_DIR" >&2
  exit 1
fi

HEADER="// SYNCED FROM eoweb src/vfx-engine — DO NOT EDIT HERE. Regenerate: eoweb/scripts/sync-vfx-engine.sh"

mkdir -p "$DEST_DIR"

copied=0
for src in "$SRC_DIR"/*.ts; do
  name="$(basename "$src")"
  dest="$DEST_DIR/$name"
  { printf '%s\n' "$HEADER"; cat "$src"; } > "$dest"
  copied=$((copied + 1))
  echo "  synced:  $name"
done

# Mirror deletions: drop any destination file whose source no longer exists.
removed=0
if [[ -d "$DEST_DIR" ]]; then
  for dest in "$DEST_DIR"/*.ts; do
    [[ -e "$dest" ]] || continue
    name="$(basename "$dest")"
    if [[ ! -f "$SRC_DIR/$name" ]]; then
      rm "$dest"
      removed=$((removed + 1))
      echo "  removed: $name (no longer in source)"
    fi
  done
fi

summary="vfx-engine sync: $copied file(s) -> $DEST_DIR"
if [[ "$removed" -gt 0 ]]; then
  summary="$summary, $removed stale file(s) removed"
fi
echo "$summary"
