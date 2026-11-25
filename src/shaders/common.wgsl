
struct FrameUniforms {
  viewProj : mat4x4f,
  lightViewProj : mat4x4f,
  cameraPos : vec4f,
  camRight : vec4f,
  camUp : vec4f,
  keyDir : vec4f,
  keyColor : vec4f,
  fillDir : vec4f,
  fillColor : vec4f,
  ambientSky : vec4f,
  ambientGround : vec4f,
  fogColor : vec4f,
  screen : vec4f,
  params : vec4f,
};

struct Instance {
  model : mat4x4f,
  color : vec4f,
  extra : vec4f,
};

struct VertexIn {
  @location(0) pos : vec3f,
  @location(1) nrm : vec3f,
  @location(2) col : vec4f,
};

struct VertexOut {
  @builtin(position) clipPos : vec4f,
  @location(0) worldPos : vec3f,
  @location(1) worldNrm : vec3f,
  @location(2) albedo : vec3f,
  @location(3) emissive : f32,
  @location(4) flash : f32,
  @location(5) highlight : f32,
};

struct FragOut {
  @location(0) color : vec4f,
  @location(1) normalMask : vec4f,
};

fn hash3(p : vec3f) -> f32 {
  let q = fract(p * 0.1031);
  let r = q + dot(q, q.yzx + 33.33);
  return fract((r.x + r.y) * r.z);
}
