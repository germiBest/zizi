// Transfer function 1D LUT lookup stub.
// TODO(week 3-4): sample TF texture with HU value, return rgba color
// for front-to-back compositing in the raycaster.

fn applyTransferFn(hu: f32) -> vec4<f32> {
  // Placeholder: linear gray ramp
  let n = clamp((hu + 1000.0) / 4000.0, 0.0, 1.0);
  return vec4<f32>(n, n, n, n);
}
