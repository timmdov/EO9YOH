
@group(0) @binding(0) var<uniform> frameData : FrameUniforms;
@group(0) @binding(1) var shadowMap : texture_depth_2d;
@group(0) @binding(2) var shadowCmp : sampler_comparison;
@group(1) @binding(0) var<storage, read> instances : array<Instance>;

@vertex
fn vsMain(vin : VertexIn, @builtin(instance_index) inst : u32) -> VertexOut {
  let data = instances[inst];
  var vout : VertexOut;
  let world = data.model * vec4f(vin.pos, 1.0);
  vout.clipPos = frameData.viewProj * world;
  vout.worldPos = world.xyz;
  vout.worldNrm = (data.model * vec4f(vin.nrm, 0.0)).xyz;
  vout.albedo = vin.col.rgb * data.color.rgb;
  vout.emissive = vin.col.a + data.color.w;
  vout.flash = data.extra.x;
  vout.highlight = data.extra.z;
  return vout;
}

fn shadowFactor(worldPos : vec3f, n : vec3f) -> f32 {
  let biased = worldPos + n * 0.04;
  let lp = frameData.lightViewProj * vec4f(biased, 1.0);
  let proj = lp.xyz / lp.w;
  let uv = proj.xy * vec2f(0.5, -0.5) + vec2f(0.5);
  let refDepth = proj.z - 0.0015;
  let texel = frameData.params.z;
  var lit = 0.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      lit += textureSampleCompareLevel(shadowMap, shadowCmp, uv + vec2f(f32(x), f32(y)) * texel, refDepth);
    }
  }
  lit /= 9.0;
  let inside = all(uv >= vec2f(0.0)) && all(uv <= vec2f(1.0)) && proj.z <= 1.0;
  return select(1.0, lit, inside && frameData.params.x > 0.5);
}

@fragment
fn fsMain(fin : VertexOut) -> FragOut {
  let n = normalize(fin.worldNrm);
  let keyTerm = max(dot(n, normalize(frameData.keyDir.xyz)), 0.0);
  let fillTerm = max(dot(n, normalize(frameData.fillDir.xyz)), 0.0);
  let hemi = mix(frameData.ambientGround.rgb, frameData.ambientSky.rgb, n.y * 0.5 + 0.5);
  let shade = shadowFactor(fin.worldPos, n);

  let tile = hash3(floor(fin.worldPos * 0.5 + n * 0.25));
  let albedo = fin.albedo * (0.92 + 0.12 * tile);

  var lit = albedo * (hemi + frameData.keyColor.rgb * keyTerm * shade + frameData.fillColor.rgb * fillTerm);
  lit += albedo * fin.emissive;

  let viewDir = normalize(frameData.cameraPos.xyz - fin.worldPos);
  let rim = pow(1.0 - max(dot(n, viewDir), 0.0), 2.0);
  lit += vec3f(1.0, 0.95, 0.85) * fin.highlight * (0.35 + rim * 1.5);
  lit = mix(lit, vec3f(4.0), fin.flash);

  let viewDist = length(fin.worldPos - frameData.cameraPos.xyz);
  let fogAmount = 1.0 - exp(-viewDist * frameData.fogColor.w);
  lit = mix(lit, frameData.fogColor.rgb, fogAmount);

  var fout : FragOut;
  fout.color = vec4f(lit, 1.0);
  fout.normalMask = vec4f(n, frameData.params.y);
  return fout;
}
