
struct FxFrame {
  viewProj : mat4x4f,
  cameraPos : vec4f,
  camRight : vec4f,
  camUp : vec4f,
};

struct Segment {
  p0 : vec4f,
  p1 : vec4f,
  color : vec4f,
};

@group(0) @binding(0) var<uniform> fxFrame : FxFrame;
@group(0) @binding(1) var<storage, read> segments : array<Segment>;

struct FxOut {
  @builtin(position) clipPos : vec4f,
  @location(0) localUv : vec2f,
  @location(1) @interpolate(flat) segLen : f32,
  @location(2) color : vec3f,
  @location(3) @interpolate(flat) tailBright : f32,
  @location(4) @interpolate(flat) softness : f32,
};

@vertex
fn vsFx(@builtin(vertex_index) vi : u32, @builtin(instance_index) inst : u32) -> FxOut {
  let seg = segments[inst];
  let a = seg.p0.xyz;
  let b = seg.p1.xyz;
  let width = max(seg.p0.w, 0.0005);
  let axis = b - a;
  let axisLen = length(axis);

  var dir = fxFrame.camRight.xyz;
  var side = fxFrame.camUp.xyz;
  if (axisLen > 1e-5) {
    dir = axis / axisLen;
    let toCam = normalize(fxFrame.cameraPos.xyz - (a + b) * 0.5);
    let s = cross(dir, toCam);
    let sl = length(s);
    if (sl > 1e-4) {
      side = s / sl;
    }
  }

  var corners = array<vec2f, 6>(
    vec2f(0.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
    vec2f(0.0, -1.0), vec2f(1.0, 1.0), vec2f(0.0, 1.0),
  );
  let corner = corners[vi];
  let lenW = axisLen / width;
  let along = mix(-1.0, lenW + 1.0, corner.x);
  let world = a + dir * (along * width) + side * (corner.y * width);

  var fout : FxOut;
  fout.clipPos = fxFrame.viewProj * vec4f(world, 1.0);
  fout.localUv = vec2f(along, corner.y);
  fout.segLen = lenW;
  fout.color = seg.color.rgb;
  fout.tailBright = seg.p1.w;
  fout.softness = max(seg.color.w, 0.5);
  return fout;
}

@fragment
fn fsFx(fin : FxOut) -> @location(0) vec4f {
  let u = fin.localUv.x;
  let du = max(max(-u, u - fin.segLen), 0.0);
  let d = length(vec2f(du, fin.localUv.y));
  var intensity = pow(clamp(1.0 - d, 0.0, 1.0), fin.softness);
  let t = select(clamp(u / max(fin.segLen, 1e-4), 0.0, 1.0), 1.0, fin.segLen < 0.01);
  intensity *= mix(fin.tailBright, 1.0, t);
  return vec4f(fin.color * intensity, 0.0);
}
