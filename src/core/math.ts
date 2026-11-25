var v3 = (x: number = 0, y: number = 0, z: number = 0) => [x, y, z];
function set(o: number[], x: number, y: number, z: number) {
  o[0] = x;
  o[1] = y;
  o[2] = z;
  return o;
}
function copy(o: number[], a: number[]) {
  o[0] = a[0];
  o[1] = a[1];
  o[2] = a[2];
  return o;
}
function scale(o: number[], a: number[], s: number) {
  o[0] = a[0] * s;
  o[1] = a[1] * s;
  o[2] = a[2] * s;
  return o;
}
function lerp(o: number[], a: number[], b: number[], t: number) {
  o[0] = a[0] + (b[0] - a[0]) * t;
  o[1] = a[1] + (b[1] - a[1]) * t;
  o[2] = a[2] + (b[2] - a[2]) * t;
  return o;
}
var dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
var lenSq = (a: number[]) => a[0] * a[0] + a[1] * a[1] + a[2] * a[2];
var len = (a: number[]) => Math.sqrt(lenSq(a));
function distSq(a: number[], b: number[]) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}
function distXZ(a: number[], b: number[]) {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}
function normalize(o: number[], a: number[]) {
  const l = len(a);
  if (l < 1e-9)
    return set(o, 0, 0, 0);
  return scale(o, a, 1 / l);
}
var clamp = (x: number, lo: number, hi: number) => x < lo ? lo : x > hi ? hi : x;
var lerpN = (a: number, b: number, t: number) => a + (b - a) * t;
function approach(current: number, target: number, tau: number, dt: number) {
  if (tau <= 0)
    return target;
  return target + (current - target) * Math.exp(-dt / tau);
}
function angleDiff(a: number, b: number) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI)
    d -= Math.PI * 2;
  if (d < -Math.PI)
    d += Math.PI * 2;
  return d;
}
function lerpAngle(a: number, b: number, t: number) {
  return a + angleDiff(b, a) * t;
}
function turnToward(a: number, b: number, maxStep: number) {
  const d = angleDiff(b, a);
  if (Math.abs(d) <= maxStep)
    return b;
  return a + Math.sign(d) * maxStep;
}
function yawOf(dx: number, dz: number) {
  return Math.atan2(-dx, -dz);
}
function dirFromYawPitch(o: number[], yaw: number, pitch: number) {
  const cp = Math.cos(pitch);
  return set(o, -Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
}

export { angleDiff,approach,clamp,copy,dirFromYawPitch,distSq,distXZ,dot,len,lenSq,lerp,lerpAngle,lerpN,normalize,scale,set,turnToward,v3,yawOf };
