export class DeviceLostError extends Error {
  constructor(
    readonly reason: GPUDeviceLostReason,
    message: string,
  ) {
    super(`device lost (${reason}): ${message}`);
    this.name = 'DeviceLostError';
  }
}

export async function withErrorScope<T>(
  device: GPUDevice,
  label: string,
  fn: () => Promise<T> | T,
): Promise<T> {
  if (!__DEV__) {
    return await fn();
  }
  device.pushErrorScope('validation');
  device.pushErrorScope('out-of-memory');
  try {
    return await fn();
  } finally {
    const oom = await device.popErrorScope();
    const val = await device.popErrorScope();
    if (oom) console.error(`[${label}] OOM:`, oom.message);
    if (val) console.error(`[${label}] validation:`, val.message);
  }
}
