import type { ResourceHandle } from '@/core/types';

export type Access = 'read' | 'write' | 'read-write';

export interface ResourceUse {
  readonly handle: ResourceHandle;
  readonly access: Access;
}

export interface FrameContext {
  readonly time: number;
  readonly dt: number;
  readonly width: number;
  readonly height: number;
  readonly storageView: GPUTextureView;
  readonly canvasView: GPUTextureView;
}

export interface Pass {
  readonly name: string;
  readonly reads: readonly ResourceUse[];
  readonly writes: readonly ResourceUse[];
  record(encoder: GPUCommandEncoder, frame: FrameContext): void;
  destroy?(): void;
}
