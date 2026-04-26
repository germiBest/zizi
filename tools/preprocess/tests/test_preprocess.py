from __future__ import annotations

import json
from pathlib import Path

import numpy as np

import preprocess


def test_synthesize_phantom_dims():
    vol = preprocess.synthesize_phantom(16)
    assert vol.shape == (16, 16, 16)
    assert vol.dtype == np.int16


def test_synthesize_phantom_value_range():
    vol = preprocess.synthesize_phantom(16)
    assert vol.min() <= -900
    assert vol.max() >= 500


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
    assert len(parsed["rawSha256"]) == 64
    assert manifest == parsed
