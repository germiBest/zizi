#!/usr/bin/env bash
# Generate a 128³ synthetic phantom under public/datasets/phantom-128 so the
# browser loader can be exercised end-to-end without a real DICOM dataset.

set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT/tools/preprocess"

if ! command -v uv >/dev/null 2>&1; then
  echo "uv is required: https://docs.astral.sh/uv/" >&2
  exit 1
fi

uv sync --quiet

OUT="$ROOT/public/datasets/phantom-128"
uv run preprocess phantom --out "$OUT" --size 128 --spacing 1.5

echo
echo "wrote: $OUT/volume.raw + manifest.json"
echo "load:  http://localhost:5173/?volume=/datasets/phantom-128/manifest.json"
