// MIP raycasting compute shader (week 1).
// Real front-to-back compositing + transfer function lands week 3-4.
//
// Uniform layout MUST match RaycastPass.updateUniforms in TS:
//   mat4x4<f32>   invViewProj      offset  0  bytes 64
//   vec4<f32>     cameraPos.xyz    offset 64  bytes 16
//   vec4<f32>     volBoundsMin.xyz offset 80  bytes 16
//   vec4<f32>     volBoundsMax.xyz offset 96  bytes 16
//   vec4<f32>     params           offset 112 bytes 16
//                  params.x = stepCount
//                  params.y = minHU
//                  params.z = maxHU

struct RaycastUniforms {
  invViewProj: mat4x4<f32>,
  cameraPos: vec4<f32>,
  volBoundsMin: vec4<f32>,
  volBoundsMax: vec4<f32>,
  params: vec4<f32>,
};

@group(0) @binding(0) var<uniform> uni: RaycastUniforms;
@group(0) @binding(1) var volume: texture_3d<f32>;
@group(0) @binding(2) var output: texture_storage_2d<rgba8unorm, write>;

fn unprojectRay(uv: vec2<f32>) -> vec3<f32> {
  let ndc = vec4<f32>(uv * 2.0 - vec2<f32>(1.0), 1.0, 1.0);
  let world = uni.invViewProj * ndc;
  return normalize((world.xyz / world.w) - uni.cameraPos.xyz);
}

@compute @workgroup_size(8, 8, 1)
fn cs_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(output);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }

  let uv = vec2<f32>(
    f32(gid.x) / f32(dims.x),
    1.0 - f32(gid.y) / f32(dims.y),
  );
  let rd = unprojectRay(uv);
  let ro = uni.cameraPos.xyz;

  let bMin = uni.volBoundsMin.xyz;
  let bMax = uni.volBoundsMax.xyz;
  let t = rayBoxIntersect(ro, rd, bMin, bMax);

  var color = vec3<f32>(0.0, 0.0, 0.0);
  if (t.x < t.y && t.y > 0.0) {
    let tNear = max(t.x, 0.0);
    let tFar = t.y;
    let stepCount = u32(uni.params.x);
    let dt = (tFar - tNear) / f32(stepCount);

    let volDims = vec3<f32>(textureDimensions(volume));
    let extent = bMax - bMin;
    let invExtent = 1.0 / extent;
    let minHU = uni.params.y;
    let maxHU = uni.params.z;
    let huRange = max(maxHU - minHU, 1.0);
    let maxIdx = volDims - vec3<f32>(1.0);

    var maxSample: f32 = 0.0;
    for (var i: u32 = 0u; i < stepCount; i = i + 1u) {
      let pos = ro + rd * (tNear + dt * (f32(i) + 0.5));
      let n = (pos - bMin) * invExtent;
      let voxelF = clamp(n * volDims, vec3<f32>(0.0), maxIdx);
      let voxel = vec3<u32>(voxelF);
      let s = textureLoad(volume, voxel, 0).r;
      let normalized = clamp((s - minHU) / huRange, 0.0, 1.0);
      maxSample = max(maxSample, normalized);
    }
    color = vec3<f32>(maxSample);
  }

  textureStore(output, vec2<i32>(i32(gid.x), i32(gid.y)), vec4<f32>(color, 1.0));
}
