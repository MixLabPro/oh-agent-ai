/**
 * Compile a session-kit/v1 overlay onto a session parcel and drive block-by-block
 * construction. Geometry goes through buildingCompiler (same Part alphabet as landmarks).
 */
import * as THREE from "three";
import { compileBuilding, type CompileTarget } from "./render/buildingCompiler";
import { createMaterialFactory } from "./render/landmarkMaterials";
import type { BuildingPlan, Part, PartRole } from "./models/model";
import type { BuildingRuntime } from "./render/types";
import {
  constructionOrder, partReveal, type KitPart, type OverlayDecision,
} from "./sessionKitConstruction";

export type KitRuntime = {
  decision: OverlayDecision;
  group: THREE.Group;
  objects: THREE.Object3D[];
  progress: number;
  disposables: Array<{ dispose: () => void }>;
};

const ROLE_TINT: Record<string, string> = {
  wall: "#c47a54",
  structure: "#9a6a4a",
  roof: "#7a3e32",
  glass: "#73b8c0",
  trim: "#e8d5a3",
};

function planFrom(parts: KitPart[], palette?: string): BuildingPlan {
  return constructionOrder(parts).map((part) => {
    const mapped: Part = {
      id: part.id,
      kind: part.kind,
      role: part.role as PartRole,
      at: part.at,
      size: part.size,
      color: part.color ?? palette ?? ROLE_TINT[part.role] ?? ROLE_TINT.wall,
      ...(part.rot ? { rot: part.rot } : {}),
    };
    return mapped;
  });
}

export function createKitRuntime(decision: OverlayDecision, runtime: BuildingRuntime, palette?: string): KitRuntime {
  const group = new THREE.Group();
  group.name = `session-kit:${decision.assetRef}`;
  group.position.set(runtime.slot.x, runtime.groundY, runtime.slot.z);
  group.rotation.y = runtime.slot.yaw;
  const disposables: Array<{ dispose: () => void }> = [];
  const material = createMaterialFactory((item) => disposables.push(item));
  const objects: THREE.Object3D[] = [];
  const target: CompileTarget = {
    group,
    material,
    disposables,
    onPart: (_part, object) => { objects.push(object); },
  };
  if (decision.parts.length) compileBuilding(planFrom(decision.parts, palette), target);
  const progress = decision.animate ? 0 : 1;
  applyKitProgress(objects, progress, decision.parts.length);
  group.visible = decision.kind === "set";
  return { decision, group, objects, progress, disposables };
}

export function applyKitProgress(objects: THREE.Object3D[], progress: number, partCount: number): void {
  const count = objects.length || partCount;
  for (let index = 0; index < objects.length; index += 1) {
    const reveal = partReveal(progress, index, count);
    const object = objects[index];
    object.visible = reveal > 0.001;
    object.scale.set(1, Math.max(0.001, reveal), 1);
  }
}

export function stepKitRuntime(kit: KitRuntime, dt: number): boolean {
  const target = kit.decision.kind === "reset" ? 0 : 1;
  if (!kit.decision.animate) {
    if (kit.progress === target) return false;
    kit.progress = target;
    applyKitProgress(kit.objects, kit.progress, kit.decision.parts.length);
    kit.group.visible = kit.decision.kind === "set";
    return true;
  }
  if (Math.abs(kit.progress - target) < 0.002) {
    if (kit.progress === target) return false;
    kit.progress = target;
    applyKitProgress(kit.objects, kit.progress, kit.decision.parts.length);
    kit.group.visible = kit.decision.kind === "set" && target > 0;
    return true;
  }
  const rate = Math.min(1, dt * 1.15);
  kit.progress += (target - kit.progress) * rate;
  applyKitProgress(kit.objects, kit.progress, kit.decision.parts.length);
  kit.group.visible = kit.decision.kind === "set" || kit.progress > 0.002;
  return true;
}

export function disposeKitRuntime(kit: KitRuntime): void {
  kit.group.removeFromParent();
  for (const disposable of kit.disposables) disposable.dispose();
}

export function replayKitRuntime(kit: KitRuntime): void {
  kit.decision = { ...kit.decision, animate: true };
  kit.progress = 0;
  kit.group.visible = kit.decision.kind === "set";
  applyKitProgress(kit.objects, 0, kit.decision.parts.length);
}
