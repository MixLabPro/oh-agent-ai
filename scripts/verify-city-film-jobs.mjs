#!/usr/bin/env node
// Exercise the production task client with deterministic worker/clock adapters.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import vm from "node:vm";
import { readFileSync } from "node:fs";
const require = createRequire(new URL("../apps/desktop/ui-dev/package.json", import.meta.url));
const { buildSync } = require("esbuild");
const code = buildSync({ entryPoints: [new URL("../apps/agent-city/ui/src/export/filmJob.ts", import.meta.url).pathname],
  bundle: true, write: false, format: "cjs", logLevel: "silent" }).outputFiles[0].text;
let now = 0;
let timerId = 0;
const timers = new Map();
class TestWorker {
  terminated = 0; posts = [];
  postMessage(message) { this.posts.push(message); }
  terminate() { this.terminated++; }
  emit(message) { this.onmessage?.({ data: message }); }
}
const module = { exports: {} };
class TestBitmap { closed = 0; close() { this.closed++; } }
const environment = { module, exports: module.exports, Worker: TestWorker, OffscreenCanvas: class {},
  VideoEncoder: class {}, VideoFrame: class {}, ImageBitmap: TestBitmap, Blob, Error, DOMException, URL,
  performance: { now: () => now }, setInterval: (callback) => { const id = ++timerId; timers.set(id, callback); return id; },
  clearInterval: (id) => timers.delete(id) };
vm.runInNewContext(code, environment);
const { runFilmJob, supportsBackgroundFilm } = module.exports;
const job = { model: {}, seed: 42, cut: "short", width: 320, height: 180, fps: 1, bitrate: 120000 };
function start(onPreview) {
  const worker = new TestWorker(); const controller = new AbortController(); const progress = [];
  const promise = runFilmJob(job, { signal: controller.signal, workerFactory: () => worker,
    onProgress: (frame, total) => progress.push([frame, total]), onPreview });
  return { worker, controller, promise, progress };
}
function advance(ms) { now += ms; for (const timer of [...timers.values()]) timer(); }
let task = start();
task.worker.emit({ type: "ready" });
task.worker.emit({ type: "ready" });
assert.equal(task.worker.posts.length, 1, "start is acknowledged only once");
task.worker.emit({ type: "progress", frame: 1, total: 5 });
task.worker.emit({ type: "progress", frame: 6, total: 5 });
assert.deepEqual(task.progress, [[1, 5]]);
const blob = new Blob(["synthetic webm"], { type: "video/webm" });
task.worker.emit({ type: "complete", blob });
assert.equal(await task.promise, blob);
assert.equal(task.worker.terminated, 1);
task.worker.emit({ type: "error", code: "late_failure" });
assert.equal(task.worker.terminated, 1);
let seenPreview = 0;
task = start((bitmap, frame) => { assert.equal(bitmap.closed, 0); assert.equal(frame, 3); seenPreview++; });
const bitmap = new TestBitmap();
task.worker.emit({ type: "preview", bitmap, frame: 3 });
assert.equal(seenPreview, 1); assert.equal(bitmap.closed, 1);
assert.equal(task.worker.posts.at(-1).type, "preview-ack");
task.controller.abort(); await assert.rejects(task.promise, { name: "AbortError" });
const lateBitmap = new TestBitmap(), posts = task.worker.posts.length;
task.worker.emit({ type: "preview", bitmap: lateBitmap, frame: 4 });
assert.equal(lateBitmap.closed, 1); assert.equal(task.worker.posts.length, posts);
task = start(() => { throw new Error("preview failure"); });
const failedBitmap = new TestBitmap();
task.worker.emit({ type: "preview", bitmap: failedBitmap, frame: 3 });
await assert.rejects(task.promise, /background_export_failed/); assert.equal(failedBitmap.closed, 1);
task = start();
const ignoredBitmap = new TestBitmap();
task.worker.emit({ type: "preview", bitmap: ignoredBitmap, frame: 0 });
assert.equal(ignoredBitmap.closed, 1);
task.controller.abort(); await assert.rejects(task.promise, { name: "AbortError" });
task = start();
task.worker.postMessage = () => { throw new Error("ack failed"); };
const ackBitmap = new TestBitmap();
task.worker.emit({ type: "preview", bitmap: ackBitmap, frame: 0 });
await assert.rejects(task.promise, /background_export_failed/); assert.equal(ackBitmap.closed, 1);
task = start(); task.worker.emit({ type: "ready" });
task.controller.abort();
await assert.rejects(task.promise, { name: "AbortError" });
assert.equal(task.worker.terminated, 1, "cancellation must terminate, not wait for worker cooperation");
task = start(); advance(16000);
await assert.rejects(task.promise, /background_export_timeout/);
task = start(); task.worker.emit({ type: "ready" }); advance(29000);
task.worker.emit({ type: "pulse" }); advance(29000);
assert.equal(task.worker.terminated, 0);
advance(2000); await assert.rejects(task.promise, /background_export_timeout/);
task = start(); task.worker.emit({ type: "ready" });
task.worker.emit({ type: "error", code: "export_memory_limit" });
await assert.rejects(task.promise, /export_memory_limit/);
task = start(); task.worker.emit(null);
await assert.rejects(task.promise, /background_export_failed/);
task = start(); task.worker.onerror({ preventDefault() {} });
await assert.rejects(task.promise, /background_export_failed/);
const aborted = new AbortController(); aborted.abort();
let created = false;
await assert.rejects(runFilmJob(job, { signal: aborted.signal, onProgress() {}, workerFactory() { created = true; return new TestWorker(); } }), { name: "AbortError" });
assert.equal(created, false);
environment.OffscreenCanvas = undefined;
assert.equal(supportsBackgroundFilm(), false);
await assert.rejects(runFilmJob(job, { signal: new AbortController().signal, onProgress() {} }), /background_export_unavailable/);
assert.equal(timers.size, 0, "every outcome must clean up its timer");
console.log("City film jobs: passed (ready/start, progress, preview acknowledgement/bitmap release/late frames/callback and transport errors, completion, immediate cancel, boot/hang deadlines, worker errors, memory-limit propagation, unsupported capability and cleanup).");

const muxerPath = new URL("../apps/agent-city/ui/src/engine/webmMuxer.ts", import.meta.url);
const muxerSource = readFileSync(muxerPath, "utf8");
function writerFrom(source) {
  const output = buildSync({ stdin: { contents: source, loader: "ts" }, bundle: true, write: false, format: "cjs" }).outputFiles[0].text;
  const module = { exports: {} }; vm.runInNewContext(output, { module, exports: module.exports, Blob, TextEncoder, Uint8Array, ArrayBuffer, DataView });
  return new module.exports.WebmWriter({ codec: "V_VP8", width: 320, height: 180 });
}
const legacySource = muxerSource.replace(/    const body = \[info, tracks, \.\.\.clusters\];[\s\S]*?\{ type: "video\/webm" \}\);/,
  '    const body = concat([info, tracks, ...clusters]); const segment = element(ID.Segment, body); return new Blob([ebml as BlobPart, segment as BlobPart], { type: "video/webm" });');
assert.notEqual(legacySource, muxerSource, "reference writer must use the original whole-file copies");
const optimized = writerFrom(muxerSource), legacy = writerFrom(legacySource);
for (let index = 0; index < 90; index++) {
  const bytes = new Uint8Array(1000).fill(index);
  optimized.addChunk(index * 500, index % 4 === 0, bytes);
  legacy.addChunk(index * 500, index % 4 === 0, bytes);
}
assert.deepEqual(new Uint8Array(await optimized.finish(45000).arrayBuffer()), new Uint8Array(await legacy.finish(45000).arrayBuffer()));
console.log("City WebM muxer: lower-copy Blob assembly preserves byte-for-byte output.");
