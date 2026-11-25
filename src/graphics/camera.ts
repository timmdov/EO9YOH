import { mat4,vec3 } from "wgpu-matrix";
var MAX_PITCH = Math.PI / 2 - 1e-3;
class Camera {
  position = [0, 1.6, 0];
  yaw = 0;
  pitch = 0;
  fovYDeg = 70;
  near = 0.05;
  far = 200;
  aspect = 16 / 9;
  view = mat4.create();
  projection = mat4.create();
  viewProj = mat4.create();
  target = vec3.create();
  setHorizontalFov(hDeg: number) {
    const h = hDeg * Math.PI / 180;
    this.fovYDeg = 2 * Math.atan(Math.tan(h / 2) / this.aspect) * 180 / Math.PI;
  }
  rotate(dYaw: number, dPitch: number) {
    this.yaw = (this.yaw + dYaw) % (Math.PI * 2);
    this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch + dPitch));
  }
  forward(out: Float32Array = vec3.create()) {
    const cp = Math.cos(this.pitch);
    return vec3.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp, out);
  }
  forwardFlat(out: Float32Array = vec3.create()) {
    return vec3.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw), out);
  }
  right(out: Float32Array = vec3.create()) {
    return vec3.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw), out);
  }
  update() {
    const f = this.forward();
    vec3.add(this.position, f, this.target);
    mat4.lookAt(this.position, this.target, [0, 1, 0], this.view);
    mat4.perspective(this.fovYDeg * Math.PI / 180, this.aspect, this.near, this.far, this.projection);
    mat4.multiply(this.projection, this.view, this.viewProj);
  }
};

export { Camera,MAX_PITCH };
