import type { Save } from "../types";
var KEY = "stillframe.save";
function defaultSettings() {
  return {
    fov: 90,
    sensitivity: 1,
    invertY: false,
    masterVolume: 0.8,
    sfxVolume: 1,
    musicVolume: 0.5,
    resolutionScale: 1,
    autoResolution: true,
    postQuality: "high",
    showFps: false,
    reduceMotion: false,
    crosshairScale: 1
  };
}
function loadSave(): Save {
  const fresh = { version: 1, settings: defaultSettings(), levels: {} };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw)
      return fresh;
    const parsed = JSON.parse(raw) as Save;
    if (parsed.version !== 1)
      return fresh;
    return {
      version: 1,
      settings: { ...defaultSettings(), ...parsed.settings ?? {} },
      levels: parsed.levels ?? {}
    };
  } catch (err) {
    console.warn("[save] could not read save data:", err);
    return fresh;
  }
}
function writeSave(data: Save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (err) {
    console.warn("[save] could not write save data:", err);
  }
}

export { defaultSettings,KEY,loadSave,writeSave };
