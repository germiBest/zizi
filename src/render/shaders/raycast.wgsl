// Raycasting compute shader. Branches on render mode:
//   DVR   — front-to-back over compositing with W/L → TF; optional gradient shading
//   MIP   — max intensity projection (track max sample → TF)
//   MinIP — min intensity projection (track min → TF)
//   Avg   — averaged sample value → TF (X-ray-like)
//
// Uniform layout MUST match RaycastPass.updateUniforms in TS:
//   mat4x4<f32> invViewProj   off  0  bytes 64
//   vec4<f32>   cameraPos     off 64  bytes 16
//   vec4<f32>   volBoundsMin  off 80  bytes 16
//   vec4<f32>   volBoundsMax  off 96  bytes 16
//   vec4<f32>   params        off 112 bytes 16  (stepCount, density, dtRef, alphaMax)
//   vec4<f32>   wl            off 128 bytes 16  (lowVisible, invWidth, upperVisible, lowerVisible)
//   vec4<f32>   mode          off 144 bytes 16  (renderMode, gradientFlag, _, _)

struct RaycastUniforms {
  invViewProj: mat4x4<f32>,
  cameraPos: vec4<f32>,
  volBoundsMin: vec4<f32>,
  volBoundsMax: vec4<f32>,
  params: vec4<f32>,
  wl: vec4<f32>,
  mode: vec4<f32>,
};

@group(0) @binding(0) var<uniform> uni: RaycastUniforms;
@group(0) @binding(1) var volume: texture_3d<f32>;
@group(0) @binding(2) var tf: texture_2d<f32>;
@group(0) @binding(3) var smp: sampler;
@group(0) @binding(4) var output: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(5) var minmaxGrid: texture_3d<f32>;

fn unprojectRay(uv: vec2<f32>) -> vec3<f32> {
  let ndc = vec4<f32>(uv * 2.0 - vec2<f32>(1.0), 1.0, 1.0);
  let world = uni.invViewProj * ndc;
  return normalize((world.xyz / world.w) - uni.cameraPos.xyz);
}

fn sampleHU(n: vec3<f32>) -> f32 {
  return textureSampleLevel(volume, smp, n, 0.0).r;
}

// 6-tap central-difference gradient in normalized volume space.
// Step size = 1 voxel along each axis. Magnitude is implicit (we normalize for shading).
fn gradVolume(p: vec3<f32>) -> vec3<f32> {
  let dims = vec3<f32>(textureDimensions(volume));
  let h = 1.0 / dims;
  let dx = sampleHU(p + vec3<f32>(h.x, 0.0, 0.0)) - sampleHU(p - vec3<f32>(h.x, 0.0, 0.0));
  let dy = sampleHU(p + vec3<f32>(0.0, h.y, 0.0)) - sampleHU(p - vec3<f32>(0.0, h.y, 0.0));
  let dz = sampleHU(p + vec3<f32>(0.0, 0.0, h.z)) - sampleHU(p - vec3<f32>(0.0, 0.0, h.z));
  return vec3<f32>(dx, dy, dz);
}

fn applyShading(rgb: vec3<f32>, n: vec3<f32>, viewDir: vec3<f32>) -> vec3<f32> {
  let g = gradVolume(n);
  let glen = length(g);
  if (glen < 1.0) {
    return rgb;
  }
  // Gradient points toward HIGHER HU (interior of denser tissue).
  // The outward surface normal is therefore -gradient/length.
  let normal = -g / glen;
  let lightDir = normalize(vec3<f32>(0.55, 0.65, -0.5));
  let halfDir = normalize(lightDir + viewDir);
  let diff = max(dot(normal, lightDir), 0.0);
  let spec = pow(max(dot(normal, halfDir), 0.0), 28.0);
  let lit = 0.22 + 0.62 * diff + 0.38 * spec;
  return rgb * lit;
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

  var color = vec4<f32>(0.0, 0.0, 0.0, 0.0);
  if (t.x >= t.y || t.y <= 0.0) {
    textureStore(output, vec2<i32>(i32(gid.x), i32(gid.y)), color);
    return;
  }

  let tNear = max(t.x, 0.0);
  let tFar = t.y;
  let stepCount = u32(uni.params.x);
  let density = uni.params.y;
  let dtRef = max(uni.params.z, 1e-6);
  let alphaMax = uni.params.w;
  let dt = (tFar - tNear) / f32(stepCount);
  let stepRatio = max(dt / dtRef, 0.0);

  let extent = bMax - bMin;
  let invExtent = 1.0 / extent;

  let lowVisible = uni.wl.x;
  let invWidth = uni.wl.y;
  let upperVisible = uni.wl.z;
  let lowerVisible = uni.wl.w;

  let renderMode = u32(uni.mode.x);
  let useGradient = uni.mode.y > 0.5;
  let viewDir = -rd;

  let cellDimsU = textureDimensions(minmaxGrid);
  let cellDims = vec3<f32>(cellDimsU);
  let cellWorldSize = (bMax - bMin) / cellDims;
  let cellMinAxis = min(min(cellWorldSize.x, cellWorldSize.y), cellWorldSize.z);
  let skipSteps = max(u32(floor(cellMinAxis / dt)), 1u);
  let cellMaxIdx = vec3<i32>(cellDimsU) - vec3<i32>(1, 1, 1);

  if (renderMode == 0u) {
    for (var i: u32 = 0u; i < stepCount; i = i + 1u) {
      let pos = ro + rd * (tNear + dt * (f32(i) + 0.5));
      let n = clamp((pos - bMin) * invExtent, vec3<f32>(0.0), vec3<f32>(1.0));

      let cellCoord = clamp(vec3<i32>(n * cellDims), vec3<i32>(0, 0, 0), cellMaxIdx);
      let mm = textureLoad(minmaxGrid, cellCoord, 0);
      if (mm.g < lowVisible) {
        i = i + skipSteps - 1u;
        continue;
      }

      let hu = sampleHU(n);
      let normWl = clamp((hu - lowVisible) * invWidth, 0.0, 1.0);
      var rgba = textureSampleLevel(tf, smp, vec2<f32>(normWl, 0.5), 0.0);

      if (useGradient && rgba.a > 0.001) {
        rgba = vec4<f32>(applyShading(rgba.rgb, n, viewDir), rgba.a);
      }

      let aRaw = clamp(rgba.a * density, 0.0, 1.0);
      let aStep = 1.0 - pow(max(1.0 - aRaw, 0.0), stepRatio);
      let weight = (1.0 - color.a) * aStep;
      color = vec4<f32>(
        color.r + weight * rgba.r,
        color.g + weight * rgba.g,
        color.b + weight * rgba.b,
        color.a + weight,
      );

      if (color.a > alphaMax) { break; }
    }
  } else {
    var acc: f32 = 0.0;
    if (renderMode == 1u) { acc = -1.0e30; }
    else if (renderMode == 2u) { acc = 1.0e30; }

    for (var i: u32 = 0u; i < stepCount; i = i + 1u) {
      let pos = ro + rd * (tNear + dt * (f32(i) + 0.5));
      let n = clamp((pos - bMin) * invExtent, vec3<f32>(0.0), vec3<f32>(1.0));

      if (renderMode != 3u) {
        let cellCoord = clamp(vec3<i32>(n * cellDims), vec3<i32>(0, 0, 0), cellMaxIdx);
        let mm = textureLoad(minmaxGrid, cellCoord, 0);
        let canSkip = (renderMode == 1u && mm.g < lowVisible) ||
                      (renderMode == 2u && mm.r > upperVisible);
        if (canSkip) {
          i = i + skipSteps - 1u;
          continue;
        }
      }

      let hu = sampleHU(n);
      if (renderMode == 1u) {
        acc = max(acc, hu);
        if (acc >= upperVisible) { break; }
      } else if (renderMode == 2u) {
        acc = min(acc, hu);
        if (acc <= lowerVisible) { break; }
      } else {
        acc = acc + hu;
      }
    }

    var finalHU = acc;
    if (renderMode == 3u) { finalHU = acc / f32(stepCount); }

    let normWl = clamp((finalHU - lowVisible) * invWidth, 0.0, 1.0);
    let rgba = textureSampleLevel(tf, smp, vec2<f32>(normWl, 0.5), 0.0);
    color = vec4<f32>(rgba.rgb, 1.0);
  }

  textureStore(output, vec2<i32>(i32(gid.x), i32(gid.y)), color);
}
