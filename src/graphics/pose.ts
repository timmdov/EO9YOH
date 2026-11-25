import { mat4 } from "wgpu-matrix";
import type { Matrix,Pose,PoseInput } from "../types";
import { PART_IDS } from "./library";
function createPose() {
  const parts: Record<string,Matrix> = {};
  for (const id of PART_IDS)
    parts[id] = mat4.create();
  return { parts, weapon: mat4.create() };
}
var tmp = mat4.create();
function computePose(p: PoseInput, out: Pose) {
  const P = out.parts;
  const move = p.moveBlend;
  const ph = p.walkPhase;
  const s = Math.sin(ph);
  const runScale = p.kind === "rusher" ? 1.5 : 1;
  const spawnScale = 0.3 + 0.7 * easeOut(p.spawnT);
  const root = mat4.translation([p.pos[0], p.pos[1], p.pos[2]]);
  mat4.rotateY(root, p.yaw, root);
  mat4.uniformScale(root, spawnScale, root);
  const bob = Math.abs(Math.cos(ph)) * 0.05 * move * runScale;
  const hipY = 0.92 + bob - p.stun * 0.05;
  mat4.translate(root, [0, hipY, 0], P.pelvis);
  mat4.rotateY(P.pelvis, s * 0.12 * move, P.pelvis);
  const lean = -0.1 * move * runScale - (p.attackT > 0 ? Math.sin(p.attackT * Math.PI) * 0.35 : 0) + p.stun * (0.25 + Math.sin(ph * 3) * 0.1);
  mat4.translate(P.pelvis, [0, 0.08, 0], P.torso);
  mat4.rotateX(P.torso, lean, P.torso);
  mat4.rotateY(P.torso, -s * 0.1 * move, P.torso);
  mat4.translate(P.torso, [0, 0.56, 0], P.head);
  mat4.rotateX(P.head, p.aimPitch * 0.5 - lean * 0.5, P.head);
  const swing = s * 0.5 * move * runScale;
  const aimAngle = Math.PI / 2 + p.aimPitch;
  const strike = p.attackT > 0 ? Math.sin(Math.min(1, p.attackT * 1.3) * Math.PI) : 0;
  let rUpper = lerp2(-swing, aimAngle, p.aimBlend);
  let rElbow = lerp2(0.35 + Math.max(0, swing) * 0.4, 0.05, p.aimBlend);
  if (p.attackT > 0) {
    rUpper = lerp2(rUpper, Math.PI / 2 + 0.2, strike);
    rElbow = lerp2(rElbow, 0, strike);
  }
  mat4.translate(P.torso, [0.25, 0.5, 0], P.upperArmR);
  mat4.rotateX(P.upperArmR, rUpper - p.stun * 0.6, P.upperArmR);
  mat4.rotateZ(P.upperArmR, 0.12 - p.aimBlend * 0.1, P.upperArmR);
  mat4.translate(P.upperArmR, [0, -0.3, 0], P.lowerArmR);
  mat4.rotateX(P.lowerArmR, rElbow, P.lowerArmR);
  const support = p.twoHanded ? p.aimBlend : 0;
  const lUpper = lerp2(swing, aimAngle - 0.25, support);
  const lElbow = lerp2(0.35 + Math.max(0, -swing) * 0.4, 0.5, support);
  mat4.translate(P.torso, [-0.25, 0.5, 0], P.upperArmL);
  mat4.rotateX(P.upperArmL, lUpper - p.stun * 0.6, P.upperArmL);
  mat4.rotateZ(P.upperArmL, -0.12 + support * 0, P.upperArmL);
  mat4.rotateY(P.upperArmL, -support * 0.5, P.upperArmL);
  mat4.translate(P.upperArmL, [0, -0.3, 0], P.lowerArmL);
  mat4.rotateX(P.lowerArmL, lElbow, P.lowerArmL);
  const legSwing = s * 0.55 * move * runScale;
  const kneeR = 0.08 + Math.max(0, -Math.sin(ph - 0.6)) * 0.9 * move;
  const kneeL = 0.08 + Math.max(0, Math.sin(ph - 0.6)) * 0.9 * move;
  mat4.translate(P.pelvis, [0.1, -0.05, 0], P.upperLegR);
  mat4.rotateX(P.upperLegR, legSwing + p.stun * 0.15, P.upperLegR);
  mat4.translate(P.upperLegR, [0, -0.42, 0], P.lowerLegR);
  mat4.rotateX(P.lowerLegR, -kneeR, P.lowerLegR);
  mat4.translate(P.pelvis, [-0.1, -0.05, 0], P.upperLegL);
  mat4.rotateX(P.upperLegL, -legSwing + p.stun * 0.15, P.upperLegL);
  mat4.translate(P.upperLegL, [0, -0.42, 0], P.lowerLegL);
  mat4.rotateX(P.lowerLegL, -kneeL, P.lowerLegL);
  mat4.translate(P.lowerArmR, [0, -0.3, 0], tmp);
  mat4.rotateX(tmp, -Math.PI / 2, out.weapon);
  return out;
}
function lerp2(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function easeOut(t: number) {
  const c = Math.min(1, Math.max(0, t));
  return 1 - (1 - c) * (1 - c);
}

export { computePose,createPose,easeOut,lerp2,tmp };
