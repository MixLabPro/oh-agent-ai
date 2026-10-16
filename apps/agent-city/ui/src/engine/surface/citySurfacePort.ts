/** Host-side capture of the driving surface for the CURRENT rendered city (spec §11.6 read-only
 * snapshot port). No THREE/DOM: CityEngine supplies the exact layout + ground compilation its
 * static geometry was built from, this compiles the aggregate once, publishes it into a
 * SurfaceStore (local SHA-256 content identity) and hands out revision-checked reads.
 *
 * 只给当前官方 City 实例的审计/驾驶模块用；不是插件 IPC，不出 MCP/导出，不落盘。
 * 编译是按需的（不在每次布局变化时花 CPU），在主线程同步执行（十五城 0.1–0.7 秒，Worker 是后续项）。
 * 布局一变 / 换种子 / 卸载就 invalidate：在途的 capture 返回 stale，旧 revision 读不到新几何。 */
import type { CityLayout } from "../cityLayout";
import { compileCitySurface, type CitySurfaceCompilation } from "./compileSurface";
import type { CompiledGroundRoadSurface } from "./groundRoadCompiler";
import { SurfaceStore, type SurfaceHasher } from "./SurfaceStore";
import type { CompiledCitySurface } from "./types";
import type { CollisionIndex, SolidInput } from "../../game/driving/CollisionIndex";
import { cityCollisionIndex } from "../../game/driving/citySolids";

/** `solids`: the scene's rendered solid obstacles, read once per capture (display state at that moment). */
export type CitySurfaceSource = Readonly<{ layout: CityLayout; ground: CompiledGroundRoadSurface; solids?: () => readonly SolidInput[] }>;
export type CitySurfaceCapture =
  | Readonly<{ status: "ready"; revision: string; compilation: CitySurfaceCompilation;
      /** Structure obstacles + deck slabs + scene solids, frozen with this capture. */
      collision: CollisionIndex;
      /** Defensive copy, or null once the city changed since this capture. */
      read: () => CompiledCitySurface | null }>
  | Readonly<{ status: "stale" | "cancelled" | "unavailable" }>;

export class CitySurfacePort {
  private readonly store: SurfaceStore;
  private generation = 0;
  private cached: { source: CitySurfaceSource; capture: Extract<CitySurfaceCapture, { status: "ready" }> } | null = null;
  constructor(hash?: SurfaceHasher) { this.store = new SurfaceStore(hash); }

  /** The rendered city changed (layout, seed, teardown): every earlier capture becomes unreadable. */
  invalidate(): void { this.generation++; this.cached = null; this.store.clear(); }

  async capture(source: CitySurfaceSource | null, signal?: AbortSignal): Promise<CitySurfaceCapture> {
    if (!source) return Object.freeze({ status: "unavailable" });
    if (signal?.aborted) return Object.freeze({ status: "cancelled" });
    if (this.cached && this.cached.source.layout === source.layout && this.cached.source.ground === source.ground && this.store.read(this.cached.capture.revision)) return this.cached.capture;
    const generation = this.generation;
    const compilation = compileCitySurface(source.layout, { ground: source.ground });
    const publication = await this.store.publish(compilation.surface);
    if (signal?.aborted) return Object.freeze({ status: "cancelled" });
    if (generation !== this.generation || publication.status !== "published") return Object.freeze({ status: "stale" });
    const revision = publication.revision;
    const collision = cityCollisionIndex(compilation.obstacles, source.solids?.() ?? []);
    const capture = Object.freeze({ status: "ready" as const, revision, compilation, collision, read: () => (generation === this.generation ? this.store.read(revision) : null) });
    this.cached = { source, capture };
    return capture;
  }
}
