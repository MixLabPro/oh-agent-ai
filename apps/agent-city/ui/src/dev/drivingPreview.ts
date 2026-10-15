/** Flat synthetic acceptance pad. No City data, host bridge, state persistence or network. */
import * as THREE from "three";
import { CarVisuals } from "../game/CarVisuals";
import { DrivingWorld } from "../game/DrivingWorld";
import { DrivingInput } from "../game/DrivingInput";
import { DRIVING_DT, initialDrivingState, stepDriving, type DrivingEnvironment } from "../game/DrivingSimulation";
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const stage = element<HTMLElement>("stage");
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping;
const canvas = renderer.domElement; canvas.tabIndex = 0;
canvas.setAttribute("aria-label", "驾驶画布，W S 加减速，A D 转向，Esc 暂停"); stage.append(canvas);
const scene = new THREE.Scene(); scene.background = new THREE.Color("#cfdfda"); scene.fog = new THREE.Fog("#cfdfda", 55, 130);
const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 160);
scene.add(new THREE.HemisphereLight("#e3faff", "#bbaa8d", 2.6));
const sun = new THREE.DirectionalLight("#ffdebd", 3.4); sun.position.set(-15, 30, -18); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, far: 100 }); sun.shadow.normalBias = 0.03; scene.add(sun);
const resources: Array<{ dispose: () => void }> = [];
const materials = new Map<string, THREE.MeshStandardMaterial>();
const mesh = (geometry: THREE.BufferGeometry, color: string, x: number, y: number, z: number) => {
  resources.push(geometry);
  let material = materials.get(color);
  if (!material) { material = new THREE.MeshStandardMaterial({ color, roughness: 0.85 }); materials.set(color, material); resources.push(material); }
  const object = new THREE.Mesh(geometry, material); object.position.set(x, y, z); object.receiveShadow = true; object.castShadow = true; scene.add(object); return object;
};
const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string) => mesh(new THREE.BoxGeometry(sx, sy, sz), color, x, y, z);
box(0, -0.2, 0, 150, 0.2, 110, "#8dc5ba");
box(0, -0.06, 0, 70, 0.12, 48, "#626c70");
// Closed pad boundaries are visible; collisions use the same four inner limits.
for (const z of [-24.25, 24.25]) box(0, 0.3, z, 71, 0.6, 0.5, "#f1d2b4");
for (const x of [-35.25, 35.25]) box(x, 0.3, 0, 0.5, 0.6, 48, "#f1d2b4");
for (let x = -30; x < 32; x += 5) for (const z of [-10, 10]) box(x, 0.006, z, 2.2, 0.012, 0.11, "#f4dba6");
for (const z of [-20, 20]) box(0, 0.008, z, 64, 0.016, 0.12, "#e9e7d5");
const obstacles = [
  { id: "kiosk", minX: 9, maxX: 15, minZ: -3, maxZ: 3, layer: "ground" },
  { id: "planter", minX: -8, maxX: -2, minZ: 12, maxZ: 15, layer: "ground" },
];
const kiosk = box(12, 1.4, 0, 6, 2.8, 6, "#f2c4bc"); const roof = box(12, 2.9, 0, 6.4, 0.2, 6.4, "#efe4ca");
box(8.98, 1.5, 0, 0.04, 1.2, 3.8, "#659da4");
const planter = box(-5, 0.5, 13.5, 6, 1, 3, "#e7cba8"); box(-5, 1.1, 13.5, 5.6, 0.2, 2.6, "#7a9b72");
for (const x of [-29, -13, 3, 23, 32]) for (const z of [-29, 29]) {
  mesh(new THREE.CylinderGeometry(0.17, 0.26, 6, 7), "#a48c6b", x, 3, z);
  for (let i = 0; i < 5; i += 1) {
    const leaf = mesh(new THREE.ConeGeometry(0.6, 4, 4), "#507e68", x, 5.8, z);
    leaf.rotation.z = 1.22; leaf.rotation.y = i * Math.PI * 2 / 5;
  }
}
const world = new DrivingWorld([{ id: "pad", layer: "ground", minX: -35, maxX: 35, minZ: -24, maxZ: 24, base: 0, slopeX: 0, slopeZ: 0, connections: [] }], obstacles);
let reason = "";
const environment: DrivingEnvironment = { move: (previous, desired) => { const result = world.move(previous, desired); reason = result.reason ?? ""; return result; } };
const car = new CarVisuals(); scene.add(car.root);
let state = initialDrivingState(-22, 0); let prior = state;
let paused = true; let previousTime = 0; let accumulator = 0; let frame = 0; let hudAt = 0;
const notice = element<HTMLElement>("notice"); const pauseButton = element<HTMLButtonElement>("pause");
const syncPause = () => { pauseButton.textContent = paused ? "继续试驾" : "暂停"; notice.hidden = !paused; if (paused) notice.textContent = "已暂停。点击「继续试驾」重新聚焦画布；R 可回到起点。"; };
const setPaused = (next: boolean) => { paused = next; input.clear(); accumulator = 0; prior = state; syncPause(); };
const target = new THREE.Vector3(); const look = new THREE.Vector3();
const cameraAnchor = new THREE.Vector3(); const cameraDirection = new THREE.Vector3();
const cameraRay = new THREE.Raycaster();
const cameraObstacles = [kiosk, roof, planter];
scene.updateMatrixWorld(true);
const constrainCamera = (position: THREE.Vector3) => {
  cameraAnchor.set(state.x, state.y + 0.8, state.z);
  cameraDirection.copy(position).sub(cameraAnchor);
  const distance = cameraDirection.length();
  cameraDirection.normalize(); cameraRay.set(cameraAnchor, cameraDirection); cameraRay.far = distance;
  const hit = cameraRay.intersectObjects(cameraObstacles, false)[0];
  if (hit) position.copy(cameraAnchor).addScaledVector(cameraDirection, Math.max(0.35, hit.distance - 0.35));
  position.y = Math.max(state.y + 0.35, position.y);
};
const follow = (dt: number, snap = false) => {
  target.set(state.x - Math.cos(state.heading) * 7.2, state.y + 4.4, state.z - Math.sin(state.heading) * 7.2);
  constrainCamera(target);
  camera.position.lerp(target, snap ? 1 : 1 - Math.exp(-5 * dt));
  constrainCamera(camera.position);
  look.set(state.x + Math.cos(state.heading) * 2.5, state.y + 0.55, state.z + Math.sin(state.heading) * 2.5);
  camera.lookAt(look);
};
const reset = () => { input.clear(); state = initialDrivingState(-22, 0); prior = state; accumulator = 0; reason = ""; follow(0, true); };
const input = new DrivingInput(canvas, { isRunning: () => !paused, pause: () => setPaused(true), togglePause: () => setPaused(!paused), reset }); input.attach();
const onPause = () => { setPaused(!paused); if (!paused) canvas.focus(); };
const onReset = () => { reset(); if (!paused) canvas.focus(); };
const onPointer = () => { canvas.focus(); };
const keepCanvasFocus = (event: PointerEvent) => event.preventDefault();
pauseButton.addEventListener("pointerdown", keepCanvasFocus); element("reset").addEventListener("pointerdown", keepCanvasFocus);
pauseButton.addEventListener("click", onPause); element("reset").addEventListener("click", onReset); canvas.addEventListener("pointerdown", onPointer);
const resize = () => { renderer.setSize(stage.clientWidth, stage.clientHeight); camera.aspect = stage.clientWidth / stage.clientHeight; camera.updateProjectionMatrix(); };
window.addEventListener("resize", resize);
const tick = (now: number) => {
  const rawDt = previousTime ? (now - previousTime) / 1000 : 0; previousTime = now;
  if (!paused && rawDt > 0.25) setPaused(true);
  const dt = Math.min(rawDt, 0.1);
  if (!paused) {
    accumulator += dt; let steps = 0;
    while (accumulator >= DRIVING_DT && steps < 5) { prior = state; state = stepDriving(state, input.snapshot(), environment); accumulator -= DRIVING_DT; steps++; }
    if (steps === 5 && accumulator >= DRIVING_DT) accumulator = 0;
  }
  const alpha = paused ? 1 : accumulator / DRIVING_DT;
  car.update({ ...state, x: prior.x + (state.x - prior.x) * alpha, z: prior.z + (state.z - prior.z) * alpha,
    heading: prior.heading + (state.heading - prior.heading) * alpha, distance: prior.distance + (state.distance - prior.distance) * alpha });
  if (!paused) follow(dt);
  if (now - hudAt >= 100) {
    hudAt = now; element("speed").textContent = Math.abs(state.speed).toFixed(1);
    element("gear").textContent = state.reversing ? "倒车 R" : state.braking ? "制动" : state.speed > 0 ? "前进 D" : "静止";
    element("status").textContent = paused ? "已暂停 · 点击继续试驾" : reason ? "触及障碍或边界 · 可倒车离开 / R 复位" : "合成测试场 · 速度为游戏单位";
    // Synthetic-only acceptance readout, never a projection of user data.
    stage.dataset.x = String(state.x); stage.dataset.z = String(state.z); stage.dataset.speed = String(state.speed); stage.dataset.paused = String(paused);
  }
  renderer.render(scene, camera); frame = requestAnimationFrame(tick);
};
resize(); follow(0, true); car.update(state); frame = requestAnimationFrame(tick);
window.addEventListener("pagehide", () => {
  cancelAnimationFrame(frame); input.detach(); window.removeEventListener("resize", resize);
  pauseButton.removeEventListener("pointerdown", keepCanvasFocus); element("reset").removeEventListener("pointerdown", keepCanvasFocus);
  pauseButton.removeEventListener("click", onPause); element("reset").removeEventListener("click", onReset); canvas.removeEventListener("pointerdown", onPointer);
  car.dispose(); resources.forEach((resource) => resource.dispose()); sun.shadow.dispose(); renderer.dispose();
}, { once: true });
