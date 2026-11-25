import type { Time } from "../core/time";
class DebugOverlay {
  el;
  visible = true;
  frames = 0;
  accum = 0;
  fps = 0;
  frameMs = 0;
  extra: Record<string,string> = {};
  constructor(el: HTMLElement) {
    this.el = el;
  }
  set(key: string, value: string) {
    this.extra[key] = value;
  }
  update(time: Time) {
    this.frames++;
    this.accum += time.realDt;
    if (this.accum < 0.25)
      return;
    this.fps = this.frames / this.accum;
    this.frameMs = this.accum / this.frames * 1e3;
    this.frames = 0;
    this.accum = 0;
    if (!this.visible) {
      this.el.textContent = "";
      return;
    }
    const lines = [
      `fps ${this.fps.toFixed(0)}  (${this.frameMs.toFixed(2)} ms)`,
      `timeScale ${time.effectiveScale().toFixed(3)}  lock ${time.lock}`,
      `sim steps/frame ${time.stepsThisFrame}  simTime ${time.simTime.toFixed(2)}s`,
      ...Object.entries(this.extra).map(([k, v]) => `${k} ${v}`)
    ];
    this.el.textContent = lines.join("\n");
  }
};

export { DebugOverlay };
