import type { mat4 } from 'wgpu-matrix';
import type { buildMeshLibrary } from './graphics/library';
import type { Mesh } from './graphics/mesh';
import type { StaticWorld } from './physics/collision';
import type { NavGrid } from './physics/navigation';
import type { defaultSettings } from './ui/save';
export type Vector = number[];
export type Matrix = ReturnType<typeof mat4.create>;
export type ItemKind = 'pistol'|'scatter'|'carbine'|'blade'|'bottle'|'brick'|'mug';
export type EnemyKind = 'walker'|'rusher'|'marksman';
export interface Item { kind: ItemKind; ammo: number }
export interface Box { min: number[]; max: number[]; mat?: string; collide?: boolean }
export interface Spawn { kind: EnemyKind; pos: number[]; yaw?: number; weapon?: ItemKind|null; idle?: boolean }
export interface Wave { when: {type: 'start'|'remaining'|'zone'|'time'; count?: number; rect?: number[]; seconds?: number}; delay?: number; spawns: Spawn[] }
export interface Level {id:string; name:string; act:number; theme:string; words:string[]; seed:number; player:{pos:number[];yaw:number;item?:ItemKind};props:{kind:ItemKind;pos:number[]}[];waves:Wave[];boxes:Box[];maxActive?:number;exit?:{rect:number[];requiresClear:boolean}}
export interface Frame {pos:number[];vel:number[];yaw:number;pitch:number;grounded:boolean;fire:boolean;throwItem:boolean;interact:boolean;steps:number}
export interface Enemy {id:number;kind:EnemyKind;alive:boolean;pos:number[];prevPos:number[];vel:number[];yaw:number;prevYaw:number;grounded:boolean;state:string;stateTime:number;hp:number;weapon:Item|null;fireCooldown:number;burstLeft:number;burstTimer:number;aimTimer:number;telegraph:number;lockedDir:number[];meleeT:number;prevMeleeT:number;meleeCooldown:number;stunTimer:number;path:number[][]|null;pathIndex:number;repathTimer:number;seesPlayer:boolean;walkPhase:number;prevWalkPhase:number;moveBlend:number;prevMoveBlend:number;aimBlend:number;prevAimBlend:number;aimPitch:number;hitFlash:number;spawnT:number;prevSpawnT:number;strafeSeed:number;targetPropId:number;lastShotId:number}
export interface Player {pos:number[];vel:number[];yaw:number;pitch:number;grounded:boolean;alive:boolean;invulnerable:boolean;held:Item|null;fireCooldown:number;burstLeft:number;burstTimer:number;punchCooldown:number;punchSide:number;punchAge:number;recoilAge:number;throwAge:number;slashAge:number;pickupAge:number}
export interface Prop {id:number;item:Item;pos:number[];prevPos:number[];vel:number[];rot:number[];prevRot:number[];angVel:number[];thrown:boolean;sleeping:boolean;restTimer:number;alive:boolean;claimedBy:number}
export interface Projectile {pos:number[];prevPos:number[];vel:number[];spawnPos:number[];ownerId:number;shotId:number;age:number;alive:boolean}
export type WorldEvent = {type:'shot';pos:number[];dir:number[];weapon:ItemKind;byPlayer:boolean}|{type:'impact';pos:number[];normal:number[]}|{type:'enemyDeath';enemy:Enemy;dir:number[];point:number[];silent:boolean}|{type:'enemyHit';pos:number[];dir:number[]}|{type:'playerDeath';dir:number[]}|{type:'bulletClash';pos:number[]}|{type:'slice';pos:number[];dir:number[]}|{type:'punch';hit:boolean;pos:number[]}|{type:'slash';hit:boolean}|{type:'throw'}|{type:'pickup';kind:ItemKind}|{type:'dryFire'}|{type:'itemBreak';pos:number[];kind:ItemKind}|{type:'propImpact';pos:number[];speed:number}|{type:'spawn'|'melee';pos:number[]}|{type:'telegraph'};
export interface SharedStatic {static:StaticWorld;nav:NavGrid}
export type MeshLibrary = ReturnType<typeof buildMeshLibrary>;
export interface Scene {mesh:Mesh;min:number[];max:number[]}
export interface Pose {parts:Record<string,Matrix>;weapon:Matrix}
export interface PoseInput {pos:number[];yaw:number;walkPhase:number;moveBlend:number;aimBlend:number;aimPitch:number;attackT:number;stun:number;spawnT:number;twoHanded:boolean;kind:EnemyKind}
export type Settings = ReturnType<typeof defaultSettings>;
export interface LevelRecord {cleared:boolean;best?:number;bestSim?:number}
export interface Save {version:number;settings:Settings;levels:Record<string,LevelRecord>}
export interface Results {level:Level;realTime:number;simTime:number;kills:number;shots:number;best?:number;newBest:boolean;hasNext:boolean}
export interface Hud {visible:boolean;timeScale:number;itemName:string|null;ammo:number;maxAmmo:number;hint:string|null;levelName:string;remaining:number;crosshairScale:number}
export interface UiHandlers {onPlayLevel:(i:number)=>void;onResume:()=>void;onRestart:()=>void;onMenu:()=>void;onNext:()=>void;onReplay:()=>void;onSkipReplay:()=>void;onSettingsChanged:(s:Settings)=>void;onUiSound:()=>void}
export interface Particle {pos:number[];vel:number[];life:number;maxLife:number;size:number;color:number[];drag:number;gravity:number;streak:number;alive?:boolean}
export interface Shard {pos:number[];vel:number[];rot:number[];angVel:number[];scale:number;life:number;mesh:number;tint:number[];sleeping:boolean}
export interface Door {at:number;width:number;height?:number;side?:string}
export interface RoomOptions {t?:number;mat?:string;doors?:Door[];floor?:boolean;floorMat?:string;ceiling?:boolean}
export interface AudioOptions {ignoreTime?:boolean;pitch?:number;volume?:number;pos?:number[]}
