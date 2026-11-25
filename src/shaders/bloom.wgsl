
@group(0) @binding(0) var<uniform> post : PostUniforms;
@group(0) @binding(1) var srcTex : texture_2d<f32>;
@group(0) @binding(2) var linearSampler : sampler;

fn sampleBox(uv : vec2f) -> vec3f {
  let texel = 1.0 / vec2f(textureDimensions(srcTex));
  let o = texel.xyxy * vec4f(-1.0, -1.0, 1.0, 1.0);
  var c = textureSampleLevel(srcTex, linearSampler, uv + o.xy, 0.0).rgb;
  c += textureSampleLevel(srcTex, linearSampler, uv + o.zy, 0.0).rgb;
  c += textureSampleLevel(srcTex, linearSampler, uv + o.xw, 0.0).rgb;
  c += textureSampleLevel(srcTex, linearSampler, uv + o.zw, 0.0).rgb;
  return c * 0.25;
}

@fragment
fn fsPrefilter(fin : FullOut) -> @location(0) vec4f {
  let c = sampleBox(fin.uv);
  let brightness = max(c.r, max(c.g, c.b));
  let threshold = post.fx.w;
  let knee = threshold * 0.5;
  var soft = brightness - threshold + knee;
  soft = clamp(soft, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-4);
  let contribution = max(soft, brightness - threshold) / max(brightness, 1e-4);

  return vec4f(min(c * contribution, vec3f(40.0)), 1.0);
}

@fragment
fn fsDown(fin : FullOut) -> @location(0) vec4f {
  return vec4f(sampleBox(fin.uv), 1.0);
}

@fragment
fn fsUp(fin : FullOut) -> @location(0) vec4f {
  let texel = 1.0 / vec2f(textureDimensions(srcTex));
  var c = textureSampleLevel(srcTex, linearSampler, fin.uv, 0.0).rgb * 4.0;
  c += textureSampleLevel(srcTex, linearSampler, fin.uv + vec2f(texel.x, 0.0), 0.0).rgb * 2.0;
  c += textureSampleLevel(srcTex, linearSampler, fin.uv - vec2f(texel.x, 0.0), 0.0).rgb * 2.0;
  c += textureSampleLevel(srcTex, linearSampler, fin.uv + vec2f(0.0, texel.y), 0.0).rgb * 2.0;
  c += textureSampleLevel(srcTex, linearSampler, fin.uv - vec2f(0.0, texel.y), 0.0).rgb * 2.0;
  c += textureSampleLevel(srcTex, linearSampler, fin.uv + texel, 0.0).rgb;
  c += textureSampleLevel(srcTex, linearSampler, fin.uv - texel, 0.0).rgb;
  c += textureSampleLevel(srcTex, linearSampler, fin.uv + vec2f(texel.x, -texel.y), 0.0).rgb;
  c += textureSampleLevel(srcTex, linearSampler, fin.uv + vec2f(-texel.x, texel.y), 0.0).rgb;
  return vec4f(c / 16.0, 1.0);
}
