
@group(0) @binding(0) var<uniform> frameData : FrameUniforms;
@group(1) @binding(0) var<storage, read> instances : array<Instance>;

@vertex
fn vsShadow(vin : VertexIn, @builtin(instance_index) inst : u32) -> @builtin(position) vec4f {
  let world = instances[inst].model * vec4f(vin.pos, 1.0);
  return frameData.lightViewProj * world;
}
