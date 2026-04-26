export class Timestamps {
  private querySet: GPUQuerySet | null = null;
  private resolveBuffer: GPUBuffer | null = null;
  private readbackBuffer: GPUBuffer | null = null;
  private mapping = false;
  private lastDeltaMs_ = Number.NaN;

  constructor(device: GPUDevice, enabled: boolean) {
    if (!enabled) return;
    this.querySet = device.createQuerySet({ label: 'ts.queries', type: 'timestamp', count: 2 });
    this.resolveBuffer = device.createBuffer({
      label: 'ts.resolve',
      size: 16,
      usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
    });
    this.readbackBuffer = device.createBuffer({
      label: 'ts.readback',
      size: 16,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
  }

  get enabled(): boolean {
    return this.querySet !== null;
  }

  get lastMs(): number {
    return this.lastDeltaMs_;
  }

  computePassWrites(): GPUComputePassTimestampWrites | undefined {
    if (!this.querySet) return undefined;
    return {
      querySet: this.querySet,
      beginningOfPassWriteIndex: 0,
      endOfPassWriteIndex: 1,
    };
  }

  resolve(encoder: GPUCommandEncoder): void {
    if (!this.querySet || !this.resolveBuffer || !this.readbackBuffer) return;
    encoder.resolveQuerySet(this.querySet, 0, 2, this.resolveBuffer, 0);
    if (!this.mapping) {
      encoder.copyBufferToBuffer(this.resolveBuffer, 0, this.readbackBuffer, 0, 16);
    }
  }

  pollReadback(): void {
    if (!this.readbackBuffer || this.mapping) return;
    this.mapping = true;
    const buf = this.readbackBuffer;
    buf
      .mapAsync(GPUMapMode.READ)
      .then(() => {
        const view = new BigUint64Array(buf.getMappedRange());
        const begin = view[0] ?? 0n;
        const end = view[1] ?? 0n;
        this.lastDeltaMs_ = Number(end - begin) / 1_000_000;
        buf.unmap();
      })
      .catch(() => {
        // device may be lost or buffer destroyed; ignore
      })
      .finally(() => {
        this.mapping = false;
      });
  }

  destroy(): void {
    this.querySet?.destroy();
    this.resolveBuffer?.destroy();
    this.readbackBuffer?.destroy();
    this.querySet = null;
    this.resolveBuffer = null;
    this.readbackBuffer = null;
  }
}
