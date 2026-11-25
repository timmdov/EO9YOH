
@group(0) @binding(0) var<uniform> post : PostUniforms;
@group(0) @binding(1) var compTex : texture_2d<f32>;
@group(0) @binding(2) var bloomTex : texture_2d<f32>;
@group(0) @binding(3) var normalTex : texture_2d<f32>;
@group(0) @binding(4) var linearSampler : sampler;

fn aces(x : vec3f) -> vec3f {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3f(0.0), vec3f(1.0));
}

fn grainHash(p : vec2f) -> f32 {
  let q = fract(p * vec2f(123.34, 456.21));
  let r = q + dot(q, q + 45.32);
  return fract(r.x * r.y);
}

@fragment
fn fsFinal(fin : FullOut) -> @location(0) vec4f {
  let uv = fin.uv;
  let centered = uv - vec2f(0.5);
  let radial = dot(centered, centered);

  let ca = post.grade.z * radial;
  let offs = centered * ca;
  var color = vec3f(
    textureSampleLevel(compTex, linearSampler, uv + offs, 0.0).r,
    textureSampleLevel(compTex, linearSampler, uv, 0.0).g,
    textureSampleLevel(compTex, linearSampler, uv - offs, 0.0).b,
  );

  color += textureSampleLevel(bloomTex, linearSampler, uv, 0.0).rgb * post.fx.y;
  color *= post.fx.z;

  let dims = vec2f(textureDimensions(normalTex));
  let mask = textureLoad(normalTex, vec2i(uv * dims), 0).w;
  let isEnemy = select(0.0, 1.0, mask > 0.75);

  let luma = dot(color, vec3f(0.2126, 0.7152, 0.0722));
  let desat = post.grade.y * (1.0 - isEnemy);
  color = mix(color, vec3f(luma) * vec3f(0.92, 0.97, 1.05), desat);

  color = mix(color, post.flash.rgb, post.flash.a);

  var mapped = aces(color);

  let vig = 1.0 - post.fx.x * smoothstep(0.15, 0.7, radial * 1.6);
  mapped *= vig;

  let wave = sin(post.camera.z * post.danger.y);
  let threatPulse = smoothstep(0.0, 0.3, abs(wave));
  mapped *= 1.0 - post.danger.x * threatPulse;

  let g = grainHash(fin.clipPos.xy + vec2f(post.camera.z * 61.0, post.camera.z * 17.0)) - 0.5;
  mapped += vec3f(g * post.grade.w);

  let encoded = pow(clamp(mapped, vec3f(0.0), vec3f(1.0)), vec3f(1.0 / 2.2));
  return vec4f(encoded, 1.0);
}
