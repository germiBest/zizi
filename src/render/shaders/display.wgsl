// Fullscreen blit from rgba8unorm storage texture to canvas color attachment.
// One big triangle, no vertex buffer.

struct VsOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vid: u32) -> VsOut {
  let x = f32((vid << 1u) & 2u);
  let y = f32(vid & 2u);
  let pos = vec2<f32>(x, y);
  var out: VsOut;
  out.clip = vec4<f32>(pos * 2.0 - vec2<f32>(1.0), 0.0, 1.0);
  out.uv = vec2<f32>(pos.x, 1.0 - pos.y);
  return out;
}

@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  return textureSample(src, smp, in.uv);
}
