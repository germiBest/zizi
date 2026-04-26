# zizi-preprocess

DICOM → `.raw` + `manifest.json` preprocessor for the zizi browser renderer.

Goal: parse DICOM **once** in Python so the browser only loads pre-validated
binary volumes. JS-side DICOM parsing (compressed multi-frame, etc.) is a
six-month rabbit hole we explicitly avoid.

## Setup

```sh
cd tools/preprocess
uv sync               # creates .venv, installs pydicom + numpy
```

## CLI

```sh
# Synthetic phantom (works today, no DICOM needed)
uv run preprocess phantom --out ../../public/datasets/phantom-32

# Real DICOM ingest (TODO — lands week 1-2)
uv run preprocess dicom <dicom-series-dir> --out ../../public/datasets/<name>
```

## Output

For every ingested volume:

- `volume.raw` — packed little-endian `int16`, in `(z, y, x)` order
- `manifest.json` — schema `zizi-volume/v1` matching `src/dicom/types.ts`

The browser fetches the manifest, validates `rawSha256`, then streams the raw.

## Tests

```sh
uv run pytest
```
