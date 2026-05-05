"""DICOM → .raw (or .j2c) + manifest.json preprocessor.

Supports four output shapes, selected via flags:

  default           v1 raw — single .raw blob, single manifest (legacy shape)
  --compress htj2k  v1 htj2k — per-slice .j2c codestreams under level-0/, schema unchanged
  --pyramid         v2 pyramid raw — multiple resolution levels, each with its own .raw
  --compress + --pyramid  v2 pyramid htj2k — pyramid with HTJ2K-encoded slices per level

Anisotropic per-axis halving guarded by physical extent: an axis only halves when both
(a) the next dim ≥ 16 voxels, and (b) the next physical extent ≥ 8 mm. Thick-slice CT
will see z stop halving early while xy continues — so coarser levels stay anatomically
useful instead of degenerating into 8×8×500 noodles.

HTJ2K encoding shells out to OpenJPH's `ojph_compress` (install: `brew install openjph`).
Slices are signed int16 raw, encoded with `-signed true -bit_depth 16 -reversible true`
for lossless. We don't depend on imagecodecs for the production path because OpenJPH
and OpenJPEG produce subtly different codestream marker layouts that have caused
real interop bugs with @cornerstonejs/codec-openjph in the past.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Iterable

import numpy as np


SCHEMA_V1 = "zizi-volume/v1"
SCHEMA_V2 = "zizi-volume/v2"
COMPRESSED_TS_PREFIX = "1.2.840.10008.1.2.4."

# Pyramid heuristic: stop halving an axis when either condition is violated.
PYRAMID_AXIS_MIN_VOXELS = 16
PYRAMID_AXIS_MIN_EXTENT_MM = 8.0
PYRAMID_DEFAULT_MAX_LEVELS = 4


# -----------------------------------------------------------------------------
# Phantom (unchanged)


def synthesize_phantom(size: int = 32) -> np.ndarray:
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


# -----------------------------------------------------------------------------
# v1 raw — original, kept for backward compat with tests


def write_volume(
    out_dir: Path,
    volume: np.ndarray,
    spacing_mm: tuple[float, float, float],
    modality: str = "CT",
) -> dict:
    """v1 raw single-level write. Returns the manifest dict."""
    out_dir.mkdir(parents=True, exist_ok=True)
    raw_path = out_dir / "volume.raw"
    manifest_path = out_dir / "manifest.json"

    contiguous = np.ascontiguousarray(volume.astype(np.int16))
    if contiguous.dtype.byteorder == ">":
        contiguous = contiguous.byteswap().view(np.int16)
    raw_bytes = contiguous.tobytes(order="C")
    raw_path.write_bytes(raw_bytes)
    sha256 = hashlib.sha256(raw_bytes).hexdigest()

    depth, height, width = volume.shape
    manifest = {
        "schema": SCHEMA_V1,
        "extent": {"width": int(width), "height": int(height), "depth": int(depth)},
        "spacing": {
            "x": float(spacing_mm[0]),
            "y": float(spacing_mm[1]),
            "z": float(spacing_mm[2]),
        },
        "modality": modality,
        "dtype": "int16",
        "minValue": int(volume.min()),
        "maxValue": int(volume.max()),
        "rawSha256": sha256,
        "raw": "volume.raw",
        "compression": "none",
    }
    manifest_path.write_text(json.dumps(manifest, indent=2))
    return manifest


# -----------------------------------------------------------------------------
# HTJ2K encoding via ojph_compress shell-out


def _ojph_available() -> bool:
    return shutil.which("ojph_compress") is not None


def encode_htj2k_slice(
    slice_int16: np.ndarray,
) -> bytes:
    """Encode a single (h, w) int16 slice as a lossless HTJ2K codestream.

    Writes the array to a temp .raw (LE int16), invokes ojph_compress in YUV mode
    with -signed true -bit_depth 16, returns the encoded bytes.
    """
    if not _ojph_available():
        raise SystemExit(
            "ojph_compress not found. Install OpenJPH (brew install openjph on macOS) "
            "or build from https://github.com/aous72/OpenJPH."
        )
    if slice_int16.ndim != 2:
        raise ValueError(f"expected 2D slice, got shape {slice_int16.shape}")
    if slice_int16.dtype != np.int16:
        slice_int16 = slice_int16.astype(np.int16)

    height, width = slice_int16.shape

    with tempfile.NamedTemporaryFile(suffix=".raw", delete=False) as f_in:
        # Force little-endian so the shell-out is platform-independent.
        contiguous = np.ascontiguousarray(slice_int16)
        if contiguous.dtype.byteorder == ">":
            contiguous = contiguous.byteswap().view(np.int16)
        f_in.write(contiguous.tobytes(order="C"))
        in_path = f_in.name

    out_path = in_path.replace(".raw", ".j2c")
    try:
        result = subprocess.run(
            [
                "ojph_compress",
                "-i", in_path,
                "-o", out_path,
                "-dims", f"{{{width},{height}}}",
                "-num_comps", "1",
                "-signed", "true",
                "-bit_depth", "16",
                "-downsamp", "{1,1}",
                "-reversible", "true",
            ],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise SystemExit(
                f"ojph_compress failed (rc={result.returncode}):\n"
                f"stdout: {result.stdout}\nstderr: {result.stderr}"
            )
        with open(out_path, "rb") as f:
            return f.read()
    finally:
        for p in (in_path, out_path):
            try:
                os.unlink(p)
            except FileNotFoundError:
                pass


# -----------------------------------------------------------------------------
# Pyramid


def _can_halve_axis(dim: int, voxel_mm: float) -> bool:
    next_dim = dim // 2
    next_extent = next_dim * (voxel_mm * 2)
    return next_dim >= PYRAMID_AXIS_MIN_VOXELS and next_extent >= PYRAMID_AXIS_MIN_EXTENT_MM


def build_pyramid_levels(
    volume: np.ndarray,
    spacing_mm: tuple[float, float, float],
    max_levels: int = PYRAMID_DEFAULT_MAX_LEVELS,
) -> list[dict]:
    """Generate up to `max_levels` resolution levels via per-axis trilinear halving.

    Returns level dicts with keys: 'level', 'data' (int16 numpy), 'spacing_scale' (x,y,z),
    where spacing_scale[i] is the level-0 spacing multiplier (so level 0 == 1.0).
    """
    from scipy.ndimage import zoom  # imported here to keep startup fast for non-pyramid runs

    levels: list[dict] = [
        {"level": 0, "data": volume.astype(np.int16, copy=False), "spacing_scale": (1.0, 1.0, 1.0)}
    ]

    for level_idx in range(1, max_levels):
        prev = levels[-1]
        depth, height, width = prev["data"].shape  # (z, y, x)
        sx, sy, sz = prev["spacing_scale"]

        cur_x = spacing_mm[0] * sx
        cur_y = spacing_mm[1] * sy
        cur_z = spacing_mm[2] * sz

        can_x = _can_halve_axis(width, cur_x)
        can_y = _can_halve_axis(height, cur_y)
        can_z = _can_halve_axis(depth, cur_z)

        if not (can_x or can_y or can_z):
            break

        zoom_x = 0.5 if can_x else 1.0
        zoom_y = 0.5 if can_y else 1.0
        zoom_z = 0.5 if can_z else 1.0

        # zoom takes (z, y, x)
        new_data_f = zoom(prev["data"].astype(np.float32), (zoom_z, zoom_y, zoom_x), order=1)
        new_data = np.round(new_data_f).astype(np.int16)

        new_scale = (
            sx * (2.0 if can_x else 1.0),
            sy * (2.0 if can_y else 1.0),
            sz * (2.0 if can_z else 1.0),
        )

        levels.append({"level": level_idx, "data": new_data, "spacing_scale": new_scale})

    return levels


# -----------------------------------------------------------------------------
# Combined writer (handles all four output shapes)


def write_processed_volume(
    out_dir: Path,
    volume: np.ndarray,
    spacing_mm: tuple[float, float, float],
    modality: str,
    compress: str = "none",
    pyramid: bool = False,
    max_levels: int = PYRAMID_DEFAULT_MAX_LEVELS,
) -> dict:
    """Dispatcher. Returns the manifest dict actually written to disk."""
    out_dir.mkdir(parents=True, exist_ok=True)

    if compress not in ("none", "htj2k"):
        raise SystemExit(f"unsupported compression: {compress}")

    if pyramid:
        levels_data = build_pyramid_levels(volume, spacing_mm, max_levels=max_levels)
        return _write_v2(out_dir, levels_data, spacing_mm, modality, compress)

    if compress == "none":
        return write_volume(out_dir, volume, spacing_mm, modality=modality)
    return _write_v1_htj2k(out_dir, volume, spacing_mm, modality)


def _write_v1_htj2k(
    out_dir: Path,
    volume: np.ndarray,
    spacing_mm: tuple[float, float, float],
    modality: str,
) -> dict:
    depth, height, width = volume.shape
    level_dir = out_dir / "level-0"
    level_dir.mkdir(parents=True, exist_ok=True)

    slices_meta = _encode_slices(level_dir, "level-0", volume)

    manifest = {
        "schema": SCHEMA_V1,
        "extent": {"width": int(width), "height": int(height), "depth": int(depth)},
        "spacing": {
            "x": float(spacing_mm[0]),
            "y": float(spacing_mm[1]),
            "z": float(spacing_mm[2]),
        },
        "modality": modality,
        "dtype": "int16",
        "minValue": int(volume.min()),
        "maxValue": int(volume.max()),
        "compression": "htj2k",
        "slices": slices_meta,
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))
    return manifest


def _write_v2(
    out_dir: Path,
    levels_data: list[dict],
    spacing_mm: tuple[float, float, float],
    modality: str,
    compress: str,
) -> dict:
    levels_meta = []
    for entry in levels_data:
        level_idx = entry["level"]
        data: np.ndarray = entry["data"]
        scale = entry["spacing_scale"]
        depth, height, width = data.shape
        level_dir = out_dir / f"level-{level_idx}"
        level_dir.mkdir(parents=True, exist_ok=True)

        if compress == "htj2k":
            slices_meta = _encode_slices(level_dir, f"level-{level_idx}", data)
            levels_meta.append({
                "level": int(level_idx),
                "extent": {"width": int(width), "height": int(height), "depth": int(depth)},
                "spacingScale": {
                    "x": float(scale[0]),
                    "y": float(scale[1]),
                    "z": float(scale[2]),
                },
                "compression": "htj2k",
                "slices": slices_meta,
                "minValue": int(data.min()),
                "maxValue": int(data.max()),
            })
        else:
            raw_bytes = np.ascontiguousarray(data.astype(np.int16)).tobytes(order="C")
            (level_dir / "volume.raw").write_bytes(raw_bytes)
            sha = hashlib.sha256(raw_bytes).hexdigest()
            levels_meta.append({
                "level": int(level_idx),
                "extent": {"width": int(width), "height": int(height), "depth": int(depth)},
                "spacingScale": {
                    "x": float(scale[0]),
                    "y": float(scale[1]),
                    "z": float(scale[2]),
                },
                "compression": "none",
                "raw": f"level-{level_idx}/volume.raw",
                "rawSha256": sha,
                "minValue": int(data.min()),
                "maxValue": int(data.max()),
            })

    full = levels_data[0]["data"]
    manifest = {
        "schema": SCHEMA_V2,
        "modality": modality,
        "spacing": {
            "x": float(spacing_mm[0]),
            "y": float(spacing_mm[1]),
            "z": float(spacing_mm[2]),
        },
        "minValue": int(full.min()),
        "maxValue": int(full.max()),
        "dtype": "int16",
        "levels": levels_meta,
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))
    return manifest


def _encode_slices(level_dir: Path, level_prefix: str, data: np.ndarray) -> list[dict]:
    """Encode each z-slice as HTJ2K, return manifest slice refs."""
    depth = data.shape[0]
    out: list[dict] = []
    for z in range(depth):
        j2c = encode_htj2k_slice(data[z])
        sha = hashlib.sha256(j2c).hexdigest()
        fname = f"slice-{z:04d}.j2c"
        (level_dir / fname).write_bytes(j2c)
        out.append({
            "file": f"{level_prefix}/{fname}",
            "sha256": sha,
            "byteLength": len(j2c),
        })
    return out


# -----------------------------------------------------------------------------
# DICOM ingest (unchanged from before, modulo passing through compress/pyramid)


def read_dicom_series(input_dir: Path) -> tuple[np.ndarray, tuple[float, float, float], str]:
    import pydicom

    candidates = sorted(p for p in input_dir.iterdir() if p.is_file())
    if not candidates:
        raise SystemExit(f"no files in {input_dir}")

    slices = []
    for f in candidates:
        try:
            ds = pydicom.dcmread(str(f))
        except Exception as e:
            print(f"[preprocess] skipping {f.name}: {e}", file=sys.stderr)
            continue
        ts = getattr(ds.file_meta, "TransferSyntaxUID", None) if hasattr(ds, "file_meta") else None
        if ts is not None and str(ts).startswith(COMPRESSED_TS_PREFIX):
            raise SystemExit(
                f"compressed DICOM (TransferSyntaxUID={ts}) is not yet supported. "
                f"Install pylibjpeg-libjpeg or pylibjpeg-openjpeg and retry."
            )
        slices.append(ds)

    if not slices:
        raise SystemExit(f"no readable DICOM files in {input_dir}")

    def slice_key(ds):
        ipp = getattr(ds, "ImagePositionPatient", None)
        if ipp is not None and len(ipp) >= 3:
            return (0, float(ipp[2]))
        inst = getattr(ds, "InstanceNumber", 0)
        return (1, int(inst))

    slices.sort(key=slice_key)

    rows = int(slices[0].Rows)
    cols = int(slices[0].Columns)
    for s in slices[1:]:
        if int(s.Rows) != rows or int(s.Columns) != cols:
            raise SystemExit("inconsistent rows/columns across slices")

    slope = float(getattr(slices[0], "RescaleSlope", 1.0))
    intercept = float(getattr(slices[0], "RescaleIntercept", 0.0))

    pixel_arrays: list[np.ndarray] = []
    for s in slices:
        try:
            px = s.pixel_array
        except Exception as e:
            raise SystemExit(f"could not decode pixel data: {e}")
        hu = px.astype(np.float32) * slope + intercept
        pixel_arrays.append(np.clip(hu, -32768, 32767).astype(np.int16))

    volume = np.stack(pixel_arrays, axis=0)

    pixel_spacing = getattr(slices[0], "PixelSpacing", [1.0, 1.0])
    spacing_xy = (float(pixel_spacing[0]), float(pixel_spacing[1]))
    if len(slices) > 1:
        ipp0 = slices[0].ImagePositionPatient
        ipp1 = slices[1].ImagePositionPatient
        spacing_z = abs(float(ipp1[2]) - float(ipp0[2])) or 1.0
    else:
        spacing_z = float(getattr(slices[0], "SliceThickness", 1.0)) or 1.0

    modality = str(getattr(slices[0], "Modality", "CT"))
    return volume, (spacing_xy[0], spacing_xy[1], spacing_z), modality


# -----------------------------------------------------------------------------
# CLI


def cmd_phantom(args: argparse.Namespace) -> int:
    vol = synthesize_phantom(args.size)
    manifest = write_processed_volume(
        Path(args.out),
        vol,
        (args.spacing, args.spacing, args.spacing),
        modality="CT",
        compress=args.compress,
        pyramid=args.pyramid,
        max_levels=args.max_levels,
    )
    print(json.dumps(_summary(manifest), indent=2))
    return 0


def cmd_dicom(args: argparse.Namespace) -> int:
    input_dir = Path(args.input)
    if not input_dir.is_dir():
        raise SystemExit(f"input must be a directory: {input_dir}")
    volume, spacing, modality = read_dicom_series(input_dir)
    manifest = write_processed_volume(
        Path(args.out),
        volume,
        spacing,
        modality=modality,
        compress=args.compress,
        pyramid=args.pyramid,
        max_levels=args.max_levels,
    )
    print(json.dumps(_summary(manifest), indent=2))
    return 0


def _summary(manifest: dict) -> dict:
    """Trim verbose fields (slice arrays) for printable output."""
    out = dict(manifest)
    if "slices" in out:
        out["slices"] = f"<{len(out['slices'])} entries>"
    if "levels" in out:
        out["levels"] = [
            {**lvl, "slices": f"<{len(lvl['slices'])} entries>"} if "slices" in lvl else lvl
            for lvl in out["levels"]
        ]
    return out


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="preprocess", description="DICOM → .raw + manifest.json")
    sub = p.add_subparsers(dest="cmd", required=True)

    common: list[tuple[Iterable, dict]] = [
        (("--compress",), {
            "choices": ("none", "htj2k"),
            "default": "none",
            "help": "Compression for slice data. htj2k requires OpenJPH (brew install openjph).",
        }),
        (("--pyramid",), {
            "action": "store_true",
            "help": "Generate a multi-resolution pyramid (anisotropic per-axis halving).",
        }),
        (("--max-levels",), {
            "type": int,
            "default": PYRAMID_DEFAULT_MAX_LEVELS,
            "help": "Maximum pyramid levels including level 0. Default: 4.",
        }),
    ]

    p_phantom = sub.add_parser("phantom", help="emit a synthetic phantom volume")
    p_phantom.add_argument("--out", type=str, required=True)
    p_phantom.add_argument("--size", type=int, default=32)
    p_phantom.add_argument("--spacing", type=float, default=1.0)
    for args_, kwargs in common:
        p_phantom.add_argument(*args_, **kwargs)
    p_phantom.set_defaults(func=cmd_phantom)

    p_dicom = sub.add_parser("dicom", help="ingest a real DICOM series")
    p_dicom.add_argument("input", type=str, help="directory containing .dcm files")
    p_dicom.add_argument("--out", type=str, required=True)
    for args_, kwargs in common:
        p_dicom.add_argument(*args_, **kwargs)
    p_dicom.set_defaults(func=cmd_dicom)

    args = p.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
