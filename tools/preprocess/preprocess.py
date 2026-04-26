"""DICOM → .raw + manifest.json preprocessor (stub).

Real implementation lands week 1-2 and will:
  1. Walk the input directory for DICOM files.
  2. Sort slices by ImagePositionPatient or InstanceNumber.
  3. Validate consistent rows/cols/spacing across slices.
  4. Apply rescale slope/intercept to convert pixel values to HU.
  5. Stack into a 3D numpy int16 volume.
  6. Write <out>/volume.raw (little-endian int16) + manifest.json.

The stub below produces a 32^3 phantom matching that file layout, so the browser
loader can be exercised end-to-end before real DICOM ingestion is wired in.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

import numpy as np


SCHEMA = "zizi-volume/v1"


def synthesize_phantom(size: int = 32) -> np.ndarray:
    """Return an int16 cube identical in shape to dicom/phantom.ts output."""
    grid = np.indices((size, size, size), dtype=np.float32)
    z, y, x = grid
    c = (size - 1) / 2.0
    sphere_r2 = (size * 0.35) ** 2
    cube_r = size * 0.45
    d2 = (x - c) ** 2 + (y - c) ** 2 + (z - c) ** 2

    out = np.full((size, size, size), -1000, dtype=np.int16)
    inside_cube = (np.abs(x - c) < cube_r) & (np.abs(y - c) < cube_r) & (np.abs(z - c) < cube_r)
    t = z / max(1, size - 1)
    out[inside_cube] = np.round(-200 + 400 * t[inside_cube]).astype(np.int16)
    out[d2 < sphere_r2] = 700
    return out


def write_volume(out_dir: Path, volume: np.ndarray, spacing_mm: tuple[float, float, float]) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    raw_path = out_dir / "volume.raw"
    manifest_path = out_dir / "manifest.json"

    raw_bytes = volume.astype(np.int16, copy=False).tobytes(order="C")
    raw_path.write_bytes(raw_bytes)
    sha256 = hashlib.sha256(raw_bytes).hexdigest()

    depth, height, width = volume.shape
    manifest = {
        "schema": SCHEMA,
        "extent": {"width": int(width), "height": int(height), "depth": int(depth)},
        "spacing": {"x": float(spacing_mm[0]), "y": float(spacing_mm[1]), "z": float(spacing_mm[2])},
        "modality": "CT",
        "dtype": "int16",
        "minValue": int(volume.min()),
        "maxValue": int(volume.max()),
        "rawSha256": sha256,
        "raw": "volume.raw",
    }
    manifest_path.write_text(json.dumps(manifest, indent=2))
    return manifest


def cmd_phantom(args: argparse.Namespace) -> int:
    vol = synthesize_phantom(args.size)
    manifest = write_volume(Path(args.out), vol, (args.spacing, args.spacing, args.spacing))
    print(json.dumps(manifest, indent=2))
    return 0


def cmd_dicom(args: argparse.Namespace) -> int:
    print(
        f"[zizi/preprocess] real DICOM ingest is a stub; would read {args.input} → {args.out}",
        file=sys.stderr,
    )
    print("[zizi/preprocess] for now use: preprocess phantom --out <dir>", file=sys.stderr)
    return 2


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="preprocess", description="DICOM → .raw + manifest.json")
    sub = p.add_subparsers(dest="cmd", required=True)

    p_phantom = sub.add_parser("phantom", help="emit a synthetic phantom volume")
    p_phantom.add_argument("--out", type=str, required=True)
    p_phantom.add_argument("--size", type=int, default=32)
    p_phantom.add_argument("--spacing", type=float, default=1.0)
    p_phantom.set_defaults(func=cmd_phantom)

    p_dicom = sub.add_parser("dicom", help="ingest a real DICOM series (TODO week 1-2)")
    p_dicom.add_argument("input", type=str)
    p_dicom.add_argument("--out", type=str, required=True)
    p_dicom.set_defaults(func=cmd_dicom)

    args = p.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
