import type { AudioOptions } from "../types";
class AudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  sfxBus: GainNode | null = null;
  musicBus: GainNode | null = null;
  musicFilter: BiquadFilterNode | null = null;
  droneGain: GainNode | null = null;
  buffers: Map<string,AudioBuffer> = new Map();
  timeScale = 1;
  listener = { x: 0, y: 0, z: 0, yaw: 0 };
  volumes = { master: 0.8, sfx: 1, music: 0.5 };
  musicStarted = false;
  unlock() {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch (err) {
        console.warn("[audio] AudioContext unavailable:", err);
        return;
      }
      const ctx = this.ctx;
      this.master = ctx.createGain();
      this.master.connect(ctx.destination);
      this.sfxBus = ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musicFilter = ctx.createBiquadFilter();
      this.musicFilter.type = "lowpass";
      this.musicFilter.frequency.value = 2e3;
      this.musicBus = ctx.createGain();
      this.musicFilter.connect(this.musicBus);
      this.musicBus.connect(this.master);
      this.applyVolumes();
      this.synthesizeAll();
      this.startMusic();
    }
    if (this.ctx.state === "suspended")
      void this.ctx.resume();
  }
  setVolumes(master: number, sfx: number, music: number) {
    this.volumes = { master, sfx, music };
    this.applyVolumes();
  }
  setListener(l: {x:number;y:number;z:number;yaw:number}) {
    this.listener = l;
  }
  setTimeScale(ts: number) {
    this.timeScale = ts;
    const ctx = this.ctx;
    if (!ctx || !this.musicFilter || !this.droneGain)
      return;
    const now = ctx.currentTime;
    this.musicFilter.frequency.setTargetAtTime(180 + 3800 * ts * ts, now, 0.08);
    this.droneGain.gain.setTargetAtTime(ts < 0.1 ? 0.22 : 0, now, 0.25);
  }
  play(name: string, opts: AudioOptions = {}) {
    const ctx = this.ctx;
    const buf = this.buffers.get(name);
    if (!ctx || !buf || !this.sfxBus)
      return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const ts = opts.ignoreTime ? 1 : Math.max(0.25, Math.min(1, this.timeScale));
    src.playbackRate.value = ts * (opts.pitch ?? 1) * (0.94 + Math.random() * 0.12);
    const gain = ctx.createGain();
    let vol = opts.volume ?? 1;
    let pan = 0;
    if (opts.pos) {
      const l = this.listener;
      const dx = opts.pos[0] - l.x;
      const dy = opts.pos[1] - l.y;
      const dz = opts.pos[2] - l.z;
      const d = Math.hypot(dx, dy, dz);
      vol *= 1 / (1 + d * 0.12);
      const rx = Math.cos(l.yaw), rz = -Math.sin(l.yaw);
      pan = d > 0.01 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / d)) * 0.8 : 0;
    }
    gain.gain.value = vol;
    src.connect(gain);
    if (pan !== 0 && typeof ctx.createStereoPanner === "function") {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      gain.connect(p);
      p.connect(this.sfxBus);
    } else {
      gain.connect(this.sfxBus);
    }
    src.start();
  }
  applyVolumes() {
    if (!this.master || !this.sfxBus || !this.musicBus)
      return;
    this.master.gain.value = this.volumes.master;
    this.sfxBus.gain.value = this.volumes.sfx;
    this.musicBus.gain.value = this.volumes.music * 0.5;
  }
  startMusic() {
    const ctx = this.ctx;
    if (!ctx || !this.musicFilter || this.musicStarted)
      return;
    this.musicStarted = true;
    const now = ctx.currentTime;
    const notes = [55, 82.41, 110, 130.81, 164.81];
    for (let i = 0; i < notes.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = i % 2 ? "sawtooth" : "triangle";
      osc.frequency.value = notes[i];
      osc.detune.value = (i - 2) * 6;
      const g = ctx.createGain();
      g.gain.value = 0.05;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.05 + i * 0.013;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.03;
      lfo.connect(lfoGain);
      lfoGain.connect(g.gain);
      osc.connect(g);
      g.connect(this.musicFilter);
      osc.start(now);
      lfo.start(now);
    }
    const sr = ctx.sampleRate;
    const loopLen = Math.floor(sr * 1.5);
    const loop = ctx.createBuffer(1, loopLen, sr);
    const data = loop.getChannelData(0);
    for (const start of [0, 0.75]) {
      const s0 = Math.floor(start * sr);
      for (let i = 0; i < sr * 0.25 && s0 + i < loopLen; i++) {
        const t = i / sr;
        const f = 50 + 70 * Math.exp(-t * 30);
        data[s0 + i] += Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 14) * 0.5;
      }
    }
    const loopSrc = ctx.createBufferSource();
    loopSrc.buffer = loop;
    loopSrc.loop = true;
    const loopGain = ctx.createGain();
    loopGain.gain.value = 0.35;
    loopSrc.connect(loopGain);
    loopGain.connect(this.musicFilter);
    loopSrc.start(now);
    const drone = ctx.createOscillator();
    drone.type = "sine";
    drone.frequency.value = 41.2;
    const drone2 = ctx.createOscillator();
    drone2.type = "sine";
    drone2.frequency.value = 61.7;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0;
    drone.connect(this.droneGain);
    drone2.connect(this.droneGain);
    if (this.musicBus)
      this.droneGain.connect(this.musicBus);
    drone.start(now);
    drone2.start(now);
  }
  synthesizeAll() {
    const ctx = this.ctx;
    if (!ctx)
      return;
    const sr = ctx.sampleRate;
    for (const [name, fn] of Object.entries(SYNTHS)) {
      const samples = fn(sr);
      const buf = ctx.createBuffer(1, samples.length, sr);
      buf.copyToChannel(samples, 0);
      this.buffers.set(name, buf);
    }
  }
};
function make(sr: number, seconds: number, fn: (t:number,i:number)=>number) {
  const n = Math.max(1, Math.floor(sr * seconds));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++)
    out[i] = fn(i / sr, i);
  return out;
}
function noise() {
  return Math.random() * 2 - 1;
}
function lowpass(buf: Float32Array<ArrayBuffer>, sr: number, cutoff: number) {
  const a = Math.exp(-2 * Math.PI * cutoff / sr);
  let y = 0;
  for (let i = 0; i < buf.length; i++) {
    y = (1 - a) * buf[i] + a * y;
    buf[i] = y;
  }
  return buf;
}
function highpass(buf: Float32Array<ArrayBuffer>, sr: number, cutoff: number) {
  const a = Math.exp(-2 * Math.PI * cutoff / sr);
  let lp = 0;
  for (let i = 0; i < buf.length; i++) {
    lp = (1 - a) * buf[i] + a * lp;
    buf[i] = buf[i] - lp;
  }
  return buf;
}
function normalizeBuf(buf: Float32Array<ArrayBuffer>, peak: number = 0.9) {
  let m2 = 0;
  for (let i = 0; i < buf.length; i++)
    m2 = Math.max(m2, Math.abs(buf[i]));
  if (m2 > 0)
    for (let i = 0; i < buf.length; i++)
      buf[i] = buf[i] / m2 * peak;
  return buf;
}
function mix(...bufs: Float32Array<ArrayBuffer>[]) {
  const n = Math.max(...bufs.map((b) => b.length));
  const out = new Float32Array(n);
  for (const b of bufs)
    for (let i = 0; i < b.length; i++)
      out[i] += b[i];
  return out;
}
function gunshot(sr: number, body: number, decay: number, cutoff: number, peak: number) {
  const crack = make(sr, 0.5, (t) => noise() * Math.exp(-t * decay));
  lowpass(crack, sr, cutoff);
  const thump = make(sr, 0.4, (t) => Math.sin(2 * Math.PI * (body + 120 * Math.exp(-t * 40)) * t) * Math.exp(-t * 18) * 0.8);
  return normalizeBuf(mix(crack, thump), peak);
}
var SYNTHS = {
  pistol: (sr: number) => gunshot(sr, 70, 22, 3500, 0.9),
  scatter: (sr: number) => gunshot(sr, 50, 12, 2200, 1),
  carbine: (sr: number) => gunshot(sr, 80, 30, 4500, 0.8),
  enemyShot: (sr: number) => gunshot(sr, 60, 20, 2600, 0.7),
  shatter: (sr: number) => {
    const crash = highpass(make(sr, 1, (t) => noise() * Math.exp(-t * 6)), sr, 1800);
    const tinkles = make(sr, 1.2, (t) => {
      let v = 0;
      for (let k = 0; k < 7; k++) {
        const start = k * 0.07 + k * 37 % 11 * 0.01;
        if (t < start)
          continue;
        const tt = t - start;
        v += Math.sin(2 * Math.PI * (2400 + k * 530) * tt) * Math.exp(-tt * 18) * 0.4;
      }
      return v;
    });
    return normalizeBuf(mix(crash, tinkles), 0.95);
  },
  glassBreak: (sr: number) => {
    const crash = highpass(make(sr, 0.5, (t) => noise() * Math.exp(-t * 12)), sr, 2500);
    const ping = make(sr, 0.5, (t) => Math.sin(2 * Math.PI * 3200 * t) * Math.exp(-t * 20) * 0.5);
    return normalizeBuf(mix(crash, ping), 0.7);
  },
  punch: (sr: number) => {
    const body = make(sr, 0.25, (t) => Math.sin(2 * Math.PI * (60 + 140 * Math.exp(-t * 35)) * t) * Math.exp(-t * 20));
    const slap = lowpass(make(sr, 0.1, (t) => noise() * Math.exp(-t * 60)), sr, 2500);
    return normalizeBuf(mix(body, slap), 0.9);
  },
  punchMiss: (sr: number) => normalizeBuf(lowpass(make(sr, 0.25, (t) => noise() * Math.sin(Math.PI * Math.min(1, t / 0.25)) * 0.6), sr, 900), 0.35),
  whoosh: (sr: number) => normalizeBuf(lowpass(make(sr, 0.35, (t) => noise() * Math.sin(Math.PI * Math.min(1, t / 0.35))), sr, 1400), 0.5),
  impact: (sr: number) => {
    const click = lowpass(make(sr, 0.12, (t) => noise() * Math.exp(-t * 50)), sr, 5e3);
    const ring = make(sr, 0.2, (t) => Math.sin(2 * Math.PI * 1800 * t) * Math.exp(-t * 35) * 0.3);
    return normalizeBuf(mix(click, ring), 0.6);
  },
  propImpact: (sr: number) => normalizeBuf(lowpass(make(sr, 0.15, (t) => noise() * Math.exp(-t * 40)), sr, 1200), 0.5),
  pickup: (sr: number) => normalizeBuf(make(sr, 0.12, (t) => Math.sin(2 * Math.PI * (900 + t * 3e3) * t) * Math.exp(-t * 30) + noise() * 0.1 * Math.exp(-t * 80)), 0.4),
  dryFire: (sr: number) => normalizeBuf(highpass(make(sr, 0.05, (t) => noise() * Math.exp(-t * 120)), sr, 3e3), 0.4),
  clash: (sr: number) => {
    const ping = make(sr, 0.6, (t) => (Math.sin(2 * Math.PI * 2600 * t) + Math.sin(2 * Math.PI * 3900 * t) * 0.5) * Math.exp(-t * 9));
    return normalizeBuf(ping, 0.6);
  },
  slice: (sr: number) => normalizeBuf(highpass(make(sr, 0.3, (t) => noise() * Math.exp(-t * 14) + Math.sin(2 * Math.PI * 4200 * t) * Math.exp(-t * 25) * 0.6), sr, 2e3), 0.6),
  death: (sr: number) => {
    const low = make(sr, 1.4, (t) => Math.sin(2 * Math.PI * (90 * Math.exp(-t * 2)) * t) * Math.exp(-t * 2.5));
    const crash = highpass(make(sr, 1, (t) => noise() * Math.exp(-t * 5)), sr, 1200);
    return normalizeBuf(mix(low, crash), 0.9);
  },
  spawn: (sr: number) => normalizeBuf(make(sr, 0.7, (t) => Math.sin(2 * Math.PI * (300 + 900 * t) * t) * Math.sin(Math.PI * Math.min(1, t / 0.7)) * 0.5 + noise() * 0.05 * Math.exp(-t * 4)), 0.4),
  ui: (sr: number) => normalizeBuf(make(sr, 0.06, (t) => Math.sin(2 * Math.PI * 1400 * t) * Math.exp(-t * 60)), 0.3),
  clear: (sr: number) => normalizeBuf(make(sr, 1.2, (t) => [220, 277.18, 329.63, 440].reduce((a, f, k) => a + Math.sin(2 * Math.PI * f * t) * Math.exp(-Math.max(0, t - k * 0.06) * 3) * (t > k * 0.06 ? 1 : 0), 0)), 0.5),
  charge: (sr: number) => normalizeBuf(make(sr, 0.6, (t) => Math.sin(2 * Math.PI * (600 + 1600 * t) * t) * (t / 0.6) * 0.5), 0.3),
  melee: (sr: number) => normalizeBuf(lowpass(make(sr, 0.3, (t) => noise() * Math.sin(Math.PI * Math.min(1, t / 0.3))), sr, 700), 0.5)
};

export { AudioEngine,gunshot,highpass,lowpass,make,mix,noise,normalizeBuf,SYNTHS };
