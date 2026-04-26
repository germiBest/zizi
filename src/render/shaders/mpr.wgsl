// MPR (Multi-Planar Reformation) compute shader stub.
// TODO(week 5-6): axial/sagittal/coronal slicing with optional slab projection
// (min/max/avg over N slices) and window/level transform.

@compute @workgroup_size(8, 8, 1)
fn cs_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  // intentionally empty
  _ = gid;
}
