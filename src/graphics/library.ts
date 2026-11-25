import { Rng } from "../core/random";
import { MeshBuilder,srgbHex } from "./geometry";
import type { Mesh } from "./mesh";
var PART_IDS = [
  "pelvis",
  "torso",
  "head",
  "upperArmL",
  "lowerArmL",
  "upperArmR",
  "lowerArmR",
  "upperLegL",
  "lowerLegL",
  "upperLegR",
  "lowerLegR"
];
var PART_EXTENTS: Record<string,number[]> = {
  pelvis: [0.17, 0.08, 0.1],
  torso: [0.22, 0.28, 0.12],
  head: [0.12, 0.14, 0.12],
  upperArmL: [0.06, 0.15, 0.06],
  lowerArmL: [0.05, 0.15, 0.05],
  upperArmR: [0.06, 0.15, 0.06],
  lowerArmR: [0.05, 0.15, 0.05],
  upperLegL: [0.08, 0.21, 0.08],
  lowerLegL: [0.07, 0.21, 0.07],
  upperLegR: [0.08, 0.21, 0.08],
  lowerLegR: [0.07, 0.21, 0.07]
};
var PART_CENTER: Record<string,number[]> = {
  pelvis: [0, 0, 0],
  torso: [0, 0.28, 0],
  head: [0, 0.14, 0],
  upperArmL: [0, -0.15, 0],
  lowerArmL: [0, -0.15, 0],
  upperArmR: [0, -0.15, 0],
  lowerArmR: [0, -0.15, 0],
  upperLegL: [0, -0.21, 0],
  lowerLegL: [0, -0.21, 0],
  upperLegR: [0, -0.21, 0],
  lowerLegR: [0, -0.21, 0]
};
var WHITE2 = srgbHex(16052714);
var OFFWHITE = srgbHex(14276044);
var DARK = srgbHex(2763310);
var GLASS = srgbHex(16777215);
var GLOVE = srgbHex(1842208);
var GLOVE_DARK = srgbHex(1184276);
function buildMeshLibrary(device: GPUDevice) {
  const part = (fn: (b:MeshBuilder)=>void, label: string) => {
    const b = new MeshBuilder();
    fn(b);
    return b.build(device, label);
  };
  const parts: Record<string,Mesh> = {
    pelvis: part((b: MeshBuilder) => b.addTaperedBox(0, 0, -0.08, 0.08, 0.26, 0.18, 0.34, 0.2, GLASS, 0.6), "pelvis"),
    torso: part((b: MeshBuilder) => {
      b.addTaperedBox(0, 0, 0, 0.3, 0.32, 0.2, 0.44, 0.24, GLASS, 0.9);
      b.addTaperedBox(0, 0, 0.3, 0.56, 0.44, 0.24, 0.3, 0.18, GLASS, 0.9);
    }, "torso"),
    head: part((b: MeshBuilder) => {
      b.addTaperedBox(0, 0, 0, 0.06, 0.08, 0.08, 0.1, 0.1, GLASS, 0.5);
      b.addTaperedBox(0, 0.01, 0.06, 0.2, 0.15, 0.17, 0.22, 0.22, GLASS, 1.2);
      b.addTaperedBox(0, 0.01, 0.2, 0.3, 0.22, 0.22, 0.14, 0.15, GLASS, 1.2);
    }, "head"),
    upperArmL: part((b: MeshBuilder) => b.addTaperedBox(0, 0, 0, -0.3, 0.12, 0.12, 0.09, 0.09, GLASS, 0.7), "upperArm"),
    lowerArmL: part((b: MeshBuilder) => {
      b.addTaperedBox(0, 0, 0, -0.26, 0.09, 0.09, 0.07, 0.07, GLASS, 0.7);
      b.addBox([0, -0.29, 0], [0.09, 0.08, 0.09], GLASS, 0.9);
    }, "lowerArm"),
    upperArmR: part((b: MeshBuilder) => b.addTaperedBox(0, 0, 0, -0.3, 0.12, 0.12, 0.09, 0.09, GLASS, 0.7), "upperArmR"),
    lowerArmR: part((b: MeshBuilder) => {
      b.addTaperedBox(0, 0, 0, -0.26, 0.09, 0.09, 0.07, 0.07, GLASS, 0.7);
      b.addBox([0, -0.29, 0], [0.09, 0.08, 0.09], GLASS, 0.9);
    }, "lowerArmR"),
    upperLegL: part((b: MeshBuilder) => b.addTaperedBox(0, 0, 0, -0.42, 0.17, 0.17, 0.12, 0.12, GLASS, 0.6), "upperLeg"),
    lowerLegL: part((b: MeshBuilder) => {
      b.addTaperedBox(0, 0, 0, -0.4, 0.12, 0.12, 0.09, 0.09, GLASS, 0.6);
      b.addBox([0, -0.43, -0.04], [0.1, 0.06, 0.2], GLASS, 0.6);
    }, "lowerLeg"),
    upperLegR: part((b: MeshBuilder) => b.addTaperedBox(0, 0, 0, -0.42, 0.17, 0.17, 0.12, 0.12, GLASS, 0.6), "upperLegR"),
    lowerLegR: part((b: MeshBuilder) => {
      b.addTaperedBox(0, 0, 0, -0.4, 0.12, 0.12, 0.09, 0.09, GLASS, 0.6);
      b.addBox([0, -0.43, -0.04], [0.1, 0.06, 0.2], GLASS, 0.6);
    }, "lowerLegR")
  };
  const items = {
    pistol: part((b: MeshBuilder) => {
      b.addBox([0, 0.03, -0.04], [0.04, 0.045, 0.21], WHITE2);
      b.addBox([0, -0.04, 0.03], [0.036, 0.11, 0.05], OFFWHITE);
      b.addBox([0, -0.012, -0.015], [0.012, 0.03, 0.035], DARK);
    }, "pistol"),
    scatter: part((b: MeshBuilder) => {
      b.addBox([0, 0.02, -0.2], [0.05, 0.05, 0.6], WHITE2);
      b.addBox([0, -0.01, -0.22], [0.055, 0.04, 0.16], OFFWHITE);
      b.addBox([0, -0.02, 0.17], [0.05, 0.09, 0.26], WHITE2);
      b.addBox([0, -0.06, 0.06], [0.035, 0.08, 0.04], OFFWHITE);
    }, "scatter"),
    carbine: part((b: MeshBuilder) => {
      b.addBox([0, 0.02, -0.08], [0.05, 0.08, 0.36], WHITE2);
      b.addBox([0, 0.03, -0.33], [0.025, 0.025, 0.18], OFFWHITE);
      b.addBox([0, -0.07, -0.06], [0.035, 0.12, 0.05], OFFWHITE);
      b.addBox([0, -0.05, 0.05], [0.035, 0.09, 0.04], WHITE2);
      b.addBox([0, 0, 0.2], [0.045, 0.09, 0.2], WHITE2);
      b.addBox([0, 0.075, -0.05], [0.02, 0.025, 0.12], DARK);
    }, "carbine"),
    blade: part((b: MeshBuilder) => {
      b.addBox([0, 0, 0.1], [0.035, 0.035, 0.2], DARK);
      b.addBox([0, 0, -5e-3], [0.11, 0.02, 0.03], OFFWHITE);
      b.addBox([0, 0, -0.38], [0.012, 0.045, 0.72], WHITE2, 0.2);
    }, "blade"),
    bottle: part((b: MeshBuilder) => {
      b.addBox([0, -0.02, 0], [0.075, 0.18, 0.075], WHITE2);
      b.addTaperedBox(0, 0, 0.07, 0.12, 0.075, 0.075, 0.03, 0.03, WHITE2);
      b.addBox([0, 0.15, 0], [0.03, 0.06, 0.03], OFFWHITE);
    }, "bottle"),
    brick: part((b: MeshBuilder) => b.addBox([0, 0, 0], [0.21, 0.065, 0.1], OFFWHITE), "brick"),
    mug: part((b: MeshBuilder) => {
      b.addBox([0, 0, 0], [0.09, 0.1, 0.09], WHITE2);
      b.addBox([0.06, 0, 0], [0.03, 0.06, 0.02], WHITE2);
    }, "mug")
  };
  const rng = new Rng(4242);
  const shards = [];
  for (let i = 0; i < 6; i++) {
    const s = rng.range(0.6, 1);
    const p = () => [rng.sym(0.06) * s, rng.sym(0.06) * s, rng.sym(0.06) * s];
    const a = [0, 0.07 * s, 0];
    const bb = [-0.06 * s, -0.04 * s, 0.05 * s];
    const c = [0.06 * s, -0.04 * s, 0.05 * s];
    const d = [0, -0.04 * s, -0.07 * s];
    const j = p();
    const jitter = (v: number[]) => [v[0] + j[0] * 0.4, v[1] + j[1] * 0.4, v[2] + j[2] * 0.4];
    const ja = jitter(a);
    const b = new MeshBuilder();
    b.addTri(ja, bb, c, GLASS, 1);
    b.addTri(ja, c, d, GLASS, 1);
    b.addTri(ja, d, bb, GLASS, 1);
    b.addTri(bb, d, c, GLASS, 1);
    shards.push(b.build(device, `shard-${i}`));
  }
  const fist = part((b: MeshBuilder) => {
    b.addBox([0, 0, 0], [0.09, 0.09, 0.1], GLOVE);
    b.addBox([0, 0.025, -0.055], [0.085, 0.035, 0.02], GLOVE_DARK);
  }, "fist");
  const forearm = part((b: MeshBuilder) => b.addTaperedBox(0, 0, 0, 0.36, 0.08, 0.08, 0.1, 0.1, GLOVE), "forearm");
  const spawnRing = part((b: MeshBuilder) => {
    for (let i = 0; i < 8; i++) {
      const a0 = i / 8 * Math.PI * 2;
      b.addBox([Math.cos(a0) * 0.45, 0.01, Math.sin(a0) * 0.45], [0.12, 0.02, 0.12], GLASS, 2);
    }
  }, "spawn-ring");
  return { parts, items, shards, fist, forearm, spawnRing };
}

export { buildMeshLibrary,DARK,GLASS,GLOVE,GLOVE_DARK,OFFWHITE,PART_CENTER,PART_EXTENTS,PART_IDS,WHITE2 };
