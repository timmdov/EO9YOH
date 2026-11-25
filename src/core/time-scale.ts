import { approach,clamp } from "./math";
class TimeScaleDriver {
  static MIN = 0.015;
  static LOOK_WEIGHT = 0.35;
  static LOOK_FULL = 900;
  static KICK_TIME = 0.12;
  static RISE = 0.05;
  static FALL = 0.1;
  value = TimeScaleDriver.MIN;
  kick = 0;
  reset() {
    this.value = TimeScaleDriver.MIN;
    this.kick = 0;
  }
  actionKick() {
    this.kick = TimeScaleDriver.KICK_TIME;
  }
  update(realDt: number, planarSpeed: number, maxSpeed: number, lookSpeed: number, airborne: boolean, busy: boolean) {
    this.kick = Math.max(0, this.kick - realDt);
    const moveInput = clamp(planarSpeed / maxSpeed, 0, 1);
    const lookInput = clamp(lookSpeed / TimeScaleDriver.LOOK_FULL, 0, 1) * TimeScaleDriver.LOOK_WEIGHT;
    const kickInput = this.kick > 0 || busy ? 1 : 0;
    let target = Math.max(moveInput, lookInput, kickInput);
    if (airborne)
      target = Math.max(target, 0.8);
    target = Math.max(target, TimeScaleDriver.MIN);
    const tau = target > this.value ? TimeScaleDriver.RISE : TimeScaleDriver.FALL;
    this.value = clamp(approach(this.value, target, tau, realDt), TimeScaleDriver.MIN, 1);
    return this.value;
  }
};

export { TimeScaleDriver };
