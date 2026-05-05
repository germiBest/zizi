interface PassSlot {
  readonly name: string;
  readonly beginIdx: number;
  readonly endIdx: number;
  lastMs: number;
}

export class Timestamps {
  private querySet: GPUQuerySet | null = null;
  private resolveBuf: GPUBuffer | null = null;
  private readbackBuf: GPUBuffer | null = null;
  private readonly slots: PassSlot[] = [];
  private mapping = false;
  private capacity = 0;

  constructor(
    private readonly device: GPUDevice,
    private readonly enabled_: boolean,
  ) {}

  get enabled(): boolean {
    return this.enabled_ && this.querySet !== null;
  }

  add(name: string): void {
    if (!this.enabled_) return;
    const beginIdx = this.slots.length * 2;
    this.slots.push({ name, beginIdx, endIdx: beginIdx + 1, lastMs: Number.NaN });
  }

  finalize(): void {
    if (!this.enabled_ || this.slots.length === 0 || this.querySet) return;
    this.capacity = this.slots.length * 2;
    const bytes = this.capacity * 8;
    this.querySet = this.device.createQuerySet({
      label: 'ts.queries',
      type: 'timestamp',
      count: this.capacity,
    });
    this.resolveBuf = this.device.createBuffer({
      label: 'ts.resolve',
      size: bytes,
      usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
    });
    this.readbackBuf = this.device.createBuffer({
      label: 'ts.readback',
      size: bytes,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
  }

  computePassWrites(name: string): GPUComputePassTimestampWrites | undefined {
    if (!this.querySet) return undefined;
    const slot = this.slots.find((s) => s.name === name);
    return slot
      ? {
          querySet: this.querySet,
          beginningOfPassWriteIndex: slot.beginIdx,
          endOfPassWriteIndex: slot.endIdx,
        }
      : undefined;
  }

  resolve(encoder: GPUCommandEncoder): void {
    if (!this.querySet || !this.resolveBuf || !this.readbackBuf) return;
    encoder.resolveQuerySet(this.querySet, 0, this.capacity, this.resolveBuf, 0);
    if (!this.mapping) {
      encoder.copyBufferToBuffer(this.resolveBuf, 0, this.readbackBuf, 0, this.capacity * 8);
    }
  }

  pollReadback(): void {
    if (!this.readbackBuf || this.mapping) return;
    this.mapping = true;
    const buf = this.readbackBuf;
    buf
      .mapAsync(GPUMapMode.READ)
      .then(() => {
        const view = new BigUint64Array(buf.getMappedRange());
        for (const s of this.slots) {
          s.lastMs = Number((view[s.endIdx] ?? 0n) - (view[s.beginIdx] ?? 0n)) / 1_000_000;
        }
        buf.unmap();
      })
      .catch(() => {
        /* device lost */
      })
      .finally(() => {
        this.mapping = false;
      });
  }

  lastMs(name: string): number {
    return this.slots.find((s) => s.name === name)?.lastMs ?? Number.NaN;
  }

  totalMs(): number {
    let total = 0;
    let any = false;
    for (const s of this.slots)
      if (Number.isFinite(s.lastMs)) {
        total += s.lastMs;
        any = true;
      }
    return any ? total : Number.NaN;
  }

  passNames(): readonly string[] {
    return this.slots.map((s) => s.name);
  }

  destroy(): void {
    this.querySet?.destroy();
    this.resolveBuf?.destroy();
    this.readbackBuf?.destroy();
    this.querySet = null;
    this.resolveBuf = null;
    this.readbackBuf = null;
  }
}
