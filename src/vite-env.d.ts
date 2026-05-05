/// <reference types="vite/client" />
/// <reference types="@webgpu/types" />

declare const __DEV__: boolean;

declare module '*.wgsl?raw' {
  const src: string;
  export default src;
}

declare module '@cornerstonejs/codec-openjph' {
  export interface OpenJphFrameInfo {
    readonly width: number;
    readonly height: number;
    readonly bitsPerSample: number;
    readonly componentCount: number;
    readonly isSigned: boolean;
  }

  export interface OpenJphHTJ2KDecoder {
    getEncodedBuffer(size: number): Uint8Array;
    decode(): void;
    decodeSubResolution(level: number): void;
    getDecodedBuffer(): Uint8Array;
    getFrameInfo(): OpenJphFrameInfo;
    delete(): void;
  }

  export interface OpenJphHTJ2KEncoder {
    getDecodedBuffer(frameInfo: OpenJphFrameInfo): Uint8Array;
    encode(): number;
    getEncodedBuffer(): Uint8Array;
    delete(): void;
  }

  export interface OpenJphModule {
    HTJ2KDecoder: { new (): OpenJphHTJ2KDecoder };
    HTJ2KEncoder: { new (): OpenJphHTJ2KEncoder };
  }

  type FactoryOptions = {
    locateFile?: (file: string, scriptDir?: string) => string;
    wasmBinary?: ArrayBuffer | Uint8Array;
  };

  const factory: (opts?: FactoryOptions) => Promise<OpenJphModule>;
  export default factory;
}

declare module '@cornerstonejs/codec-openjph/wasm?url' {
  const url: string;
  export default url;
}
