export function invariant(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`[invariant] ${msg}`);
}

export function unreachable(value: never, msg = 'unreachable'): never {
  throw new Error(`${msg}: ${String(value)}`);
}
