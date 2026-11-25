type NumericSetting = { [K in keyof Settings]: Settings[K] extends number ? K : never }[keyof Settings];
type BooleanSetting = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];
import { ACT_NAMES } from "../levels/levels";
import type { Hud,Level,Results,Save,Settings,UiHandlers } from "../types";
var fmtTime = (s: number) => {
  const m2 = Math.floor(s / 60);
  const sec = s - m2 * 60;
  return `${m2}:${sec.toFixed(2).padStart(5, "0")}`;
};
class Ui {
  handlers;
  save;
  levels;
  root;
  screenEl;
  hudEl;
  cardEl;
  crosshair;
  ammoEl;
  itemEl;
  hintEl;
  infoEl;
  lockEl;
  screen = "none";
  settingsReturn = "title";
  cardTimer = 0;
  cardWords: string[] = [];
  cardIndex = 0;
  cardWordTime = 0.32;
  cardOnDone: (()=>void) | null = null;
  lastAmmoKey = "";
  constructor(handlers: UiHandlers, save: Save, levels: Level[]) {
    this.handlers = handlers;
    this.save = save;
    this.levels = levels;
    const root = document.createElement("div");
    root.id = "ui";
    document.body.appendChild(root);
    this.root = root;
    root.innerHTML = `
      <div class="hud" hidden>
        <div class="crosshair"><span></span></div>
        <div class="hud-info"></div>
        <div class="hud-item"></div>
        <div class="hud-ammo"></div>
        <div class="hud-hint"></div>
      </div>
      <div class="card" hidden></div>
      <div class="lock-hint" hidden>CLICK TO CONTINUE</div>
      <div class="screen" hidden></div>`;
    this.hudEl = root.querySelector<HTMLElement>(".hud")!;
    this.crosshair = root.querySelector<HTMLElement>(".crosshair")!;
    this.ammoEl = root.querySelector<HTMLElement>(".hud-ammo")!;
    this.itemEl = root.querySelector<HTMLElement>(".hud-item")!;
    this.hintEl = root.querySelector<HTMLElement>(".hud-hint")!;
    this.infoEl = root.querySelector<HTMLElement>(".hud-info")!;
    this.cardEl = root.querySelector<HTMLElement>(".card")!;
    this.screenEl = root.querySelector<HTMLElement>(".screen")!;
    this.lockEl = root.querySelector<HTMLElement>(".lock-hint")!;
  }
  setSave(save: Save) {
    this.save = save;
  }
  get currentScreen() {
    return this.screen;
  }
  get blocking() {
    return this.screen !== "none" && this.screen !== "replay";
  }
  showLockHint(show: boolean) {
    this.lockEl.hidden = !show;
  }
  titleCard(words: string[], wordTime: number = 0.32, onDone?: (()=>void)) {
    this.cardWords = words;
    this.cardIndex = 0;
    this.cardTimer = 0;
    this.cardWordTime = wordTime;
    this.cardOnDone = onDone ?? null;
    this.cardEl.hidden = words.length === 0;
    this.renderCardWord();
  }
  get cardActive() {
    return !this.cardEl.hidden;
  }
  hideCard() {
    this.cardEl.hidden = true;
    this.cardWords = [];
    this.cardOnDone = null;
  }
  renderCardWord() {
    const w = this.cardWords[this.cardIndex];
    if (w === void 0)
      return;
    this.cardEl.textContent = w;
    this.cardEl.classList.toggle("alt", this.cardIndex % 2 === 1);
    this.cardEl.classList.remove("pop");
    void this.cardEl.offsetWidth;
    this.cardEl.classList.add("pop");
  }
  update(realDt: number) {
    if (this.cardEl.hidden || this.cardWords.length === 0)
      return;
    this.cardTimer += realDt;
    if (this.cardTimer >= this.cardWordTime) {
      this.cardTimer = 0;
      this.cardIndex++;
      if (this.cardIndex >= this.cardWords.length) {
        this.cardEl.hidden = true;
        const cb = this.cardOnDone;
        this.cardOnDone = null;
        this.cardWords = [];
        cb?.();
        return;
      }
      this.renderCardWord();
    }
  }
  updateHud(h: Hud) {
    this.hudEl.hidden = !h.visible;
    if (!h.visible)
      return;
    const s = (0.6 + 0.6 * (1 - h.timeScale)) * h.crosshairScale;
    this.crosshair.style.transform = `translate(-50%, -50%) scale(${s.toFixed(3)}) rotate(${(h.timeScale * 45).toFixed(1)}deg)`;
    this.crosshair.style.opacity = (0.55 + 0.45 * (1 - h.timeScale)).toFixed(2);
    this.itemEl.textContent = h.itemName ?? "";
    const key = `${h.ammo}/${h.maxAmmo}`;
    if (key !== this.lastAmmoKey) {
      this.lastAmmoKey = key;
      this.ammoEl.innerHTML = "";
      for (let i = 0; i < h.maxAmmo; i++) {
        const tick = document.createElement("i");
        if (i >= h.ammo)
          tick.className = "spent";
        this.ammoEl.appendChild(tick);
      }
    }
    this.hintEl.textContent = h.hint ?? "";
    this.infoEl.textContent = `${h.levelName}   ${h.remaining > 0 ? `${h.remaining} LEFT` : ""}`;
  }
  hideScreen() {
    this.screen = "none";
    this.screenEl.hidden = true;
    this.screenEl.innerHTML = "";
  }
  showTitle() {
    this.screen = "title";
    const next = this.firstUnclearedIndex();
    this.screenEl.hidden = false;
    this.screenEl.className = "screen title";
    this.screenEl.innerHTML = `
      <h1 class="logo">STILL<span>FRAME</span></h1>
      <p class="tagline">time moves only when you move</p>
      <div class="menu">
        <button data-act="play">${next > 0 ? "CONTINUE" : "PLAY"}</button>
        <button data-act="levels">LEVELS</button>
        <button data-act="settings">SETTINGS</button>
      </div>
      <div class="controls">
        <span><b>WASD</b> move</span><span><b>MOUSE</b> look</span><span><b>LMB</b> fire / punch / throw</span>
        <span><b>RMB</b> throw</span><span><b>E</b> pick up</span><span><b>SPACE</b> jump</span><span><b>R</b> restart</span><span><b>ESC</b> pause</span>
      </div>`;
    this.bind({
      play: () => this.handlers.onPlayLevel(next),
      levels: () => this.showLevels(),
      settings: () => this.showSettings("title")
    });
  }
  showLevels() {
    this.screen = "levels";
    this.screenEl.hidden = false;
    this.screenEl.className = "screen levels";
    const acts = [];
    for (const act of [1, 2, 3]) {
      const items = this.levels.map((l, i) => ({ l, i })).filter(({ l }) => l.act === act).map(({ l, i }) => {
        const unlocked = this.isUnlocked(i);
        const rec = this.save.levels[l.id];
        const best = rec?.best !== void 0 ? fmtTime(rec.best) : unlocked ? "—" : "LOCKED";
        return `<button data-level="${i}" ${unlocked ? "" : "disabled"} class="${rec?.cleared ? "cleared" : ""}">
            <em>${l.id}</em><strong>${l.name}</strong><small>${best}</small></button>`;
      }).join("");
      acts.push(`<section><h2>ACT ${act} · ${ACT_NAMES[act]}</h2><div class="grid">${items}</div></section>`);
    }
    this.screenEl.innerHTML = `<h1 class="heading">LEVELS</h1>${acts.join("")}<div class="menu"><button data-act="back">BACK</button></div>`;
    this.screenEl.querySelectorAll<HTMLButtonElement>("button[data-level]").forEach((b) => {
      b.addEventListener("click", () => {
        this.handlers.onUiSound();
        this.handlers.onPlayLevel(Number(b.dataset.level));
      });
    });
    this.bind({ back: () => this.showTitle() });
  }
  showSettings(returnTo: string) {
    this.settingsReturn = returnTo;
    this.screen = "settings";
    this.screenEl.hidden = false;
    this.screenEl.className = "screen settings";
    const s = this.save.settings;
    const range = (key: NumericSetting, label: string, min: number, max: number, step: number, fmt: (v:number)=>string) => `<label><span>${label}</span><input type="range" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${s[key]}"><output>${fmt(s[key])}</output></label>`;
    const check = (key: keyof Settings, label: string) => `<label class="check"><span>${label}</span><input type="checkbox" data-key="${key}" ${s[key] ? "checked" : ""}></label>`;
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    this.screenEl.innerHTML = `
      <h1 class="heading">SETTINGS</h1>
      <div class="form">
        ${range("fov", "Field of view", 70, 110, 1, (v) => `${v}°`)}
        ${range("sensitivity", "Mouse sensitivity", 0.2, 3, 0.05, (v) => v.toFixed(2))}
        ${check("invertY", "Invert Y")}
        ${range("masterVolume", "Master volume", 0, 1, 0.05, pct)}
        ${range("sfxVolume", "Effects volume", 0, 1, 0.05, pct)}
        ${range("musicVolume", "Music volume", 0, 1, 0.05, pct)}
        ${range("resolutionScale", "Resolution scale", 0.5, 1, 0.05, pct)}
        ${check("autoResolution", "Automatic resolution")}
        <label><span>Post effects</span><select data-key="postQuality">
          ${["low", "medium", "high"].map((q) => `<option value="${q}" ${s.postQuality === q ? "selected" : ""}>${q.toUpperCase()}</option>`).join("")}
        </select></label>
        ${range("crosshairScale", "Crosshair size", 0.5, 2, 0.05, pct)}
        ${check("reduceMotion", "Reduce motion (no aberration, grain, bob)")}
        ${check("showFps", "Show FPS")}
      </div>
      <div class="menu"><button data-act="back">BACK</button></div>`;
    const apply = () => this.handlers.onSettingsChanged({ ...this.save.settings });
    this.screenEl.querySelectorAll<HTMLInputElement>("input[type=range]").forEach((el) => {
      el.addEventListener("input", () => {
        const key = el.dataset.key as NumericSetting;
        const v = Number(el.value);
        this.save.settings[key] = v;
        const out = el.nextElementSibling;
        if (out)
          out.textContent = key === "fov" ? `${v}°` : key === "sensitivity" ? v.toFixed(2) : pct(v);
        apply();
      });
    });
    this.screenEl.querySelectorAll<HTMLInputElement>("input[type=checkbox]").forEach((el) => {
      el.addEventListener("change", () => {
        this.save.settings[el.dataset.key as BooleanSetting] = el.checked;
        apply();
      });
    });
    this.screenEl.querySelectorAll<HTMLSelectElement>("select").forEach((el) => {
      el.addEventListener("change", () => {
        this.save.settings[el.dataset.key as "postQuality"] = el.value;
        apply();
      });
    });
    this.bind({
      back: () => {
        if (this.settingsReturn === "pause")
          this.showPause();
        else
          this.showTitle();
      }
    });
  }
  showPause() {
    this.screen = "pause";
    this.screenEl.hidden = false;
    this.screenEl.className = "screen pause";
    this.screenEl.innerHTML = `
      <h1 class="heading">PAUSED</h1>
      <div class="menu">
        <button data-act="resume">RESUME</button>
        <button data-act="restart">RESTART</button>
        <button data-act="settings">SETTINGS</button>
        <button data-act="menu">MAIN MENU</button>
      </div>`;
    this.bind({
      resume: () => this.handlers.onResume(),
      restart: () => this.handlers.onRestart(),
      settings: () => this.showSettings("pause"),
      menu: () => this.handlers.onMenu()
    });
  }
  showResults(r: Results) {
    this.screen = "results";
    this.screenEl.hidden = false;
    this.screenEl.className = "screen results";
    const acc = r.shots > 0 ? `${Math.round(Math.min(r.kills, r.shots) / r.shots * 100)}%` : "—";
    this.screenEl.innerHTML = `
      <h1 class="heading">${r.level.name}<small>CLEARED</small></h1>
      <table class="stats">
        <tr><th>REAL TIME</th><td>${fmtTime(r.realTime)}${r.newBest ? " <b>NEW BEST</b>" : ""}</td></tr>
        <tr><th>BEST</th><td>${r.best !== void 0 ? fmtTime(r.best) : "—"}</td></tr>
        <tr><th>TIME THAT PASSED</th><td>${fmtTime(r.simTime)}</td></tr>
        <tr><th>KILLS</th><td>${r.kills}</td></tr>
        <tr><th>SHOTS</th><td>${r.shots} <small>(${acc})</small></td></tr>
      </table>
      <div class="menu">
        ${r.hasNext ? '<button data-act="next">NEXT LEVEL</button>' : '<button data-act="menu">THE END</button>'}
        <button data-act="replay">WATCH REPLAY</button>
        <button data-act="retry">RETRY</button>
        ${r.hasNext ? '<button data-act="menu">MAIN MENU</button>' : ""}
      </div>`;
    this.bind({
      next: () => this.handlers.onNext(),
      replay: () => this.handlers.onReplay(),
      retry: () => this.handlers.onRestart(),
      menu: () => this.handlers.onMenu()
    });
  }
  showReplayBar() {
    this.screen = "replay";
    this.screenEl.hidden = false;
    this.screenEl.className = "screen replay";
    this.screenEl.innerHTML = `<div class="replay-label">REPLAY <span>REAL TIME</span></div><div class="replay-skip">click or press any key to skip</div><div class="replay-progress"><i></i></div>`;
    this.screenEl.addEventListener("click", this.skipReplay, { once: true });
  }
  setReplayProgress(p: number) {
    const bar = this.screenEl.querySelector<HTMLElement>(".replay-progress i");
    if (bar)
      bar.style.width = `${(p * 100).toFixed(1)}%`;
  }
  skipReplay = () => {
    if (this.screen === "replay")
      this.handlers.onSkipReplay();
  };
  bind(actions: Record<string,()=>void>) {
    this.screenEl.querySelectorAll<HTMLButtonElement>("button[data-act]").forEach((b) => {
      const fn = actions[b.dataset.act!];
      if (!fn)
        return;
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this.handlers.onUiSound();
        fn();
      });
    });
  }
  isUnlocked(index: number) {
    if (index < 0)
      return true;
    const prev = this.levels[index - 1];
    return !!prev && !!this.save.levels[prev.id]?.cleared;
  }
  firstUnclearedIndex() {
    for (let i = 0; i < this.levels.length; i++) {
      if (!this.save.levels[this.levels[i].id]?.cleared)
        return i;
    }
    return 0;
  }
  get rootElement() {
    return this.root;
  }
};

export { fmtTime,Ui };
