import { mat4 } from "wgpu-matrix";
import { approach,clamp } from "../core/math";
import type { ItemKind,Matrix,MeshLibrary,Player } from "../types";
import type { Renderer } from "./renderer";
var GLOVE2 = [1, 1, 1];
class Viewmodel {
  swayX = 0;
  swayY = 0;
  bobAmount = 0;
  cam = mat4.create();
  m = mat4.create();
  hand = mat4.create();
  update(realDt: number, mouseDx: number, mouseDy: number, planarSpeed: number, grounded: boolean) {
    this.swayX = approach(this.swayX, clamp(-mouseDx * 9e-4, -0.05, 0.05), 0.08, realDt);
    this.swayY = approach(this.swayY, clamp(mouseDy * 9e-4, -0.05, 0.05), 0.08, realDt);
    this.bobAmount = approach(this.bobAmount, grounded ? clamp(planarSpeed / 4, 0, 1) : 0, 0.1, realDt);
  }
  draw(renderer: Renderer, meshes: MeshLibrary, eye: number[], yaw: number, pitch: number, p: Player, stride: number, reduceMotion: boolean) {
    const cam = this.cam;
    mat4.translation([eye[0], eye[1], eye[2]], cam);
    mat4.rotateY(cam, yaw, cam);
    mat4.rotateX(cam, pitch, cam);
    const bobScale = reduceMotion ? 0.3 : 1;
    const bobX = Math.sin(stride * 2.2) * 0.012 * this.bobAmount * bobScale;
    const bobY = -Math.abs(Math.cos(stride * 2.2)) * 0.012 * this.bobAmount * bobScale;
    const sx = this.swayX * bobScale + bobX;
    const sy = this.swayY * bobScale + bobY;
    const pickup = p.pickupAge < 0.2 ? 1 - p.pickupAge / 0.2 : 0;
    const throwT = p.throwAge < 0.3 ? p.throwAge / 0.3 : -1;
    const held = p.held;
    if (!held) {
      for (const side of [1, -1]) {
        const punching = p.punchSide === side && p.punchAge < 0.24;
        const t = punching ? p.punchAge / 0.24 : 0;
        const ext = punching ? Math.sin(t * Math.PI) : 0;
        const x = 0.2 * side + sx - ext * 0.12 * side;
        let y = -0.2 + sy + ext * 0.07;
        let z = -0.4 - ext * 0.32;
        if (throwT >= 0 && side === 1) {
          const k = Math.sin(throwT * Math.PI);
          z -= k * 0.25;
          y += k * 0.08;
        }
        y -= pickup * 0.15;
        this.drawArm(renderer, meshes, x, y, z, side, ext);
      }
      return;
    }
    const kind = held.kind;
    const recoilScale = kind === "scatter" ? 1.6 : kind === "carbine" ? 0.7 : 1;
    const recoil = Math.exp(-p.recoilAge * 14) * recoilScale;
    const hx = 0.19 + sx;
    let hy = -0.2 + sy - pickup * 0.2;
    let hz = -0.38 + recoil * 0.07;
    if (throwT >= 0) {
      const k = Math.sin(throwT * Math.PI);
      hz -= k * 0.25;
      hy += k * 0.1;
    }
    const hand = this.hand;
    mat4.translate(cam, [hx, hy, hz], hand);
    mat4.rotateX(hand, recoil * 0.22, hand);
    if (kind === "blade") {
      const slash = p.slashAge < 0.25 ? p.slashAge / 0.25 : -1;
      if (slash >= 0) {
        const k = Math.sin(slash * Math.PI);
        mat4.translate(hand, [-k * 0.25, k * 0.05, -k * 0.15], hand);
        mat4.rotateY(hand, 0.9 - slash * 1.8, hand);
        mat4.rotateZ(hand, -k * 0.9, hand);
      } else {
        mat4.rotateY(hand, 0.25, hand);
        mat4.rotateX(hand, 0.55, hand);
      }
    }
    this.drawItem(renderer, meshes, kind, hand);
    this.drawFistAt(renderer, meshes, hand);
    this.drawArmFromHand(renderer, meshes, hand);
    if (kind === "scatter" || kind === "carbine") {
      mat4.translate(hand, [-0.03, -0.04, -0.3], this.m);
      this.drawFistAt(renderer, meshes, this.m);
    }
  }
  drawItem(renderer: Renderer, meshes: MeshLibrary, kind: ItemKind, hand: Matrix) {
    const m2 = this.m;
    switch (kind) {
      case "pistol":
        mat4.translate(hand, [0, 0.045, -0.03], m2);
        break;
      case "scatter":
        mat4.translate(hand, [0, 0.05, -0.12], m2);
        break;
      case "carbine":
        mat4.translate(hand, [0, 0.06, -0.08], m2);
        break;
      case "blade":
        mat4.translate(hand, [0, 0.02, -0.1], m2);
        break;
      default:
        mat4.translate(hand, [0, 0.07, -0.04], m2);
    }
    renderer.drawMesh(meshes.items[kind], m2, [1, 1, 1], 0.08, "viewmodel");
  }
  drawArm(renderer: Renderer, meshes: MeshLibrary, x: number, y: number, z: number, side: number, ext: number) {
    const m2 = this.hand;
    mat4.translate(this.cam, [x, y, z], m2);
    mat4.rotateY(m2, side * 0.12 - ext * 0.1 * side, m2);
    mat4.rotateX(m2, 0.15 + ext * 0.1, m2);
    this.drawFistAt(renderer, meshes, m2);
    this.drawArmFromHand(renderer, meshes, m2);
  }
  drawFistAt(renderer: Renderer, meshes: MeshLibrary, m2: Matrix) {
    renderer.drawMesh(meshes.fist, m2, GLOVE2, 0, "viewmodel");
  }
  drawArmFromHand(renderer: Renderer, meshes: MeshLibrary, hand: Matrix) {
    const fa = mat4.translate(hand, [0, -0.01, 0.04]);
    mat4.rotateX(fa, Math.PI / 2 - 0.15, fa);
    renderer.drawMesh(meshes.forearm, fa, GLOVE2, 0, "viewmodel");
  }
};

export { GLOVE2,Viewmodel };
