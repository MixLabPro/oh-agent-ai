/**
 * City 数据装载：把 Tauri 数据面（sessions / findings / 统计时区）整理成
 * CityModel。策略：
 *  · 第一页（500 条）到达即出模型——首屏快速可交互；
 *  · 之后分页继续装载并重建模型（楼位确定性保证已有建筑不搬家）；
 *  · 装载上限 LOAD_CAP，超出部分由服务端计数如实入 HUD（truncated）；
 *  · 刷新遵循全局失效门（makeInvalidationGate），与其他页同一条纪律。
 */

import { buildCityModel, LOAD_CAP, type CityModel } from "./cityModel";
import { listenAppEvents, makeInvalidationGate, readFindings, readSessions, readStatisticsTimezone, safeUiError, type FindingGroup, type SessionRow } from "../../lib/tauri";

export type CityWindowKind = "7d" | "30d" | "90d";

export const CITY_WINDOWS: Array<{ kind: CityWindowKind; days: number }> = [
  { kind: "7d", days: 7 },
  { kind: "30d", days: 30 },
  { kind: "90d", days: 90 },
];

function dateInTimezone(timezone: string, date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export type CityLoadResult = { model: CityModel; error: string | null; /** 分页是否已全部到齐——到齐后应做一次全量重排。 */
  complete: boolean };
export type CityLoadHandlers = {
  onModel: (result: CityLoadResult) => void;
  onBackgroundModel?: (result: CityLoadResult) => void;
};

export class CityLoader {
  private generation = 0;
  private unsubscribers: Array<() => void> = [];
  private active = false;
  private timezone: string | null = null;

  async begin(windowKind: CityWindowKind, handlers: CityLoadHandlers): Promise<void> {
    this.active = true;
    const generation = ++this.generation;

    if (!this.timezone) {
      try {
        this.timezone = (await readStatisticsTimezone()).timezone;
      } catch {
        this.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      }
    }
    const timezone = this.timezone;
    const today = dateInTimezone(timezone);
    const days = CITY_WINDOWS.find((item) => item.kind === windowKind)?.days ?? 30;
    const dateFrom = shiftDate(today, -(days - 1));
    const dateTo = today;

    const load = async (background: boolean): Promise<void> => {
      if (!this.active || generation !== this.generation) return;
      try {
        const findingsPromise: Promise<FindingGroup[]> = readFindings().then((report) => report.issues).catch((): FindingGroup[] => []);
        const rows: SessionRow[] = [];
        let cursor: string | null = null;
        let totalSessions = 0;
        let truncated = false;
        // 发布策略：只发「首屏页」与「终态页」两次模型——中间页不发布。
        // 每次发布都会整城重建渲染对象（地形/纹理已按 seed 缓存，建筑层仍要
        // 全量重建），逐页发布会把重建成本乘以页数，形成连续卡顿；首屏先让
        // 城市成像，终态一次到位（complete=true → 全量重排修正乱序圈层）。
        // findings 与 sessions 共享后端锁且慢：首屏不等它（信标异步补充），
        // 终态再带上完整 findings。
        let published = false;
        for (let page = 0; page < 12; page += 1) {
          if (!this.active || generation !== this.generation) return;
          const result = await readSessions({ date_from: dateFrom, date_to: dateTo, page_size: 500, cursor });
          if (!this.active || generation !== this.generation) return;
          rows.push(...result.sessions);
          totalSessions = result.window_session_count;
          cursor = result.next_cursor;
          truncated = Boolean(cursor) && (rows.length >= LOAD_CAP || page === 11);
          if (!published) {
            const model = buildCityModel({
              rows,
              findings: [],
              windowStartMs: Date.parse(`${dateFrom}T00:00:00Z`),
              windowEndMs: Date.now(),
              windowLabel: `${dateFrom} ~ ${dateTo}`,
              totalSessions,
              truncated,
            });
            const callback = !background ? handlers.onModel : handlers.onBackgroundModel ?? handlers.onModel;
            callback({ model, error: null, complete: false });
            published = true;
          }
          if (!cursor) break;
          if (rows.length >= LOAD_CAP) {
            truncated = true;
            break;
          }
        }
        // 全部页到齐：用完整数据发最终模型（complete=true → 全量重排，
        // 修正中间页乱序到达造成的圈层错位）。
        if (rows.length) {
          const findings = await findingsPromise;
          const model = buildCityModel({
            rows,
            findings,
            windowStartMs: Date.parse(`${dateFrom}T00:00:00Z`),
            windowEndMs: Date.now(),
            windowLabel: `${dateFrom} ~ ${dateTo}`,
            totalSessions,
            truncated,
          });
          const callback = background ? handlers.onBackgroundModel ?? handlers.onModel : handlers.onModel;
          callback({ model, error: null, complete: true });
        }
      } catch (reason: unknown) {
        if (!this.active || generation !== this.generation) return;
        handlers.onModel({ model: buildCityModel({ rows: [], findings: [], windowStartMs: Date.parse(`${dateFrom}T00:00:00Z`), windowEndMs: Date.now(), windowLabel: `${dateFrom} ~ ${dateTo}`, totalSessions: 0, truncated: false }), error: safeUiError(reason, "城市数据暂不可用"), complete: true });
      }
    };

    await load(false);

    // 失效刷新：与 Sessions/Overview 同款 revision 门。
    const gate = makeInvalidationGate();
    const unsubscribe = await listenAppEvents((event) => {
      if (!gate(event)) return;
      void load(true);
    }).catch(() => null);
    if (!this.active || generation !== this.generation) {
      unsubscribe?.();
      return;
    }
    this.unsubscribers.push(unsubscribe ?? (() => {}));
  }

  /** 活跃会话轮询：live 模式下让"工地"随真实 token 增长（分钟级即可）。 */
  startActivePolling(pollMs: number, onPoll: () => void): () => void {
    const timer = window.setInterval(() => {
      if (this.active && document.visibilityState === "visible") onPoll();
    }, pollMs);
    return () => window.clearInterval(timer);
  }

  reload(windowKind: CityWindowKind, handlers: CityLoadHandlers): Promise<void> {
    this.stopSubscribers();
    return this.begin(windowKind, handlers);
  }

  private stopSubscribers(): void {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
  }

  dispose(): void {
    this.active = false;
    this.generation += 1;
    this.stopSubscribers();
  }
}
