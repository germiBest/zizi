// MPR (Multi-Planar Reformation) compute shader.
// One invocation per output pixel. Samples a slab of N voxels along the plane
// normal, reduces with min/max/avg, applies W/L → TF, writes opaque RGBA.
//
// Uniform layout MUST match MprPass.updateUniforms in TS:
//   vec4<f32> config     off  0  (plane, sliceIdxNorm, slabSlices, slabReduce)
//   vec4<f32> volExtent  off 16  (w, h, d, _)
//   vec4<f32> wl         off 32  (level, width, _, _)

struct MprUniforms {
  config: vec4<f32>,
  volExtent: vec4<f32>,
  wl: vec4<f32>,
};

@group(0) @binding(0) var<uniform> uni: MprUniforms;
@group(0) @binding(1) var volume: texture_3d<f32>;
@group(0) @binding(2) var tf: texture_2d<f32>;
@group(0) @binding(3) var smp: sampler;
@group(0) @binding(4) var output: texture_storage_2d<rgba8unorm, write>;

fn planeCoord(plane: u32, uv: vec2<f32>, slice: f32) -> vec3<f32> {
  if (plane == 1u) { return vec3<f32>(slice, uv.x, uv.y); }      // sagittal: x fixed
  if (plane == 2u) { return vec3<f32>(uv.x, slice, uv.y); }      // coronal:  y fixed
  return vec3<f32>(uv.x, uv.y, slice);                            // axial:    z fixed
}

fn normalStep(plane: u32, dims: vec3<f32>) -> f32 {
  if (plane == 1u) { return 1.0 / max(dims.x, 1.0); }
  if (plane == 2u) { return 1.0 / max(dims.y, 1.0); }
  return 1.0 / max(dims.z, 1.0);
}

@compute @workgroup_size(8, 8, 1)
fn cs_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(output);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }

  let uv = vec2<f32>(
    f32(gid.x) / f32(dims.x),
    f32(gid.y) / f32(dims.y),
  );

  let plane = u32(uni.config.x);
  let slice = clamp(uni.config.y, 0.0, 1.0);
  let slabN = max(u32(uni.config.z), 1u);
  let reduce = u32(uni.config.w);
  let stepN = normalStep(plane, uni.volExtent.xyz);
  let halfSlab = (f32(slabN) - 1.0) * 0.5;

  var minV: f32 = 1e30;
  var maxV: f32 = -1e30;
  var sumV: f32 = 0.0;

  for (var i: u32 = 0u; i < slabN; i = i + 1u) {
    let off = (f32(i) - halfSlab) * stepN;
    let s = clamp(slice + off, 0.0, 1.0);
    let pos = clamp(planeCoord(plane, uv, s), vec3<f32>(0.0), vec3<f32>(1.0));
    let hu = textureSampleLevel(volume, smp, pos, 0.0).r;
    minV = min(minV, hu);
    maxV = max(maxV, hu);
    sumV = sumV + hu;
  }

  var hu: f32;
  if (reduce == 0u) { hu = minV; }
  else if (reduce == 1u) { hu = maxV; }
  else { hu = sumV / f32(slabN); }

  let level = uni.wl.x;
  let widthRaw = uni.wl.y;
  let widthSafe = max(widthRaw, 1.0);
  let lowVisible = level - widthRaw * 0.5;
  let normWl = clamp((hu - lowVisible) / widthSafe, 0.0, 1.0);
  let rgba = textureSampleLevel(tf, smp, vec2<f32>(normWl, 0.5), 0.0);

  textureStore(output, vec2<i32>(i32(gid.x), i32(gid.y)), vec4<f32>(rgba.rgb, 1.0));
}
