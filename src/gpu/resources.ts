import { invariant } from '@/core/assert';

export interface TrackedResource {
  readonly label: string;
  readonly byteSize: number;
  markDead(): void;
}

export class ResourceRegistry {
  private alive = true;
  private readonly entries = new Set<TrackedResource>();

  register(r: TrackedResource): void {
    if (!this.alive) return;
    this.entries.add(r);
  }

  unregister(r: TrackedResource): void {
    this.entries.delete(r);
  }

  invalidate(): void {
    this.alive = false;
    for (const r of this.entries) r.markDead();
    this.entries.clear();
  }

  get isAlive(): boolean {
    return this.alive;
  }

  totalBytes(): number {
    let n = 0;
    for (const r of this.entries) n += r.byteSize;
    return n;
  }

  count(): number {
    return this.entries.size;
  }
}

export class GpuBuffer implements TrackedResource, Disposable {
  private dead = false;

  constructor(
    readonly buffer: GPUBuffer,
    readonly byteSize: number,
    readonly label: string,
    private readonly registry: ResourceRegistry,
  ) {
    registry.register(this);
  }

  markDead(): void {
    this.dead = true;
  }

  dispose(): void {
    this[Symbol.dispose]();
  }

  [Symbol.dispose](): void {
    if (this.dead) return;
    this.registry.unregister(this);
    this.buffer.destroy();
    this.dead = true;
  }
}

export class GpuTexture implements TrackedResource, Disposable {
  private dead = false;

  constructor(
    readonly texture: GPUTexture,
    readonly byteSize: number,
    readonly label: string,
    private readonly registry: ResourceRegistry,
  ) {
    registry.register(this);
  }

  markDead(): void {
    this.dead = true;
  }

  dispose(): void {
    this[Symbol.dispose]();
  }

  [Symbol.dispose](): void {
    if (this.dead) return;
    this.registry.unregister(this);
    this.texture.destroy();
    this.dead = true;
  }
}

export function createBuffer(
  device: GPUDevice,
  registry: ResourceRegistry,
  desc: GPUBufferDescriptor,
): GpuBuffer {
  invariant(desc.size > 0, `buffer "${desc.label ?? '?'}": size must be > 0`);
  const buf = device.createBuffer(desc);
  return new GpuBuffer(buf, desc.size, desc.label ?? '<unlabeled-buffer>', registry);
}

export function createTexture(
  device: GPUDevice,
  registry: ResourceRegistry,
  desc: GPUTextureDescriptor,
): GpuTexture {
  const tex = device.createTexture(desc);
  const sz = approxTextureSize(desc);
  return new GpuTexture(tex, sz, desc.label ?? '<unlabeled-texture>', registry);
}

function approxTextureSize(desc: GPUTextureDescriptor): number {
  const s = desc.size as
    | readonly number[]
    | { width: number; height?: number; depthOrArrayLayers?: number };
  let w: number;
  let h: number;
  let d: number;
  if (Array.isArray(s)) {
    w = s[0] ?? 1;
    h = s[1] ?? 1;
    d = s[2] ?? 1;
  } else {
    const o = s as { width: number; height?: number; depthOrArrayLayers?: number };
    w = o.width;
    h = o.height ?? 1;
    d = o.depthOrArrayLayers ?? 1;
  }
  return w * h * d * bytesPerPixel(desc.format);
}

function bytesPerPixel(format: GPUTextureFormat): number {
  switch (format) {
    case 'r8unorm':
    case 'r8snorm':
    case 'r8uint':
    case 'r8sint':
      return 1;
    case 'r16uint':
    case 'r16sint':
    case 'r16float':
    case 'rg8unorm':
    case 'rg8snorm':
    case 'rg8uint':
    case 'rg8sint':
      return 2;
    case 'r32float':
    case 'r32uint':
    case 'r32sint':
    case 'rg16uint':
    case 'rg16sint':
    case 'rg16float':
    case 'rgba8unorm':
    case 'rgba8unorm-srgb':
    case 'rgba8snorm':
    case 'rgba8uint':
    case 'rgba8sint':
    case 'bgra8unorm':
    case 'bgra8unorm-srgb':
    case 'depth32float':
    case 'depth24plus':
      return 4;
    case 'rgba16float':
    case 'rgba16uint':
    case 'rgba16sint':
    case 'rg32float':
    case 'rg32uint':
    case 'rg32sint':
      return 8;
    case 'rgba32float':
    case 'rgba32uint':
    case 'rgba32sint':
      return 16;
    default:
      return 4;
  }
}
