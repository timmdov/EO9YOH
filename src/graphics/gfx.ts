var UnsupportedError = class extends Error {
};
class Gfx {
  device;
  context;
  canvas;
  format;
  width = 0;
  height = 0;
  resolutionScale = 1;
  cssPixelWidth = 1;
  cssPixelHeight = 1;
  resizeListeners: ((width:number,height:number)=>void)[] = [];
  observer: ResizeObserver | null = null;
  constructor(canvas: HTMLCanvasElement, device: GPUDevice, context: GPUCanvasContext, format: GPUTextureFormat) {
    this.canvas = canvas;
    this.device = device;
    this.context = context;
    this.format = format;
  }
  static async create(canvas: HTMLCanvasElement, onDeviceLost: (info:GPUDeviceLostInfo)=>void) {
    if (!("gpu" in navigator) || !navigator.gpu) {
      throw new UnsupportedError("navigator.gpu is not available.");
    }
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) {
      throw new UnsupportedError("No suitable GPU adapter was found.");
    }
    const device = await adapter.requestDevice({ label: "stillframe-device" });
    device.lost.then((info2) => {
      console.error(`[gfx] device lost (${info2.reason}): ${info2.message}`);
      onDeviceLost(info2);
    });
    device.addEventListener("uncapturederror", (ev) => {
      console.error("[gfx] uncaptured WebGPU error:", ev.error.message);
    });
    const context = canvas.getContext("webgpu");
    if (!context) {
      throw new UnsupportedError("Could not create a WebGPU canvas context.");
    }
    const format = navigator.gpu.getPreferredCanvasFormat();
    const gfx = new Gfx(canvas, device, context, format);
    gfx.configure();
    const dpr = window.devicePixelRatio || 1;
    gfx.cssPixelWidth = Math.max(1, Math.round(canvas.clientWidth * dpr));
    gfx.cssPixelHeight = Math.max(1, Math.round(canvas.clientHeight * dpr));
    gfx.applySize();
    gfx.observeResize();
    const info = adapter.info;
    console.info(`[gfx] adapter: ${info.vendor} ${info.architecture} ${info.description}, format: ${format}`);
    return gfx;
  }
  onResize(listener: (width:number,height:number)=>void) {
    this.resizeListeners.push(listener);
  }
  setResolutionScale(scale2: number) {
    const clamped = Math.min(1, Math.max(0.25, scale2));
    if (clamped === this.resolutionScale)
      return;
    this.resolutionScale = clamped;
    this.applySize();
  }
  getResolutionScale() {
    return this.resolutionScale;
  }
  get aspect() {
    return this.width / Math.max(1, this.height);
  }
  destroy() {
    this.observer?.disconnect();
    this.device.destroy();
  }
  configure() {
    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: "opaque"
    });
  }
  observeResize() {
    this.observer = new ResizeObserver((entries: ResizeObserverEntry[]) => {
      const entry = entries[0];
      if (!entry)
        return;
      const box = entry.devicePixelContentBoxSize?.[0];
      if (box) {
        this.cssPixelWidth = box.inlineSize;
        this.cssPixelHeight = box.blockSize;
      } else {
        const css = entry.contentBoxSize[0];
        const dpr = window.devicePixelRatio || 1;
        this.cssPixelWidth = Math.round((css?.inlineSize ?? 1) * dpr);
        this.cssPixelHeight = Math.round((css?.blockSize ?? 1) * dpr);
      }
      this.applySize();
    });
    try {
      this.observer.observe(this.canvas, { box: "device-pixel-content-box" });
    } catch {
      this.observer.observe(this.canvas, { box: "content-box" });
    }
  }
  applySize() {
    const maxDim = this.device.limits.maxTextureDimension2D;
    const w = Math.max(1, Math.min(maxDim, Math.round(this.cssPixelWidth * this.resolutionScale)));
    const h = Math.max(1, Math.min(maxDim, Math.round(this.cssPixelHeight * this.resolutionScale)));
    if (w === this.width && h === this.height)
      return;
    this.width = w;
    this.height = h;
    this.canvas.width = w;
    this.canvas.height = h;
    for (const listener of this.resizeListeners)
      listener(w, h);
  }
};
function showUnsupported(reason: string) {
  const panel = document.getElementById("unsupported");
  const reasonEl = document.getElementById("unsupported-reason");
  if (reasonEl)
    reasonEl.textContent = reason;
  if (panel)
    panel.hidden = false;
}

export { Gfx,showUnsupported,UnsupportedError };
