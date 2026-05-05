import { decodeHtj2kSlice, preloadHtj2k } from '@/codec/htj2k';
import { invariant } from '@/core/assert';
import type { GpuContext } from '@/gpu/context';
import { pickMaxLevel } from '@/render/pyramid';
import {
  allocateVolumeBundle,
  uploadVolume,
  type VolumeTextureBundle,
  writeSlice,
} from '@/render/volume-upload';
import type {
  LevelManifest,
  PreprocessedManifest,
  PreprocessedManifestV1Htj2k,
  PreprocessedManifestV1Raw,
  PreprocessedManifestV2,
  SliceRef,
  Volume3D,
} from './types';
import { isV1Htj2k, isV1Manifest, isV2Manifest } from './types';

export type LoaderStage = 'manifest' | 'raw' | 'verify' | 'decode' | 'level-ready' | 'done';

export interface LoaderProgress {
  readonly stage: LoaderStage;
  readonly pct: number;
  readonly level?: number;
  readonly sliceIdx?: number;
  readonly totalSlices?: number;
}

export type ProgressFn = (p: LoaderProgress) => void;
export interface LoadResult {
  readonly bundle: VolumeTextureBundle;
  readonly finished: Promise<void>;
  readonly manifest: PreprocessedManifest;
}

const SLICE_CONCURRENCY = 8;
const SHA_HEX = /^[0-9a-f]{64}$/i;

export async function loadVolume(
  manifestUrl: string,
  ctx: GpuContext,
  onProgress?: ProgressFn,
  capLevel?: number,
): Promise<LoadResult> {
  onProgress?.({ stage: 'manifest', pct: 0 });
  const manifest = await fetchManifest(manifestUrl);
  onProgress?.({ stage: 'manifest', pct: 100 });
  const baseUrl = new URL('.', new URL(manifestUrl, window.location.href));

  if (isV2Manifest(manifest)) return loadV2Pyramid(manifest, baseUrl, ctx, onProgress, capLevel);
  if (isV1Manifest(manifest)) {
    if (isV1Htj2k(manifest)) {
      const bundle = await loadV1Htj2k(manifest, baseUrl, ctx, onProgress);
      return { bundle, finished: Promise.resolve(), manifest };
    }
    const volume = await loadV1Raw(manifest, baseUrl, onProgress);
    onProgress?.({ stage: 'done', pct: 100 });
    return { bundle: uploadVolume(ctx, volume), finished: Promise.resolve(), manifest };
  }
  throw new Error(`unknown manifest schema: ${(manifest as { schema?: string }).schema ?? '?'}`);
}

async function fetchManifest(url: string): Promise<PreprocessedManifest> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`manifest fetch: ${r.status} ${r.statusText}`);
  const m = (await r.json()) as unknown;
  validateManifest(m);
  return m;
}

export function validateManifest(m: unknown): asserts m is PreprocessedManifest {
  if (typeof m !== 'object' || m === null) throw new Error('manifest is not an object');
  const o = m as Record<string, unknown>;
  if (o.schema === 'zizi-volume/v1') validateV1(o);
  else if (o.schema === 'zizi-volume/v2') validateV2(o);
  else throw new Error(`unsupported manifest schema: ${String(o.schema)}`);
}

function validateV1(o: Record<string, unknown>): void {
  if (o.dtype !== 'int16' && o.dtype !== 'uint16') throw new Error(`bad dtype: ${o.dtype}`);
  const c = (o.compression ?? 'none') as string;
  if (c === 'none') {
    if (typeof o.raw !== 'string' || !o.raw) throw new Error('v1 raw: missing raw');
    if (typeof o.rawSha256 !== 'string' || !SHA_HEX.test(o.rawSha256))
      throw new Error('v1 raw: bad rawSha256');
  } else if (c === 'htj2k') {
    if (!Array.isArray(o.slices) || o.slices.length === 0) throw new Error('v1 htj2k: bad slices');
  } else throw new Error(`unsupported compression: ${c}`);
}

function validateV2(o: Record<string, unknown>): void {
  if (!Array.isArray(o.levels) || o.levels.length === 0) throw new Error('v2: bad levels');
  o.levels.forEach((lvl, i) => {
    const l = lvl as Record<string, unknown>;
    if (l.compression !== 'none' && l.compression !== 'htj2k')
      throw new Error(`v2 L${i}: bad compression`);
    if (l.compression === 'htj2k' && !Array.isArray(l.slices))
      throw new Error(`v2 L${i}: htj2k requires slices`);
    if (l.compression === 'none' && typeof l.raw !== 'string')
      throw new Error(`v2 L${i}: raw requires raw path`);
  });
}

async function loadV1Raw(
  manifest: PreprocessedManifestV1Raw,
  baseUrl: URL,
  onProgress?: ProgressFn,
): Promise<Volume3D> {
  onProgress?.({ stage: 'raw', pct: 0 });
  const buf = await streamFetch(new URL(manifest.raw, baseUrl).toString(), (pct) =>
    onProgress?.({ stage: 'raw', pct }),
  );
  const expected = manifest.extent.width * manifest.extent.height * manifest.extent.depth;
  invariant(buf.byteLength === expected * 2, `raw size ${buf.byteLength} != ${expected * 2}`);

  onProgress?.({ stage: 'verify', pct: 0 });
  const sha = await sha256Hex(buf);
  if (sha !== manifest.rawSha256)
    throw new Error(`SHA-256 mismatch: expected ${manifest.rawSha256}, got ${sha}`);
  onProgress?.({ stage: 'verify', pct: 100 });

  const data =
    manifest.dtype === 'int16'
      ? new Int16Array(buf.buffer, buf.byteOffset, expected)
      : new Uint16Array(buf.buffer, buf.byteOffset, expected);
  return {
    extent: manifest.extent,
    spacing: manifest.spacing,
    modality: manifest.modality,
    dtype: manifest.dtype,
    data,
    minValue: manifest.minValue,
    maxValue: manifest.maxValue,
  };
}

async function loadV1Htj2k(
  manifest: PreprocessedManifestV1Htj2k,
  baseUrl: URL,
  ctx: GpuContext,
  onProgress?: ProgressFn,
): Promise<VolumeTextureBundle> {
  invariant(
    manifest.slices.length === manifest.extent.depth,
    `slice count ${manifest.slices.length} != depth ${manifest.extent.depth}`,
  );
  await preloadHtj2k();

  const bundle = allocateVolumeBundle(
    ctx,
    manifest.extent,
    manifest.spacing,
    { minHU: manifest.minValue, maxHU: manifest.maxValue, modality: manifest.modality },
    'volume.r16float.htj2k',
  );
  await streamSlices(
    ctx,
    bundle,
    manifest.slices,
    baseUrl,
    manifest.extent,
    manifest.dataOffset ?? 0,
    onProgress,
  );
  onProgress?.({ stage: 'done', pct: 100 });
  return bundle;
}

async function loadV2Pyramid(
  manifest: PreprocessedManifestV2,
  baseUrl: URL,
  ctx: GpuContext,
  onProgress?: ProgressFn,
  capLevel?: number,
): Promise<LoadResult> {
  const maxLevel = pickMaxLevel(manifest, ctx.caps, capLevel);
  if (__DEV__) {
    console.info(`[zizi/loader] pyramid: maxLevel=${maxLevel} of ${manifest.levels.length}`);
  }
  const startIdx = manifest.levels.length - 1;

  const coarsest = await loadLevel(
    manifest.levels[startIdx]!,
    baseUrl,
    ctx,
    manifest.modality,
    onProgress,
  );
  onProgress?.({ stage: 'level-ready', pct: 100, level: startIdx });
  if (startIdx === maxLevel) {
    onProgress?.({ stage: 'done', pct: 100 });
    return { bundle: coarsest, finished: Promise.resolve(), manifest };
  }

  const finished = (async () => {
    for (let i = startIdx - 1; i >= maxLevel; i--) {
      const next = await loadLevel(
        manifest.levels[i]!,
        baseUrl,
        ctx,
        manifest.modality,
        onProgress,
      );
      coarsest.swap(next);
      onProgress?.({ stage: 'level-ready', pct: 100, level: i });
    }
    onProgress?.({ stage: 'done', pct: 100 });
  })();
  return { bundle: coarsest, finished, manifest };
}

async function loadLevel(
  level: LevelManifest,
  baseUrl: URL,
  ctx: GpuContext,
  modality: PreprocessedManifestV2['modality'],
  onProgress?: ProgressFn,
): Promise<VolumeTextureBundle> {
  const sp = level.spacingScale;
  const meta = { minHU: level.minValue, maxHU: level.maxValue, modality };

  if (level.compression === 'none') {
    invariant(level.raw && level.rawSha256, `L${level.level}: missing raw`);
    onProgress?.({ stage: 'raw', pct: 0, level: level.level });
    const resp = await fetch(new URL(level.raw, baseUrl).toString());
    if (!resp.ok) throw new Error(`L${level.level}: ${resp.status}`);
    const buf = new Uint8Array(await resp.arrayBuffer());
    const expected = level.extent.width * level.extent.height * level.extent.depth;
    invariant(buf.byteLength === expected * 2, `L${level.level}: bad size`);
    onProgress?.({ stage: 'verify', pct: 0, level: level.level });
    const sha = await sha256Hex(buf);
    if (sha !== level.rawSha256) throw new Error(`L${level.level}: sha mismatch`);

    const bundle = allocateVolumeBundle(ctx, level.extent, sp, meta, `volume.L${level.level}.raw`);
    const data = new Int16Array(buf.buffer, buf.byteOffset, expected);
    const sliceLen = level.extent.width * level.extent.height;
    const packBuf = new Uint16Array(sliceLen);
    for (let z = 0; z < level.extent.depth; z++) {
      writeSlice(ctx, bundle, z, data.subarray(z * sliceLen, (z + 1) * sliceLen), packBuf);
    }
    return bundle;
  }

  invariant(level.slices, `L${level.level}: missing slices`);
  await preloadHtj2k();
  const bundle = allocateVolumeBundle(ctx, level.extent, sp, meta, `volume.L${level.level}.htj2k`);
  await streamSlices(
    ctx,
    bundle,
    level.slices,
    baseUrl,
    level.extent,
    level.dataOffset ?? 0,
    onProgress,
    level.level,
  );
  return bundle;
}

async function streamSlices(
  ctx: GpuContext,
  bundle: VolumeTextureBundle,
  slices: readonly SliceRef[],
  baseUrl: URL,
  extent: { width: number; height: number },
  dataOffset: number,
  onProgress?: ProgressFn,
  level?: number,
): Promise<void> {
  const total = slices.length;
  let done = 0;
  const expected = { width: extent.width, height: extent.height };
  const packBuf = new Uint16Array(extent.width * extent.height);

  await pMap(
    slices,
    async (slice, idx) => {
      const decoded = await fetchAndDecodeSlice(slice, baseUrl, expected, dataOffset);
      writeSlice(ctx, bundle, idx, decoded, packBuf);
      done++;
      onProgress?.({
        stage: 'decode',
        pct: (done / total) * 100,
        ...(level !== undefined ? { level } : {}),
        sliceIdx: idx,
        totalSlices: total,
      });
    },
    SLICE_CONCURRENCY,
  );
}

async function streamFetch(url: string, onPct?: (pct: number) => void): Promise<Uint8Array> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url}: ${r.status} ${r.statusText}`);
  const total = Number.parseInt(r.headers.get('content-length') ?? '0', 10);
  const reader = r.body?.getReader();
  invariant(reader != null, 'no readable body');

  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    if (total > 0) onPct?.((received / total) * 100);
  }
  const out = new Uint8Array(received);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  onPct?.(100);
  return out;
}

async function fetchAndDecodeSlice(
  slice: SliceRef,
  baseUrl: URL,
  expected: { readonly width: number; readonly height: number },
  dataOffset: number,
): Promise<Int16Array> {
  const r = await fetch(new URL(slice.file, baseUrl).toString());
  if (!r.ok) throw new Error(`slice ${slice.file}: ${r.status}`);
  const buf = new Uint8Array(await r.arrayBuffer());
  if (buf.byteLength !== slice.byteLength)
    throw new Error(`slice ${slice.file}: size ${buf.byteLength} != ${slice.byteLength}`);
  const sha = await sha256Hex(buf);
  if (sha !== slice.sha256) throw new Error(`slice ${slice.file}: sha mismatch`);
  return (await decodeHtj2kSlice(buf, expected, dataOffset)).data;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
  let s = '';
  for (let i = 0; i < hash.length; i++) {
    const b = hash[i]!;
    s += (b >>> 4).toString(16) + (b & 0xf).toString(16);
  }
  return s;
}

async function pMap<T, R>(
  items: readonly T[],
  fn: (item: T, idx: number) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]!, i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return out;
}
