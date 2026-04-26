import type { PreprocessedManifest, Volume3D } from './types';

export async function loadPreprocessed(_manifestUrl: string): Promise<Volume3D> {
  throw new Error('loadPreprocessed: not yet implemented (lands week 1-2)');
}

export function validateManifest(m: unknown): asserts m is PreprocessedManifest {
  if (typeof m !== 'object' || m === null) throw new Error('manifest is not an object');
  const obj = m as Record<string, unknown>;
  if (obj.schema !== 'zizi-volume/v1') {
    throw new Error(`unsupported manifest schema: ${String(obj.schema)}`);
  }
}
