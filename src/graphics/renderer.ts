interface Batch {mesh:Mesh;first:number;count:number}
type RenderTargets = Targets;
interface Targets {hdr:GPUTexture;hdrCopy:GPUTexture;normal:GPUTexture;depth:GPUTexture;comp:GPUTexture;bloom:GPUTexture;bloomViews:GPUTextureView[];glassBG:GPUBindGroup;outlineBG:GPUBindGroup;finalBG:GPUBindGroup;prefilterBG:GPUBindGroup;downBGs:GPUBindGroup[];upBGs:GPUBindGroup[];width:number;height:number}
import { mat4 } from "wgpu-matrix";
import bloom_default from "../shaders/bloom.wgsl?raw";
import common_default from "../shaders/common.wgsl?raw";
import final_default from "../shaders/final.wgsl?raw";
import fx_default from "../shaders/fx.wgsl?raw";
import glass_default from "../shaders/glass.wgsl?raw";
import outline_default from "../shaders/outline.wgsl?raw";
import post_default from "../shaders/post.wgsl?raw";
import scene_default from "../shaders/scene.wgsl?raw";
import shadow_default from "../shaders/shadow.wgsl?raw";
import type { Matrix } from "../types";
import type { Camera } from "./camera";
import type { Gfx } from "./gfx";
import type { Mesh } from "./mesh";
import { STATIC_VERTEX_LAYOUT } from "./mesh";
var HDR_FORMAT: GPUTextureFormat = "rgba16float";
var DEPTH_FORMAT: GPUTextureFormat = "depth32float";
var SHADOW_SIZE = 2048;
var FRAME_FLOATS = 80;
var FX_FRAME_FLOATS = 28;
var POST_FLOATS = 24;
var INSTANCE_FLOATS = 24;
var SEGMENT_FLOATS = 12;
var MAX_INSTANCES = 8192;
var MAX_SEGMENTS = 8192;
var BLOOM_LEVELS = 5;
var LAYERS: ("opaque"|"glass"|"viewmodel")[] = ["opaque", "glass", "viewmodel"];
function defaultPostParams() {
  return {
    freeze: 0,
    desaturation: 0,
    aberration: 0,
    grain: 0.035,
    vignette: 0.35,
    bloomStrength: 0.6,
    bloomThreshold: 1,
    exposure: 1,
    outline: 1,
    flash: [1, 1, 1, 0],
    threat: 0,
    threatPulseRate: 1
  };
}
class Renderer {
  gfx;
  lighting = {
    keyDir: [0.45, 0.8, 0.35],
    keyColor: [1.6, 0.95, 0.55],
    fillDir: [-0.6, 0.3, -0.5],
    fillColor: [0.18, 0.32, 0.38],
    ambientSky: [0.16, 0.17, 0.2],
    ambientGround: [0.07, 0.065, 0.06],
    fogColor: [0.035, 0.04, 0.045],
    fogDensity: 0.02
  };
  quality = "high";
  lastDrawCalls = 0;
  lastInstances = 0;
  lastSegments = 0;
  device;
  linearSampler;
  shadowSampler;
  scenePipeline;
  shadowPipeline;
  glassPipeline;
  fxPipeline;
  outlinePipeline;
  prefilterPipeline;
  downPipeline;
  upPipeline;
  finalPipeline;
  glassLayout;
  bloomLayout;
  frameWorldBuf;
  frameVmBuf;
  fxFrameBuf;
  postBuf;
  instanceBuf;
  segmentBuf;
  sceneWorldBG;
  sceneVmBG;
  shadowBG;
  instanceBG;
  fxBG;
  shadowTex;
  shadowView;
  targets: RenderTargets | null = null;
  frameData = new Float32Array(FRAME_FLOATS);
  fxFrameData = new Float32Array(FX_FRAME_FLOATS);
  postData = new Float32Array(POST_FLOATS);
  instanceStaging = new Float32Array(MAX_INSTANCES * INSTANCE_FLOATS);
  segmentStaging = new Float32Array(MAX_SEGMENTS * SEGMENT_FLOATS);
  segmentCount = 0;
  buckets = {
    opaque: new Map<Mesh,{mesh:Mesh;data:Float32Array<ArrayBuffer>;count:number}>(),
    glass: new Map<Mesh,{mesh:Mesh;data:Float32Array<ArrayBuffer>;count:number}>(),
    viewmodel: new Map<Mesh,{mesh:Mesh;data:Float32Array<ArrayBuffer>;count:number}>()
  };
  batches: Record<"opaque"|"glass"|"viewmodel",Batch[]> = { opaque: [], glass: [], viewmodel: [] };
  lightView = mat4.create();
  lightProj = mat4.create();
  lightViewProj = mat4.create();
  warnedInstances = false;
  warnedSegments = false;
  constructor(gfx: Gfx) {
    this.gfx = gfx;
    const device = gfx.device;
    this.device = device;
    this.linearSampler = device.createSampler({
      label: "linear",
      magFilter: "linear",
      minFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge"
    });
    this.shadowSampler = device.createSampler({
      label: "shadow-cmp",
      compare: "less-equal",
      magFilter: "linear",
      minFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge"
    });
    const uniformBuf = (label: string, floats: number) => device.createBuffer({ label, size: floats * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.frameWorldBuf = uniformBuf("frame-world", FRAME_FLOATS);
    this.frameVmBuf = uniformBuf("frame-viewmodel", FRAME_FLOATS);
    this.fxFrameBuf = uniformBuf("fx-frame", FX_FRAME_FLOATS);
    this.postBuf = uniformBuf("post", POST_FLOATS);
    this.instanceBuf = device.createBuffer({
      label: "instances",
      size: MAX_INSTANCES * INSTANCE_FLOATS * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });
    this.segmentBuf = device.createBuffer({
      label: "segments",
      size: MAX_SEGMENTS * SEGMENT_FLOATS * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });
    this.shadowTex = device.createTexture({
      label: "shadow-map",
      size: [SHADOW_SIZE, SHADOW_SIZE],
      format: DEPTH_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
    });
    this.shadowView = this.shadowTex.createView();
    const VF = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;
    const sceneLayout = device.createBindGroupLayout({
      label: "scene-g0",
      entries: [
        { binding: 0, visibility: VF, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "depth" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "comparison" } }
      ]
    });
    const shadowLayout = device.createBindGroupLayout({
      label: "shadow-g0",
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } }]
    });
    this.glassLayout = device.createBindGroupLayout({
      label: "glass-g0",
      entries: [
        { binding: 0, visibility: VF, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } }
      ]
    });
    const instanceLayout = device.createBindGroupLayout({
      label: "instances-g1",
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } }]
    });
    const fxLayout = device.createBindGroupLayout({
      label: "fx-g0",
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } }
      ]
    });
    this.bloomLayout = device.createBindGroupLayout({
      label: "bloom-g0",
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } }
      ]
    });
    const sceneModule = this.module("scene.wgsl", common_default + scene_default);
    const shadowModule = this.module("shadow.wgsl", common_default + shadow_default);
    const glassModule = this.module("glass.wgsl", common_default + glass_default);
    const fxModule = this.module("fx.wgsl", fx_default);
    const outlineModule = this.module("outline.wgsl", post_default + outline_default);
    const bloomModule = this.module("bloom.wgsl", post_default + bloom_default);
    const finalModule = this.module("final.wgsl", post_default + final_default);
    const sceneTargets: GPUColorTargetState[] = [{ format: HDR_FORMAT }, { format: HDR_FORMAT }];
    const depthWrite: GPUDepthStencilState = { format: DEPTH_FORMAT, depthWriteEnabled: true, depthCompare: "less" };
    this.scenePipeline = device.createRenderPipeline({
      label: "scene",
      layout: device.createPipelineLayout({ bindGroupLayouts: [sceneLayout, instanceLayout] }),
      vertex: { module: sceneModule, entryPoint: "vsMain", buffers: [STATIC_VERTEX_LAYOUT] },
      fragment: { module: sceneModule, entryPoint: "fsMain", targets: sceneTargets },
      primitive: { topology: "triangle-list", cullMode: "back", frontFace: "ccw" },
      depthStencil: depthWrite
    });
    this.shadowPipeline = device.createRenderPipeline({
      label: "shadow",
      layout: device.createPipelineLayout({ bindGroupLayouts: [shadowLayout, instanceLayout] }),
      vertex: { module: shadowModule, entryPoint: "vsShadow", buffers: [STATIC_VERTEX_LAYOUT] },
      primitive: { topology: "triangle-list", cullMode: "none" },
      depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: true, depthCompare: "less", depthBias: 2, depthBiasSlopeScale: 2.5 }
    });
    this.glassPipeline = device.createRenderPipeline({
      label: "glass",
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.glassLayout, instanceLayout] }),
      vertex: { module: glassModule, entryPoint: "vsGlass", buffers: [STATIC_VERTEX_LAYOUT] },
      fragment: { module: glassModule, entryPoint: "fsGlass", targets: sceneTargets },
      primitive: { topology: "triangle-list", cullMode: "back", frontFace: "ccw" },
      depthStencil: depthWrite
    });
    this.fxPipeline = device.createRenderPipeline({
      label: "fx",
      layout: device.createPipelineLayout({ bindGroupLayouts: [fxLayout] }),
      vertex: { module: fxModule, entryPoint: "vsFx" },
      fragment: {
        module: fxModule,
        entryPoint: "fsFx",
        targets: [
          {
            format: HDR_FORMAT,
            blend: {
              color: { srcFactor: "one", dstFactor: "one", operation: "add" },
              alpha: { srcFactor: "one", dstFactor: "one", operation: "add" }
            }
          }
        ]
      },
      primitive: { topology: "triangle-list", cullMode: "none" },
      depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: false, depthCompare: "less" }
    });
    const fullscreen = (label: string, module: GPUShaderModule, entryPoint: string, format: GPUTextureFormat, layout: GPUPipelineLayout | "auto", blend?: GPUBlendState) => device.createRenderPipeline({
      label,
      layout,
      vertex: { module, entryPoint: "vsFull" },
      fragment: { module, entryPoint, targets: [{ format, blend }] },
      primitive: { topology: "triangle-list" }
    });
    const bloomPipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [this.bloomLayout] });
    this.outlinePipeline = fullscreen("outline", outlineModule, "fsOutline", HDR_FORMAT, "auto");
    this.prefilterPipeline = fullscreen("bloom-prefilter", bloomModule, "fsPrefilter", HDR_FORMAT, bloomPipelineLayout);
    this.downPipeline = fullscreen("bloom-down", bloomModule, "fsDown", HDR_FORMAT, bloomPipelineLayout);
    this.upPipeline = fullscreen("bloom-up", bloomModule, "fsUp", HDR_FORMAT, bloomPipelineLayout, {
      color: { srcFactor: "one", dstFactor: "one", operation: "add" },
      alpha: { srcFactor: "one", dstFactor: "one", operation: "add" }
    });
    this.finalPipeline = fullscreen("final", finalModule, "fsFinal", gfx.format, "auto");
    this.sceneWorldBG = device.createBindGroup({
      label: "scene-world-bg",
      layout: sceneLayout,
      entries: [
        { binding: 0, resource: { buffer: this.frameWorldBuf } },
        { binding: 1, resource: this.shadowView },
        { binding: 2, resource: this.shadowSampler }
      ]
    });
    this.sceneVmBG = device.createBindGroup({
      label: "scene-vm-bg",
      layout: sceneLayout,
      entries: [
        { binding: 0, resource: { buffer: this.frameVmBuf } },
        { binding: 1, resource: this.shadowView },
        { binding: 2, resource: this.shadowSampler }
      ]
    });
    this.shadowBG = device.createBindGroup({
      label: "shadow-bg",
      layout: shadowLayout,
      entries: [{ binding: 0, resource: { buffer: this.frameWorldBuf } }]
    });
    this.instanceBG = device.createBindGroup({
      label: "instances-bg",
      layout: instanceLayout,
      entries: [{ binding: 0, resource: { buffer: this.instanceBuf } }]
    });
    this.fxBG = device.createBindGroup({
      label: "fx-bg",
      layout: fxLayout,
      entries: [
        { binding: 0, resource: { buffer: this.fxFrameBuf } },
        { binding: 1, resource: { buffer: this.segmentBuf } }
      ]
    });
    this.setShadowBounds([-20, -1, -20], [20, 6, 20]);
  }
  setShadowBounds(min: number[], max: number[]) {
    const c = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    const r = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2 + 1;
    const kd = this.lighting.keyDir;
    const kl = Math.hypot(kd[0], kd[1], kd[2]) || 1;
    const eye = [c[0] + kd[0] / kl * r * 2, c[1] + kd[1] / kl * r * 2, c[2] + kd[2] / kl * r * 2];
    const up = Math.abs(kd[1] / kl) > 0.95 ? [0, 0, 1] : [0, 1, 0];
    mat4.lookAt(eye, c, up, this.lightView);
    mat4.ortho(-r, r, -r, r, 0.1, r * 4, this.lightProj);
    mat4.multiply(this.lightProj, this.lightView, this.lightViewProj);
  }
  drawMesh(mesh: Mesh, model: Matrix, color: number[] = WHITE, emissive: number = 0, layer: "opaque"|"glass"|"viewmodel" = "opaque", flash: number = 0, extraY: number = 1, highlight: number = 0) {
    const layerBuckets = this.buckets[layer];
    let bucket = layerBuckets.get(mesh);
    if (!bucket) {
      bucket = { mesh, data: new Float32Array(INSTANCE_FLOATS * 64), count: 0 };
      layerBuckets.set(mesh, bucket);
    }
    if ((bucket.count + 1) * INSTANCE_FLOATS > bucket.data.length) {
      const grown = new Float32Array(bucket.data.length * 2);
      grown.set(bucket.data);
      bucket.data = grown;
    }
    const d = bucket.data;
    const o = bucket.count * INSTANCE_FLOATS;
    d.set(model, o);
    d[o + 16] = color[0];
    d[o + 17] = color[1];
    d[o + 18] = color[2];
    d[o + 19] = emissive;
    d[o + 20] = flash;
    d[o + 21] = extraY;
    d[o + 22] = highlight;
    d[o + 23] = 0;
    bucket.count++;
  }
  drawSegment(p0: number[], p1: number[], width: number, color: number[], tailBright: number = 1, softness: number = 1.5) {
    if (this.segmentCount >= MAX_SEGMENTS) {
      if (!this.warnedSegments)
        console.warn("[gfx] MAX_SEGMENTS exceeded");
      this.warnedSegments = true;
      return;
    }
    const d = this.segmentStaging;
    const o = this.segmentCount * SEGMENT_FLOATS;
    d[o] = p0[0];
    d[o + 1] = p0[1];
    d[o + 2] = p0[2];
    d[o + 3] = width;
    d[o + 4] = p1[0];
    d[o + 5] = p1[1];
    d[o + 6] = p1[2];
    d[o + 7] = tailBright;
    d[o + 8] = color[0];
    d[o + 9] = color[1];
    d[o + 10] = color[2];
    d[o + 11] = softness;
    this.segmentCount++;
  }
  clearQueue() {
    for (const layer of LAYERS)
      for (const b of this.buckets[layer].values())
        b.count = 0;
    this.segmentCount = 0;
  }
  render(camera: Camera, vmCamera: Camera, post: ReturnType<typeof defaultPostParams>, time: number) {
    const device = this.device;
    const colorTexture = this.gfx.context.getCurrentTexture();
    const t = this.ensureTargets(colorTexture.width, colorTexture.height);
    const shadowsOn = this.quality !== "low";
    const bloomOn = this.quality !== "low" && post.bloomStrength > 0;
    this.packInstances();
    this.writeFrame(this.frameWorldBuf, camera, t, shadowsOn, 0, post.freeze, time);
    this.writeFrame(this.frameVmBuf, vmCamera, t, shadowsOn, 0.5, post.freeze, time);
    this.writeFxFrame(camera);
    this.writePost(camera, t, post, time, bloomOn);
    if (this.segmentCount > 0) {
      device.queue.writeBuffer(this.segmentBuf, 0, this.segmentStaging.buffer, 0, this.segmentCount * SEGMENT_FLOATS * 4);
    }
    const encoder = device.createCommandEncoder({ label: "frame" });
    let drawCalls = 0;
    {
      const pass = encoder.beginRenderPass({
        label: "shadow",
        colorAttachments: [],
        depthStencilAttachment: { view: this.shadowView, depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "store" }
      });
      if (shadowsOn) {
        pass.setPipeline(this.shadowPipeline);
        pass.setBindGroup(0, this.shadowBG);
        pass.setBindGroup(1, this.instanceBG);
        drawCalls += this.drawBatches(pass, this.batches.opaque);
        drawCalls += this.drawBatches(pass, this.batches.glass);
      }
      pass.end();
    }
    const fog = this.lighting.fogColor;
    const hdrView = t.hdr.createView();
    const normalView = t.normal.createView();
    const depthView = t.depth.createView();
    {
      const pass = encoder.beginRenderPass({
        label: "opaque",
        colorAttachments: [
          { view: hdrView, clearValue: { r: fog[0], g: fog[1], b: fog[2], a: 1 }, loadOp: "clear", storeOp: "store" },
          { view: normalView, clearValue: { r: 0, g: 1, b: 0, a: 0 }, loadOp: "clear", storeOp: "store" }
        ],
        depthStencilAttachment: { view: depthView, depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "store" }
      });
      pass.setPipeline(this.scenePipeline);
      pass.setBindGroup(0, this.sceneWorldBG);
      pass.setBindGroup(1, this.instanceBG);
      drawCalls += this.drawBatches(pass, this.batches.opaque);
      pass.end();
    }
    if (this.batches.glass.length > 0) {
      encoder.copyTextureToTexture({ texture: t.hdr }, { texture: t.hdrCopy }, [t.width, t.height]);
      const pass = encoder.beginRenderPass({
        label: "glass",
        colorAttachments: [
          { view: hdrView, loadOp: "load", storeOp: "store" },
          { view: normalView, loadOp: "load", storeOp: "store" }
        ],
        depthStencilAttachment: { view: depthView, depthLoadOp: "load", depthStoreOp: "store" }
      });
      pass.setPipeline(this.glassPipeline);
      pass.setBindGroup(0, t.glassBG);
      pass.setBindGroup(1, this.instanceBG);
      drawCalls += this.drawBatches(pass, this.batches.glass);
      pass.end();
    }
    if (this.segmentCount > 0) {
      const pass = encoder.beginRenderPass({
        label: "fx",
        colorAttachments: [{ view: hdrView, loadOp: "load", storeOp: "store" }],
        depthStencilAttachment: { view: depthView, depthLoadOp: "load", depthStoreOp: "store" }
      });
      pass.setPipeline(this.fxPipeline);
      pass.setBindGroup(0, this.fxBG);
      pass.draw(6, this.segmentCount);
      drawCalls++;
      pass.end();
    }
    if (this.batches.viewmodel.length > 0) {
      const pass = encoder.beginRenderPass({
        label: "viewmodel",
        colorAttachments: [
          { view: hdrView, loadOp: "load", storeOp: "store" },
          { view: normalView, loadOp: "load", storeOp: "store" }
        ],
        depthStencilAttachment: { view: depthView, depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "store" }
      });
      pass.setPipeline(this.scenePipeline);
      pass.setBindGroup(0, this.sceneVmBG);
      pass.setBindGroup(1, this.instanceBG);
      drawCalls += this.drawBatches(pass, this.batches.viewmodel);
      pass.end();
    }
    {
      const pass = encoder.beginRenderPass({
        label: "outline",
        colorAttachments: [{ view: t.comp.createView(), loadOp: "clear", clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: "store" }]
      });
      pass.setPipeline(this.outlinePipeline);
      pass.setBindGroup(0, t.outlineBG);
      pass.draw(3);
      pass.end();
    }
    const levels = t.bloomViews.length;
    if (bloomOn) {
      this.fullscreenPass(encoder, "bloom-prefilter", t.bloomViews[0], this.prefilterPipeline, t.prefilterBG, "clear");
      for (let i = 0; i < levels - 1; i++) {
        this.fullscreenPass(encoder, `bloom-down-${i + 1}`, t.bloomViews[i + 1], this.downPipeline, t.downBGs[i], "clear");
      }
      for (let i = levels - 2; i >= 0; i--) {
        this.fullscreenPass(encoder, `bloom-up-${i}`, t.bloomViews[i], this.upPipeline, t.upBGs[i], "load");
      }
    } else {
      const pass = encoder.beginRenderPass({
        label: "bloom-clear",
        colorAttachments: [{ view: t.bloomViews[0], loadOp: "clear", clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: "store" }]
      });
      pass.end();
    }
    {
      const pass = encoder.beginRenderPass({
        label: "final",
        colorAttachments: [{ view: colorTexture.createView(), loadOp: "clear", clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: "store" }]
      });
      pass.setPipeline(this.finalPipeline);
      pass.setBindGroup(0, t.finalBG);
      pass.draw(3);
      pass.end();
    }
    device.queue.submit([encoder.finish()]);
    this.lastDrawCalls = drawCalls;
    this.lastSegments = this.segmentCount;
    this.segmentCount = 0;
    for (const layer of LAYERS)
      for (const b of this.buckets[layer].values())
        b.count = 0;
  }
  module(label: string, code: string) {
    const m2 = this.device.createShaderModule({ label, code });
    m2.getCompilationInfo().then((info) => {
      for (const msg of info.messages) {
        const log = msg.type === "error" ? console.error : console.warn;
        log(`[gfx] ${label} ${msg.type} at ${msg.lineNum}:${msg.linePos}: ${msg.message}`);
      }
    });
    return m2;
  }
  fullscreenPass(encoder: GPUCommandEncoder, label: string, view: GPUTextureView, pipeline: GPURenderPipeline, bindGroup: GPUBindGroup, loadOp: GPULoadOp) {
    const pass = encoder.beginRenderPass({
      label,
      colorAttachments: [{ view, loadOp, clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: "store" }]
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
  }
  drawBatches(pass: GPURenderPassEncoder, batches: Batch[]) {
    for (const b of batches) {
      pass.setVertexBuffer(0, b.mesh.vertexBuffer);
      pass.setIndexBuffer(b.mesh.indexBuffer, "uint32");
      pass.drawIndexed(b.mesh.indexCount, b.count, 0, 0, b.first);
    }
    return batches.length;
  }
  packInstances() {
    let cursor = 0;
    for (const layer of LAYERS) {
      const list = this.batches[layer];
      list.length = 0;
      for (const bucket of this.buckets[layer].values()) {
        if (bucket.count === 0)
          continue;
        let count = bucket.count;
        if (cursor + count > MAX_INSTANCES) {
          if (!this.warnedInstances)
            console.warn("[gfx] MAX_INSTANCES exceeded, instances dropped");
          this.warnedInstances = true;
          count = MAX_INSTANCES - cursor;
          if (count <= 0)
            continue;
        }
        this.instanceStaging.set(bucket.data.subarray(0, count * INSTANCE_FLOATS), cursor * INSTANCE_FLOATS);
        list.push({ mesh: bucket.mesh, first: cursor, count });
        cursor += count;
      }
    }
    this.lastInstances = cursor;
    if (cursor > 0) {
      this.device.queue.writeBuffer(this.instanceBuf, 0, this.instanceStaging.buffer, 0, cursor * INSTANCE_FLOATS * 4);
    }
  }
  writeFrame(buf: GPUBuffer, cam: Camera, t: RenderTargets, shadowsOn: boolean, mask: number, freeze: number, time: number) {
    const d = this.frameData;
    const l = this.lighting;
    const v = cam.view;
    d.set(cam.viewProj, 0);
    d.set(this.lightViewProj, 16);
    const put = (o: number, x: number, y: number, z: number, w: number) => {
      d[o] = x;
      d[o + 1] = y;
      d[o + 2] = z;
      d[o + 3] = w;
    };
    put(32, cam.position[0], cam.position[1], cam.position[2], time);
    put(36, v[0], v[4], v[8], 0);
    put(40, v[1], v[5], v[9], 0);
    put(44, l.keyDir[0], l.keyDir[1], l.keyDir[2], 0);
    put(48, l.keyColor[0], l.keyColor[1], l.keyColor[2], 0);
    put(52, l.fillDir[0], l.fillDir[1], l.fillDir[2], 0);
    put(56, l.fillColor[0], l.fillColor[1], l.fillColor[2], 0);
    put(60, l.ambientSky[0], l.ambientSky[1], l.ambientSky[2], 0);
    put(64, l.ambientGround[0], l.ambientGround[1], l.ambientGround[2], 0);
    put(68, l.fogColor[0], l.fogColor[1], l.fogColor[2], l.fogDensity);
    put(72, t.width, t.height, 1 / t.width, 1 / t.height);
    put(76, shadowsOn ? 1 : 0, mask, 1 / SHADOW_SIZE, freeze);
    this.device.queue.writeBuffer(buf, 0, d);
  }
  writeFxFrame(cam: Camera) {
    const d = this.fxFrameData;
    const v = cam.view;
    d.set(cam.viewProj, 0);
    d[16] = cam.position[0];
    d[17] = cam.position[1];
    d[18] = cam.position[2];
    d[19] = 1;
    d[20] = v[0];
    d[21] = v[4];
    d[22] = v[8];
    d[23] = 0;
    d[24] = v[1];
    d[25] = v[5];
    d[26] = v[9];
    d[27] = 0;
    this.device.queue.writeBuffer(this.fxFrameBuf, 0, d);
  }
  writePost(cam: Camera, t: RenderTargets, p: ReturnType<typeof defaultPostParams>, time: number, bloomOn: boolean) {
    const d = this.postData;
    d[0] = t.width;
    d[1] = t.height;
    d[2] = 1 / t.width;
    d[3] = 1 / t.height;
    d[4] = cam.near;
    d[5] = cam.far;
    d[6] = time;
    d[7] = p.outline;
    d[8] = p.freeze;
    d[9] = p.desaturation;
    d[10] = p.aberration;
    d[11] = p.grain;
    d[12] = p.vignette;
    d[13] = bloomOn ? p.bloomStrength : 0;
    d[14] = p.exposure;
    d[15] = p.bloomThreshold;
    d[16] = p.flash[0];
    d[17] = p.flash[1];
    d[18] = p.flash[2];
    d[19] = p.flash[3];
    d[20] = p.threat;
    d[21] = p.threatPulseRate;
    d[22] = 0;
    d[23] = 0;
    this.device.queue.writeBuffer(this.postBuf, 0, d);
  }
  ensureTargets(width: number, height: number): Targets {
    const cur = this.targets;
    if (cur && cur.width === width && cur.height === height)
      return cur;
    if (cur) {
      cur.hdr.destroy();
      cur.hdrCopy.destroy();
      cur.normal.destroy();
      cur.depth.destroy();
      cur.comp.destroy();
      cur.bloom.destroy();
    }
    const device = this.device;
    const RT = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
    const tex = (label: string, format: GPUTextureFormat, usage: number, w: number = width, h: number = height, mips: number = 1) => device.createTexture({ label, size: [w, h], format, usage, mipLevelCount: mips });
    const hdr = tex("hdr", HDR_FORMAT, RT | GPUTextureUsage.COPY_SRC);
    const hdrCopy = tex("hdr-copy", HDR_FORMAT, GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST);
    const normal = tex("normal-mask", HDR_FORMAT, RT);
    const depth = tex("depth", DEPTH_FORMAT, RT);
    const comp = tex("comp", HDR_FORMAT, RT);
    const bw = Math.max(1, Math.floor(width / 2));
    const bh = Math.max(1, Math.floor(height / 2));
    const maxLevels = Math.max(1, Math.floor(Math.log2(Math.min(bw, bh))) - 1);
    const levels = Math.min(BLOOM_LEVELS, maxLevels);
    const bloom = tex("bloom", HDR_FORMAT, RT, bw, bh, levels);
    const bloomViews = [];
    for (let i = 0; i < levels; i++)
      bloomViews.push(bloom.createView({ baseMipLevel: i, mipLevelCount: 1 }));
    const glassBG = device.createBindGroup({
      label: "glass-bg",
      layout: this.glassLayout,
      entries: [
        { binding: 0, resource: { buffer: this.frameWorldBuf } },
        { binding: 1, resource: hdrCopy.createView() },
        { binding: 2, resource: this.linearSampler }
      ]
    });
    const outlineBG = device.createBindGroup({
      label: "outline-bg",
      layout: this.outlinePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.postBuf } },
        { binding: 1, resource: hdr.createView() },
        { binding: 2, resource: normal.createView() },
        { binding: 3, resource: depth.createView() }
      ]
    });
    const bloomBG = (label: string, view: GPUTextureView) => device.createBindGroup({
      label,
      layout: this.bloomLayout,
      entries: [
        { binding: 0, resource: { buffer: this.postBuf } },
        { binding: 1, resource: view },
        { binding: 2, resource: this.linearSampler }
      ]
    });
    const prefilterBG = bloomBG("bloom-prefilter-bg", comp.createView());
    const downBGs = [];
    const upBGs = [];
    for (let i = 0; i < levels - 1; i++) {
      downBGs.push(bloomBG(`bloom-down-bg-${i}`, bloomViews[i]));
      upBGs.push(bloomBG(`bloom-up-bg-${i}`, bloomViews[i + 1]));
    }
    const finalBG = device.createBindGroup({
      label: "final-bg",
      layout: this.finalPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.postBuf } },
        { binding: 1, resource: comp.createView() },
        { binding: 2, resource: bloomViews[0] },
        { binding: 3, resource: normal.createView() },
        { binding: 4, resource: this.linearSampler }
      ]
    });
    this.targets = {
      hdr,
      hdrCopy,
      normal,
      depth,
      comp,
      bloom,
      bloomViews,
      glassBG,
      outlineBG,
      finalBG,
      prefilterBG,
      downBGs,
      upBGs,
      width,
      height
    };
    return this.targets;
  }
};
var WHITE = [1, 1, 1];

export { BLOOM_LEVELS,defaultPostParams,DEPTH_FORMAT,FRAME_FLOATS,FX_FRAME_FLOATS,HDR_FORMAT,INSTANCE_FLOATS,LAYERS,MAX_INSTANCES,MAX_SEGMENTS,POST_FLOATS,Renderer,SEGMENT_FLOATS,SHADOW_SIZE,WHITE };
