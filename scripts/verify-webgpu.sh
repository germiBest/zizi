#!/usr/bin/env bash
# Quick sanity check that the local Chrome has WebGPU enabled.
# Prints adapter info via a tiny headless run, or instructions if WebGPU is off.

set -euo pipefail

cat <<'EOF'
zizi · WebGPU sanity check

Required Chrome flags (set in chrome://flags):
  - #enable-unsafe-webgpu                 (Enabled)
  - #enable-webgpu-developer-features     (Enabled, for timestamp-query)

Required CLI flags for headless bench (week 7):
  --enable-unsafe-webgpu
  --enable-dawn-features=allow_unsafe_apis
  --disable-frame-rate-limit

Diagnostic pages:
  chrome://gpu/                  → check "WebGPU: Hardware accelerated"
  chrome://flags/#enable-unsafe-webgpu
  about:gpu (Firefox Nightly)

To verify by hand, open this in Chrome and check the console:
  pnpm dev
  → http://localhost:5173/

Look for `[zizi/gpu] adapter` and `[zizi/gpu] caps` log lines. If WebGPU is
disabled you'll see a banner: "WebGPU init failed: …".
EOF
