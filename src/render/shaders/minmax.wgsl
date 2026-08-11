@group(0) @binding(0) var volume: texture_3d<f32>;
@group(0) @binding(1) var grid: texture_storage_3d<rgba16float, write>;

const CELL: u32 = 8u;

var<workgroup> sMin: array<f32, 64>;
var<workgroup> sMax: array<f32, 64>;

@compute @workgroup_size(8, 8, 1)
fn cs_build(
  @builtin(local_invocation_id) lid: vec3<u32>,
  @builtin(workgroup_id) wid: vec3<u32>,
) {
  let dims = textureDimensions(volume);
  let origin = wid * CELL;

  var lmin: f32 = 1.0e30;
  var lmax: f32 = -1.0e30;
  for (var k: u32 = 0u; k < CELL; k = k + 1u) {
    let v = origin + vec3<u32>(lid.x, lid.y, k);
    if (v.x < dims.x && v.y < dims.y && v.z < dims.z) {
      let hu = textureLoad(volume, vec3<i32>(v), 0).r;
      lmin = min(lmin, hu);
      lmax = max(lmax, hu);
    }
  }

  let li = lid.x + lid.y * 8u;
  sMin[li] = lmin;
  sMax[li] = lmax;
  workgroupBarrier();

  if (li < 32u) { sMin[li] = min(sMin[li], sMin[li + 32u]); sMax[li] = max(sMax[li], sMax[li + 32u]); }
  workgroupBarrier();
  if (li < 16u) { sMin[li] = min(sMin[li], sMin[li + 16u]); sMax[li] = max(sMax[li], sMax[li + 16u]); }
  workgroupBarrier();
  if (li <  8u) { sMin[li] = min(sMin[li], sMin[li +  8u]); sMax[li] = max(sMax[li], sMax[li +  8u]); }
  workgroupBarrier();
  if (li <  4u) { sMin[li] = min(sMin[li], sMin[li +  4u]); sMax[li] = max(sMax[li], sMax[li +  4u]); }
  workgroupBarrier();
  if (li <  2u) { sMin[li] = min(sMin[li], sMin[li +  2u]); sMax[li] = max(sMax[li], sMax[li +  2u]); }
  workgroupBarrier();
  if (li == 0u) {
    let fmin = min(sMin[0], sMin[1]);
    let fmax = max(sMax[0], sMax[1]);
    textureStore(grid, vec3<i32>(wid), vec4<f32>(fmin, fmax, 0.0, 0.0));
  }
}
