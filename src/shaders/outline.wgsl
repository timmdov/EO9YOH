
@group(0) @binding(0) var<uniform> post : PostUniforms;
@group(0) @binding(1) var hdrTex : texture_2d<f32>;
@group(0) @binding(2) var normalTex : texture_2d<f32>;
@group(0) @binding(3) var depthTex : texture_depth_2d;

fn linearDepth(d : f32) -> f32 {
  let near = post.camera.x;
  let far = post.camera.y;
  return near * far / max(far - d * (far - near), 1e-6);
}

fn loadDepth(p : vec2i) -> f32 {
  let dims = vec2i(textureDimensions(depthTex));
  return textureLoad(depthTex, clamp(p, vec2i(0), dims - 1), 0);
}

fn loadNormal(p : vec2i) -> vec4f {
  let dims = vec2i(textureDimensions(normalTex));
  return textureLoad(normalTex, clamp(p, vec2i(0), dims - 1), 0);
}

@fragment
fn fsOutline(fin : FullOut) -> @location(0) vec4f {
  let p = vec2i(fin.clipPos.xy);
  let color = textureLoad(hdrTex, p, 0);
  let dc = loadDepth(p);
  if (dc >= 1.0) {
    return color;
  }
  let lc = linearDepth(dc);
  let nc = loadNormal(p);

  var offsets = array<vec2i, 4>(vec2i(1, 0), vec2i(-1, 0), vec2i(0, 1), vec2i(0, -1));
  var depthEdge = 0.0;
  var normalEdge = 0.0;
  for (var i = 0; i < 4; i++) {
    let q = p + offsets[i];
    let ln = linearDepth(loadDepth(q));
    depthEdge = max(depthEdge, (lc - ln) / lc);
    let nn = loadNormal(q);
    normalEdge = max(normalEdge, 1.0 - dot(nc.xyz, nn.xyz));
  }

  let depthLine = smoothstep(0.04, 0.12, depthEdge);
  let normalLine = smoothstep(0.25, 0.6, normalEdge);
  var edge = max(depthLine, normalLine * 0.85);

  edge *= 1.0 - smoothstep(35.0, 70.0, lc);

  let isGlass = nc.w > 0.75;
  let lineColor = select(vec3f(0.006, 0.006, 0.008), color.rgb * 1.6 + vec3f(0.12, 0.02, 0.18), isGlass);
  return vec4f(mix(color.rgb, lineColor, edge * post.camera.w), 1.0);
}
