import { StaticWorld } from "../physics/collision";
import { NavGrid } from "../physics/navigation";
import type { Level } from "../types";
import { MeshBuilder,THEMES } from "./geometry";
function buildLevelMesh(device: GPUDevice, def: Level) {
  const scene = buildLevelScene(device, def);
  const boxes = def.boxes.filter((b) => b.collide).map((b) => ({ min: [b.min[0], b.min[1], b.min[2]], max: [b.max[0], b.max[1], b.max[2]], navFloor: b.navFloor }));
  const st = new StaticWorld(boxes);
  const nav = new NavGrid(st);
  return { scene, shared: { static: st, nav } };
}
function buildLevelScene(device: GPUDevice, def: Level) {
  const theme = THEMES[def.theme];
  const b = new MeshBuilder();
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const box of def.boxes) {
    const mat = theme.materials[box.mat!];
    b.addBoxMinMax(box.min, box.max, mat.color, mat.emissive);
    if (box.collide) {
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], box.min[k]);
        max[k] = Math.max(max[k], box.max[k]);
      }
    }
  }
  if (!Number.isFinite(min[0])) {
    min[0] = min[1] = min[2] = -10;
    max[0] = max[1] = max[2] = 10;
  }
  min[1] = Math.max(min[1], -1);
  max[1] = Math.min(max[1], 8);
  return { mesh: b.build(device, `level-${def.id}`), min, max };
}

export { buildLevelMesh,buildLevelScene };
