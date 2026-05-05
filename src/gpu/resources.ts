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
    if (this.alive) this.entries.add(r);
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
  count(): number {
    return this.entries.size;
  }
  totalBytes(): number {
    let n = 0;
    for (const r of this.entries) n += r.byteSize;
    return n;
  }
}

abstract class GpuResource implements TrackedResource, Disposable {
  protected dead = false;
  constructor(
    readonly byteSize: number,
    readonly label: string,
    protected readonly registry: ResourceRegistry,
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
    this.destroyImpl();
    this.dead = true;
  }
  protected abstract destroyImpl(): void;
}

export class GpuBuffer extends GpuResource {
  constructor(
    readonly buffer: GPUBuffer,
    byteSize: number,
    label: string,
    registry: ResourceRegistry,
  ) {
    super(byteSize, label, registry);
  }
  protected override destroyImpl(): void {
    this.buffer.destroy();
  }
}

export class GpuTexture extends GpuResource {
  constructor(
    readonly texture: GPUTexture,
    byteSize: number,
    label: string,
    registry: ResourceRegistry,
  ) {
    super(byteSize, label, registry);
  }
  protected override destroyImpl(): void {
    this.texture.destroy();
  }
}

export function createBuffer(
  device: GPUDevice,
  registry: ResourceRegistry,
  desc: GPUBufferDescriptor,
): GpuBuffer {
  invariant(desc.size > 0, `buffer "${desc.label ?? '?'}": size must be > 0`);
  return new GpuBuffer(device.createBuffer(desc), desc.size, desc.label ?? 'buffer', registry);
}

export function createTexture(
  device: GPUDevice,
  registry: ResourceRegistry,
  desc: GPUTextureDescriptor,
): GpuTexture {
  const tex = device.createTexture(desc);
  return new GpuTexture(tex, approxTextureSize(desc), desc.label ?? 'texture', registry);
}

function approxTextureSize(desc: GPUTextureDescriptor): number {
  const s = desc.size;
  let w: number, h: number, d: number;
  if (Array.isArray(s)) {
    [w, h, d] = [s[0] ?? 1, s[1] ?? 1, s[2] ?? 1];
  } else {
    const o = s as { width: number; height?: number; depthOrArrayLayers?: number };
    [w, h, d] = [o.width, o.height ?? 1, o.depthOrArrayLayers ?? 1];
  }
  return w * h * d * bytesPerPixel(desc.format);
}

const BPP: Partial<Record<GPUTextureFormat, number>> = {
  r8unorm: 1,
  r8snorm: 1,
  r8uint: 1,
  r8sint: 1,
  r16uint: 2,
  r16sint: 2,
  r16float: 2,
  rg8unorm: 2,
  rg8snorm: 2,
  rg8uint: 2,
  rg8sint: 2,
  r32float: 4,
  r32uint: 4,
  r32sint: 4,
  rg16uint: 4,
  rg16sint: 4,
  rg16float: 4,
  rgba8unorm: 4,
  'rgba8unorm-srgb': 4,
  rgba8snorm: 4,
  rgba8uint: 4,
  rgba8sint: 4,
  bgra8unorm: 4,
  'bgra8unorm-srgb': 4,
  depth32float: 4,
  depth24plus: 4,
  rgba16float: 8,
  rgba16uint: 8,
  rgba16sint: 8,
  rg32float: 8,
  rg32uint: 8,
  rg32sint: 8,
  rgba32float: 16,
  rgba32uint: 16,
  rgba32sint: 16,
};

function bytesPerPixel(format: GPUTextureFormat): number {
  return BPP[format] ?? 4;
}
