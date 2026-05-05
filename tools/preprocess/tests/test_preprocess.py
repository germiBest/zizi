from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

import numpy as np
import pytest

import preprocess


# ---------------------------------------------------------------------------
# Phantom


def test_synthesize_phantom_dims():
    vol = preprocess.synthesize_phantom(16)
    assert vol.shape == (16, 16, 16)
    assert vol.dtype == np.int16


def test_synthesize_phantom_value_range():
    vol = preprocess.synthesize_phantom(16)
    assert vol.min() <= -900
    assert vol.max() >= 500


# ---------------------------------------------------------------------------
# v1 raw


def test_write_volume_roundtrip(tmp_path: Path):
    vol = preprocess.synthesize_phantom(8)
    manifest = preprocess.write_volume(tmp_path, vol, (1.0, 1.0, 1.0))

    raw = (tmp_path / "volume.raw").read_bytes()
    assert len(raw) == vol.size * 2

    parsed = json.loads((tmp_path / "manifest.json").read_text())
    assert parsed["schema"] == "zizi-volume/v1"
    assert parsed["extent"] == {"width": 8, "height": 8, "depth": 8}
    assert parsed["dtype"] == "int16"
    assert parsed["modality"] == "CT"
    assert parsed["raw"] == "volume.raw"
    assert parsed["compression"] == "none"
    assert len(parsed["rawSha256"]) == 64
    assert manifest == parsed


def test_real_dicom_with_pydicom_sample(tmp_path: Path):
    pytest.importorskip("pydicom")
    from pydicom.data import get_testdata_file

    src = Path(get_testdata_file("CT_small.dcm"))
    if not src.exists():
        pytest.skip("CT_small.dcm test data not available in this pydicom install")

    in_dir = tmp_path / "in"
    in_dir.mkdir()
    (in_dir / "CT_small.dcm").write_bytes(src.read_bytes())

    out_dir = tmp_path / "out"
    args = argparse.Namespace(
        input=str(in_dir), out=str(out_dir),
        compress="none", pyramid=False, max_levels=4,
    )
    rc = preprocess.cmd_dicom(args)
    assert rc == 0

    manifest = json.loads((out_dir / "manifest.json").read_text())
    assert manifest["schema"] == "zizi-volume/v1"
    assert manifest["compression"] == "none"
    assert manifest["modality"] == "CT"
    assert manifest["dtype"] == "int16"
    assert manifest["extent"]["depth"] == 1


# ---------------------------------------------------------------------------
# Pyramid


def test_build_pyramid_levels_isotropic_cube():
    """64³ cube with 1mm spacing halves uniformly all axes for several levels."""
    vol = preprocess.synthesize_phantom(64)
    levels = preprocess.build_pyramid_levels(vol, (1.0, 1.0, 1.0), max_levels=4)

    # level 0 = full
    assert levels[0]["data"].shape == (64, 64, 64)
    assert levels[0]["spacing_scale"] == (1.0, 1.0, 1.0)

    # level 1 = 32, scale 2
    assert levels[1]["data"].shape == (32, 32, 32)
    assert levels[1]["spacing_scale"] == (2.0, 2.0, 2.0)

    # level 2 = 16, scale 4 — at the floor (16 voxels). One more halve would hit 8 < min 16.
    assert levels[2]["data"].shape == (16, 16, 16)
    assert levels[2]["spacing_scale"] == (4.0, 4.0, 4.0)

    # level 3 should not exist (16 / 2 = 8 < min 16)
    assert len(levels) == 3


def test_build_pyramid_levels_anisotropic_thick_slice():
    """512×512 thin xy / 64 thick z (5mm spacing) — z stops halving early."""
    vol = np.zeros((64, 512, 512), dtype=np.int16)
    levels = preprocess.build_pyramid_levels(vol, (0.7, 0.7, 5.0), max_levels=5)

    # level 0
    assert levels[0]["data"].shape == (64, 512, 512)
    # level 1: z halves (32 dim ≥ 16, extent 32×10mm = 320 ≥ 8mm).
    # xy halves to 256.
    assert levels[1]["data"].shape == (32, 256, 256)
    # level 2: z halves again to 16 (still ≥ 16), xy to 128.
    assert levels[2]["data"].shape == (16, 128, 128)
    # level 3: z would go to 8 < min 16, so z stops; xy continues to 64.
    assert levels[3]["data"].shape == (16, 64, 64)
    # spacing scale at level 3 should reflect z stopped halving
    sx, sy, sz = levels[3]["spacing_scale"]
    assert sz == 4.0  # halved twice (level 1, level 2)
    assert sx == 8.0  # halved three times (levels 1, 2, 3)
    assert sy == 8.0


def test_build_pyramid_levels_floor_anisotropic():
    """Verify each level's spacingScale tracks the actual axes halved."""
    vol = np.zeros((20, 20, 200), dtype=np.int16)
    levels = preprocess.build_pyramid_levels(vol, (1.0, 1.0, 1.0), max_levels=4)
    # level 1: all axes can halve (10/10/100)? 10 < min 16, so y and z STOP halving immediately.
    # Actually depth=20 → 10 < 16 → can't halve. height=20 → same. width=200 → 100 ≥ 16, ok.
    # So at level 1: only x halves.
    assert levels[1]["data"].shape == (20, 20, 100)
    assert levels[1]["spacing_scale"] == (2.0, 1.0, 1.0)
    # level 2: x halves again (50 ≥ 16), others stuck.
    assert levels[2]["data"].shape == (20, 20, 50)
    assert levels[2]["spacing_scale"] == (4.0, 1.0, 1.0)


# ---------------------------------------------------------------------------
# HTJ2K encode (skip if openjph CLI unavailable)


@pytest.mark.skipif(not preprocess._ojph_available(), reason="ojph_compress not installed")
def test_encode_htj2k_slice_produces_valid_codestream():
    arr = np.arange(-100, 924, dtype=np.int16).reshape(32, 32)
    j2c = preprocess.encode_htj2k_slice(arr)
    assert len(j2c) > 16
    # SOC marker (0xff4f) at start
    assert j2c[0] == 0xff and j2c[1] == 0x4f
    # SIZ marker (0xff51) immediately after
    assert j2c[2] == 0xff and j2c[3] == 0x51


@pytest.mark.skipif(not preprocess._ojph_available(), reason="ojph_compress not installed")
def test_v1_htj2k_manifest_shape(tmp_path: Path):
    vol = preprocess.synthesize_phantom(16)
    manifest = preprocess.write_processed_volume(
        tmp_path, vol, (1.0, 1.0, 1.0),
        modality="CT", compress="htj2k", pyramid=False,
    )
    assert manifest["schema"] == "zizi-volume/v1"
    assert manifest["compression"] == "htj2k"
    assert len(manifest["slices"]) == 16
    for entry in manifest["slices"]:
        assert "file" in entry and "sha256" in entry and "byteLength" in entry
        assert (tmp_path / entry["file"]).exists()
        assert (tmp_path / entry["file"]).stat().st_size == entry["byteLength"]


@pytest.mark.skipif(not preprocess._ojph_available(), reason="ojph_compress not installed")
def test_v2_pyramid_htj2k_manifest_shape(tmp_path: Path):
    vol = preprocess.synthesize_phantom(64)
    manifest = preprocess.write_processed_volume(
        tmp_path, vol, (1.0, 1.0, 1.0),
        modality="CT", compress="htj2k", pyramid=True, max_levels=4,
    )
    assert manifest["schema"] == "zizi-volume/v2"
    assert "levels" in manifest and len(manifest["levels"]) >= 2
    # level 0 = finest, full dims
    assert manifest["levels"][0]["level"] == 0
    assert manifest["levels"][0]["extent"] == {"width": 64, "height": 64, "depth": 64}
    assert manifest["levels"][0]["spacingScale"] == {"x": 1.0, "y": 1.0, "z": 1.0}
    for lvl in manifest["levels"]:
        assert lvl["compression"] == "htj2k"
        assert len(lvl["slices"]) == lvl["extent"]["depth"]


def test_v2_pyramid_raw_manifest_shape(tmp_path: Path):
    vol = preprocess.synthesize_phantom(64)
    manifest = preprocess.write_processed_volume(
        tmp_path, vol, (1.0, 1.0, 1.0),
        modality="CT", compress="none", pyramid=True, max_levels=4,
    )
    assert manifest["schema"] == "zizi-volume/v2"
    assert len(manifest["levels"]) >= 2
    for lvl in manifest["levels"]:
        assert lvl["compression"] == "none"
        assert "raw" in lvl and "rawSha256" in lvl
        assert (tmp_path / lvl["raw"]).exists()
