import type { OpenJphModule } from '@cornerstonejs/codec-openjph';
import { invariant } from '@/core/assert';

export interface DecodedSlice {
  readonly data: Int16Array;
  readonly width: number;
  readonly height: number;
  readonly bitsPerSample: number;
  readonly isSigned: boolean;
}

let modulePromise: Promise<OpenJphModule> | null = null;

async function getModule(): Promise<OpenJphModule> {
  if (modulePromise) return modulePromise;
  modulePromise = (async () => {
    const factory = (await import('@cornerstonejs/codec-openjph')).default;
    const wasmUrl = (await import('@cornerstonejs/codec-openjph/wasm?url')).default;
    return factory({ locateFile: () => wasmUrl });
  })();
  return modulePromise;
}

export async function preloadHtj2k(): Promise<void> {
  await getModule();
}

export async function decodeHtj2kSlice(
  encoded: Uint8Array,
  expected?: { readonly width: number; readonly height: number },
  dataOffset = 0,
): Promise<DecodedSlice> {
  const mod = await getModule();
  const decoder = new mod.HTJ2KDecoder();
  try {
    decoder.getEncodedBuffer(encoded.byteLength).set(encoded);
    decoder.decode();
    const info = decoder.getFrameInfo();
    invariant(info.bitsPerSample === 16, `htj2k: bitsPerSample ${info.bitsPerSample}`);
    invariant(info.componentCount === 1, `htj2k: componentCount ${info.componentCount}`);
    if (expected)
      invariant(
        info.width === expected.width && info.height === expected.height,
        `htj2k: dims ${info.width}x${info.height} != ${expected.width}x${expected.height}`,
      );

    const decoded = decoder.getDecodedBuffer();
    const n = decoded.byteLength / 2;
    invariant(n === info.width * info.height, `htj2k: decoded len ${n}`);

    let result: Int16Array;
    if (info.isSigned) {
      const view = new Int16Array(decoded.buffer, decoded.byteOffset, n);
      if (dataOffset === 0) result = new Int16Array(view);
      else {
        result = new Int16Array(n);
        for (let i = 0; i < n; i++) result[i] = view[i]! - dataOffset;
      }
    } else {
      const uview = new Uint16Array(decoded.buffer, decoded.byteOffset, n);
      result = new Int16Array(n);
      for (let i = 0; i < n; i++) result[i] = uview[i]! - dataOffset;
    }

    return {
      data: result,
      width: info.width,
      height: info.height,
      bitsPerSample: info.bitsPerSample,
      isSigned: info.isSigned,
    };
  } finally {
    decoder.delete();
  }
}
