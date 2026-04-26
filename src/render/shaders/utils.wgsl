// Shared WGSL helpers. Composed via composeShader() at TS layer.

fn rayBoxIntersect(ro: vec3<f32>, rd: vec3<f32>, bMin: vec3<f32>, bMax: vec3<f32>) -> vec2<f32> {
  let invD = 1.0 / rd;
  let t0 = (bMin - ro) * invD;
  let t1 = (bMax - ro) * invD;
  let tmin = min(t0, t1);
  let tmax = max(t0, t1);
  let tNear = max(max(tmin.x, tmin.y), tmin.z);
  let tFar = min(min(tmax.x, tmax.y), tmax.z);
  return vec2<f32>(tNear, tFar);
}

fn linearStep(edge0: f32, edge1: f32, x: f32) -> f32 {
  return clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
}
