import { summarize } from '@/core/stats';

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
}

export interface BenchRecord {
  readonly schema: 'zizi-bench/v1';
  readonly scenario: string;
  readonly startedAt: string;
  readonly warmupFrames: number;
  readonly frameTimesMs: readonly number[];
  readonly gpuTimesMs: readonly number[] | null;
  readonly stats: {
    readonly p50: number;
    readonly p95: number;
    readonly p99: number;
    readonly mean: number;
    readonly stddev: number;
  };
  readonly env: BenchEnv;
}

export interface BuildEnvArgs {
  readonly adapter: GPUAdapterInfo;
  readonly canvas: { width: number; height: number; dpr: number };
  readonly chromeFlags?: readonly string[];
  readonly commitSha?: string;
  readonly datasetSha256?: string;
  readonly powerState?: BenchEnv['powerState'];
}

export function buildEnv(args: BuildEnvArgs): BenchEnv {
  return {
    adapter: {
      vendor: args.adapter.vendor,
      architecture: args.adapter.architecture,
      device: args.adapter.device,
      description: args.adapter.description,
    },
    chromeVersion: detectChromeVersion(),
    chromeFlags: args.chromeFlags ?? [],
    commitSha: args.commitSha ?? 'unknown',
    datasetSha256: args.datasetSha256 ?? 'unknown',
    canvas: { ...args.canvas },
    powerState: args.powerState ?? 'unknown',
  };
}

function detectChromeVersion(): string {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent ?? '';
  const m = ua.match(/Chrome\/([\d.]+)/) ?? ua.match(/Chromium\/([\d.]+)/);
  return m?.[1] ?? 'unknown';
}

export interface BuildRecordArgs {
  readonly scenario: string;
  readonly warmupFrames: number;
  readonly frameTimesMs: readonly number[];
  readonly gpuTimesMs: readonly number[] | null;
  readonly env: BenchEnv;
  readonly startedAt?: string;
}

export function buildRecord(args: BuildRecordArgs): BenchRecord {
  const s = summarize(args.frameTimesMs);
  return {
    schema: 'zizi-bench/v1',
    scenario: args.scenario,
    startedAt: args.startedAt ?? new Date().toISOString(),
    warmupFrames: args.warmupFrames,
    frameTimesMs: args.frameTimesMs,
    gpuTimesMs: args.gpuTimesMs,
    stats: {
      p50: s.p50,
      p95: s.p95,
      p99: s.p99,
      mean: s.mean,
      stddev: s.stddev,
    },
    env: args.env,
  };
}

export function downloadBenchRecord(rec: BenchRecord): void {
  const json = JSON.stringify(rec, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const ts = rec.startedAt.replace(/[:.]/g, '-');
  a.download = `${rec.scenario}-${ts}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
