import { summarize } from '@/core/stats';

export type TransferKind = 'raw' | 'htj2k' | 'pyramid' | 'pyramid-htj2k';

export interface TransferStats {
  readonly bytesOnWire: number;
  readonly bytesDecompressed: number;
  readonly perSliceDecodeMs: readonly number[];
}

export interface BenchEnv {
  readonly adapter: {
    readonly vendor: string;
    readonly architecture: string;
    readonly device: string;
    readonly description: string;
  };
  readonly chromeVersion: string;
  readonly chromeFlags: readonly string[];
  readonly commitSha: string;
  readonly datasetSha256: string;
  readonly canvas: { readonly width: number; readonly height: number; readonly dpr: number };
  readonly powerState: 'ac' | 'battery' | 'unknown';
  readonly transferKind: TransferKind;
  readonly compressionLevel: number | null;
  readonly pyramidLevels: number | null;
  readonly manifestSchema: 'zizi-volume/v1' | 'zizi-volume/v2';
}

export type GpuTimesMap = Readonly<Record<string, readonly number[]>>;

export interface BenchRecord {
  readonly schema: 'zizi-bench/v2';
  readonly scenario: string;
  readonly startedAt: string;
  readonly warmupFrames: number;
  readonly frameTimesMs: readonly number[];
  readonly gpuTimesMs: GpuTimesMap | null;
  readonly stats: {
    readonly p50: number;
    readonly p95: number;
    readonly p99: number;
    readonly mean: number;
    readonly stddev: number;
  };
  readonly transfer: TransferStats | null;
  readonly ttfpMs: number | null;
  readonly gpuMemPeakBytes: number | null;
  readonly env: BenchEnv;
}

export interface BuildEnvArgs {
  readonly adapter: GPUAdapterInfo;
  readonly canvas: { width: number; height: number; dpr: number };
  readonly chromeFlags?: readonly string[];
  readonly commitSha?: string;
  readonly datasetSha256?: string;
  readonly powerState?: BenchEnv['powerState'];
  readonly transferKind?: TransferKind;
  readonly compressionLevel?: number | null;
  readonly pyramidLevels?: number | null;
  readonly manifestSchema?: 'zizi-volume/v1' | 'zizi-volume/v2';
}

export function buildEnv(a: BuildEnvArgs): BenchEnv {
  return {
    adapter: {
      vendor: a.adapter.vendor,
      architecture: a.adapter.architecture,
      device: a.adapter.device,
      description: a.adapter.description,
    },
    chromeVersion: detectChromeVersion(),
    chromeFlags: a.chromeFlags ?? [],
    commitSha: a.commitSha ?? 'unknown',
    datasetSha256: a.datasetSha256 ?? 'unknown',
    canvas: { ...a.canvas },
    powerState: a.powerState ?? 'unknown',
    transferKind: a.transferKind ?? 'raw',
    compressionLevel: a.compressionLevel ?? null,
    pyramidLevels: a.pyramidLevels ?? null,
    manifestSchema: a.manifestSchema ?? 'zizi-volume/v1',
  };
}

function detectChromeVersion(): string {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent ?? '';
  return (ua.match(/Chrome\/([\d.]+)/) ?? ua.match(/Chromium\/([\d.]+)/))?.[1] ?? 'unknown';
}

export interface BuildRecordArgs {
  readonly scenario: string;
  readonly warmupFrames: number;
  readonly frameTimesMs: readonly number[];
  readonly gpuTimesMs: GpuTimesMap | null;
  readonly env: BenchEnv;
  readonly startedAt?: string;
  readonly transfer?: TransferStats | null;
  readonly ttfpMs?: number | null;
  readonly gpuMemPeakBytes?: number | null;
}

export function buildRecord(a: BuildRecordArgs): BenchRecord {
  const s = summarize(a.frameTimesMs);
  return {
    schema: 'zizi-bench/v2',
    scenario: a.scenario,
    startedAt: a.startedAt ?? new Date().toISOString(),
    warmupFrames: a.warmupFrames,
    frameTimesMs: a.frameTimesMs,
    gpuTimesMs: a.gpuTimesMs,
    stats: { p50: s.p50, p95: s.p95, p99: s.p99, mean: s.mean, stddev: s.stddev },
    transfer: a.transfer ?? null,
    ttfpMs: a.ttfpMs ?? null,
    gpuMemPeakBytes: a.gpuMemPeakBytes ?? null,
    env: a.env,
  };
}

export function downloadBenchRecord(rec: BenchRecord): void {
  const blob = new Blob([JSON.stringify(rec, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${rec.scenario}-${rec.startedAt.replace(/[:.]/g, '-')}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
