
@group(0) @binding(0) var<uniform> frameData : FrameUniforms;
@group(0) @binding(1) var sceneCopy : texture_2d<f32>;
@group(0) @binding(2) var linearSampler : sampler;
@group(1) @binding(0) var<storage, read> instances : array<Instance>;

@vertex
fn vsGlass(vin : VertexIn, @builtin(instance_index) inst : u32) -> VertexOut {
  let data = instances[inst];
  var vout : VertexOut;
  let world = data.model * vec4f(vin.pos, 1.0);
  vout.clipPos = frameData.viewProj * world;
  vout.worldPos = world.xyz;
  vout.worldNrm = (data.model * vec4f(vin.nrm, 0.0)).xyz;
  vout.albedo = vin.col.rgb * data.color.rgb;
  vout.emissive = vin.col.a + data.color.w;
  vout.flash = data.extra.x;
  vout.highlight = data.extra.y;
  return vout;
}

@fragment
fn fsGlass(fin : VertexOut) -> FragOut {
  let n = normalize(fin.worldNrm);
  let viewDir = normalize(frameData.cameraPos.xyz - fin.worldPos);
  let facing = max(dot(n, viewDir), 0.0);
  let fresnel = pow(1.0 - facing, 3.0);

  let screenUv = fin.clipPos.xy * frameData.screen.zw;
  let bend = vec2f(dot(n, frameData.camRight.xyz), -dot(n, frameData.camUp.xyz));
  let refractUv = clamp(screenUv + bend * 0.045, vec2f(0.001), vec2f(0.999));
  let behind = textureSampleLevel(sceneCopy, linearSampler, refractUv, 0.0).rgb;

  let tint = fin.albedo;
  let keyDir = normalize(frameData.keyDir.xyz);
  let halfVec = normalize(keyDir + viewDir);
  let spec = pow(max(dot(n, halfVec), 0.0), 64.0) * 3.0;

  let pulse = 0.75 + 0.25 * sin(frameData.cameraPos.w * 3.0 + fin.worldPos.y * 4.0);
  let core = tint * fin.emissive * pow(facing, 2.0) * pulse;

  var color = behind * tint * 0.55 + tint * 0.08;
  color += core;
  color += mix(tint, vec3f(1.0), 0.35) * fresnel * 2.2;
  color += frameData.keyColor.rgb * spec;
  color = mix(color, vec3f(5.0, 4.6, 4.2), fin.flash);

  let fade = clamp(fin.highlight, 0.0, 1.0);
  color = mix(behind, color, fade);

  let viewDist = length(fin.worldPos - frameData.cameraPos.xyz);
  let fogAmount = 1.0 - exp(-viewDist * frameData.fogColor.w * 0.6);
  color = mix(color, frameData.fogColor.rgb, fogAmount);

  var fout : FragOut;
  fout.color = vec4f(color, 1.0);
  fout.normalMask = vec4f(n, 1.0);
  return fout;
}
