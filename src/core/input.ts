var DEFAULT_BINDINGS = {
  moveForward: ["KeyW", "ArrowUp"],
  moveBack: ["KeyS", "ArrowDown"],
  moveLeft: ["KeyA", "ArrowLeft"],
  moveRight: ["KeyD", "ArrowRight"],
  jump: ["Space"],
  fire: ["Mouse0"],
  throw: ["Mouse2"],
  interact: ["KeyE"],
  restart: ["KeyR"],
  pause: ["Escape"],
  flyUp: ["Space"],
  flyDown: ["ShiftLeft", "ControlLeft"],
  debugToggleCamera: ["F1"],
  debugTimeFreeze: ["F2"],
  debugTimeRealtime: ["F3"],
  debugOverlay: ["F4"]
};
var GAMEPAD_DEADZONE = 0.15;
var GAMEPAD_LOOK_SPEED = 900;
var GAMEPAD_BUTTONS = {
  jump: [0],
  interact: [2],
  restart: [3],
  fire: [7],
  throw: [6],
  pause: [9]
};
class Input {
  target;
  mouseDx = 0;
  mouseDy = 0;
  padMoveX = 0;
  padMoveY = 0;
  bindings = structuredClone(DEFAULT_BINDINGS);
  down: Set<string> = new Set();
  pressedRaw: Set<string> = new Set();
  releasedRaw: Set<string> = new Set();
  pressedFrame: Set<string> = new Set();
  releasedFrame: Set<string> = new Set();
  accDx = 0;
  accDy = 0;
  padButtonsPrev: boolean[] = [];
  padActionsDown: Set<string> = new Set();
  padActionsPressed: Set<string> = new Set();
  constructor(target: HTMLCanvasElement) {
    this.target = target;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    target.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("mousemove", this.onMouseMove);
    target.addEventListener("contextmenu", (e: MouseEvent) => e.preventDefault());
    target.addEventListener("click", () => this.requestPointerLock());
  }
  get pointerLocked() {
    return document.pointerLockElement === this.target;
  }
  requestPointerLock() {
    if (this.pointerLocked)
      return;
    const req = this.target.requestPointerLock({ unadjustedMovement: true });
    req?.catch(() => {
      this.target.requestPointerLock()?.catch((err) => console.warn("[input] pointer lock failed:", err));
    });
  }
  update(realDt: number) {
    this.pressedFrame.clear();
    this.releasedFrame.clear();
    for (const c of this.pressedRaw)
      this.pressedFrame.add(c);
    for (const c of this.releasedRaw)
      this.releasedFrame.add(c);
    this.pressedRaw.clear();
    this.releasedRaw.clear();
    this.mouseDx = this.accDx;
    this.mouseDy = this.accDy;
    this.accDx = 0;
    this.accDy = 0;
    this.pollGamepad(realDt);
  }
  isDown(action: keyof typeof DEFAULT_BINDINGS) {
    if (this.padActionsDown.has(action))
      return true;
    return this.bindings[action].some((c) => this.down.has(c));
  }
  wasPressed(action: keyof typeof DEFAULT_BINDINGS) {
    if (this.padActionsPressed.has(action))
      return true;
    return this.bindings[action].some((c) => this.pressedFrame.has(c));
  }
  anyPressed() {
    return this.pressedFrame.size > 0 || this.padActionsPressed.size > 0;
  }
  wasReleased(action: keyof typeof DEFAULT_BINDINGS) {
    return this.bindings[action].some((c) => this.releasedFrame.has(c));
  }
  moveAxes() {
    let x = (this.isDown("moveRight") ? 1 : 0) - (this.isDown("moveLeft") ? 1 : 0) + this.padMoveX;
    let y = (this.isDown("moveForward") ? 1 : 0) - (this.isDown("moveBack") ? 1 : 0) + this.padMoveY;
    const len2 = Math.hypot(x, y);
    if (len2 > 1) {
      x /= len2;
      y /= len2;
    }
    return { x, y };
  }
  press(code: string) {
    if (this.down.has(code))
      return;
    this.down.add(code);
    this.pressedRaw.add(code);
  }
  release(code: string) {
    if (!this.down.has(code))
      return;
    this.down.delete(code);
    this.releasedRaw.add(code);
  }
  onKeyDown = (e: KeyboardEvent) => {
    if (e.code.startsWith("F") && e.code.length <= 3)
      e.preventDefault();
    if (e.code === "Space" || e.code === "Tab")
      e.preventDefault();
    this.press(e.code);
  };
  onKeyUp = (e: KeyboardEvent) => {
    this.release(e.code);
  };
  onMouseDown = (e: MouseEvent) => {
    this.press(`Mouse${e.button}`);
  };
  onMouseUp = (e: MouseEvent) => {
    this.release(`Mouse${e.button}`);
  };
  onMouseMove = (e: MouseEvent) => {
    if (!this.pointerLocked)
      return;
    this.accDx += e.movementX;
    this.accDy += e.movementY;
  };
  onBlur = () => {
    for (const c of [...this.down])
      this.release(c);
  };
  pollGamepad(realDt: number) {
    this.padMoveX = 0;
    this.padMoveY = 0;
    this.padActionsPressed.clear();
    const pads = navigator.getGamepads?.() ?? [];
    const pad = pads.find((p) => !!p && p.mapping === "standard");
    if (!pad) {
      this.padActionsDown.clear();
      return;
    }
    const dz = (v: number) => {
      const a = v ?? 0;
      return Math.abs(a) < GAMEPAD_DEADZONE ? 0 : (a - Math.sign(a) * GAMEPAD_DEADZONE) / (1 - GAMEPAD_DEADZONE);
    };
    this.padMoveX = dz(pad.axes[0]);
    this.padMoveY = -dz(pad.axes[1]);
    this.mouseDx += dz(pad.axes[2]) * GAMEPAD_LOOK_SPEED * realDt;
    this.mouseDy += dz(pad.axes[3]) * GAMEPAD_LOOK_SPEED * realDt;
    const nowDown = new Set<string>();
    for (const [action, buttons] of Object.entries(GAMEPAD_BUTTONS)) {
      for (const b of buttons) {
        const isDown = pad.buttons[b]?.pressed ?? false;
        if (isDown) {
          nowDown.add(action);
          if (!this.padButtonsPrev[b])
            this.padActionsPressed.add(action);
        }
      }
    }
    this.padButtonsPrev = pad.buttons.map((b) => b.pressed);
    this.padActionsDown = nowDown;
  }
};

export { DEFAULT_BINDINGS,GAMEPAD_BUTTONS,GAMEPAD_DEADZONE,GAMEPAD_LOOK_SPEED,Input };
