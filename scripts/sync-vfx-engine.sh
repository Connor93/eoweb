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
#
# Usage: scripts/sync-vfx-engine.sh --check [AIO_EDITOR_DIR]
#   Read-only parity guard — writes nothing. Fails (exit 1) if the vendored
#   copy has drifted from canonical:
#     - a source file's body (dest minus its prepended header line) differs
#       from the source file, byte for byte
#     - a source file has no counterpart in the destination (never synced)
#     - a destination file has no counterpart in the source (stale orphan —
#       e.g. left behind by a source file rename/deletion that was never
#       re-synced)
#   Prints one line per file plus a pass/fail summary. Intended for `pnpm
#   vfx:parity` / CI — run it any time after a sync to prove the trees match.
#
# Env: VFX_PARITY_OPTIONAL=1
#   Turns "aio-editor checkout not found" from a hard error into a skip
#   (message + exit 0). Set by `pnpm vfx:parity:optional`, which the
#   lefthook pre-commit hook uses: a contributor who has only cloned eoweb
#   must never have their commit rejected because a SIBLING repository
#   isn't on their disk. Leave it unset for an explicit, human-run check
#   (`pnpm vfx:parity`), where a missing sibling really is a failure to
#   report rather than something to paper over.

CHECK_MODE=0
if [[ "${1:-}" == "--check" ]]; then
  CHECK_MODE=1
  shift
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EOWEB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC_DIR="$EOWEB_DIR/src/vfx-engine"

AIO_EDITOR_DIR="${1:-${AIO_EDITOR_DIR:-$EOWEB_DIR/../aio-editor}}"
if [[ ! -d "$AIO_EDITOR_DIR" ]]; then
  if [[ "${VFX_PARITY_OPTIONAL:-0}" == "1" ]]; then
    echo "vfx-engine parity: SKIPPED (no aio-editor checkout at $AIO_EDITOR_DIR)"
    exit 0
  fi
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

if [[ "$CHECK_MODE" -eq 1 ]]; then
  # Read-only: never creates DEST_DIR. A missing DEST_DIR just means every
  # source file is reported "never synced" below.
  fail=0
  src_count=0
  drifted_list=""
  missing_list=""
  orphan_list=""

  for src in "$SRC_DIR"/*.ts; do
    name="$(basename "$src")"
    src_count=$((src_count + 1))
    dest="$DEST_DIR/$name"
    if [[ ! -f "$dest" ]]; then
      echo "  MISSING (never synced to aio-editor): $name"
      missing_list="$missing_list $name"
      fail=1
      continue
    fi
    # Strip the prepended header line (line 1) before comparing — that line
    # is expected to differ (it doesn't exist in the source at all).
    if diff -q <(tail -n +2 "$dest") "$src" >/dev/null 2>&1; then
      echo "  ok:      $name"
    else
      echo "  DRIFTED: $name (vendored body no longer matches canonical)"
      drifted_list="$drifted_list $name"
      fail=1
    fi
  done

  if [[ -d "$DEST_DIR" ]]; then
    for dest in "$DEST_DIR"/*.ts; do
      [[ -e "$dest" ]] || continue
      name="$(basename "$dest")"
      if [[ ! -f "$SRC_DIR/$name" ]]; then
        echo "  ORPHAN (no canonical source in eoweb): $name"
        orphan_list="$orphan_list $name"
        fail=1
      fi
    done
  fi

  echo
  if [[ "$fail" -eq 0 ]]; then
    echo "vfx-engine parity: OK ($src_count file(s) match between eoweb and aio-editor)"
    exit 0
  fi

  echo "vfx-engine parity: FAILED"
  [[ -n "$drifted_list" ]] && echo "  drifted:$drifted_list"
  [[ -n "$missing_list" ]] && echo "  missing in aio-editor (never synced):$missing_list"
  [[ -n "$orphan_list" ]] && echo "  orphaned in aio-editor (stale, no canonical source):$orphan_list"
  echo "  -> fix: eoweb/scripts/sync-vfx-engine.sh"
  exit 1
fi

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
