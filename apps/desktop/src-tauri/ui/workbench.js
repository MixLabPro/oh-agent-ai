// 工作台主窗口前端：三页 总览 / Token 日历 / 会话（列表+详情）。
// 纯 HTML/CSS/JS，开发时由 Vite 提供 HMR —— `withGlobalTauri: true` 让全局 `window.__TAURI__`
// 可用。数据只来自后端命令（read_overview / read_calendar_month /
// read_hourly_distribution / sessions_list / sessions_read），任何金额/覆盖率都不在本文件计算——core 算好、这里格式化展示
// （CLAUDE.md 的 cost 教训：前端不许长第二份定价）。
"use strict";

const { invoke } = window.__TAURI__.core;
// 事件桥（fold 完成事件，见下方「事件桥」一节）从同一套全局 API 取 listen。
const { listen } = window.__TAURI__.event;
const notificationApi = window.__TAURI__.notification;

// 系统预算提醒只允许跳回预算页；通知正文不承载路径、原始日志或敏感金额。
async function subscribeBudgetNotificationActions() {
  if (!notificationApi || !notificationApi.onAction) return;
  try {
    await notificationApi.registerActionTypes([{
      id: "budget-alert",
      actions: [{ id: "open-budget", title: "查看预算" }],
    }]);
    await notificationApi.onAction((notification) => {
      if (notification && notification.actionTypeId === "budget-alert") {
        invoke("focus_budget_from_notification").catch((e) => {
          console.warn("[workbench] 预算提醒跳转失败", e);
        });
      }
    });
  } catch (e) {
    console.warn("[workbench] 系统预算提醒 action 不可用", e);
  }
}

// ---------- 格式化（与弹窗 main.js / 托盘 lib.rs 同 spec，不许各报各的格式） ----------

// 金额 → ¥600 / ¥774.7 / ¥6.73（≥100 一位小数、否则两位、去尾零）。
function fmtMoney(x) {
  const s = x >= 100 ? x.toFixed(1) : x.toFixed(2);
  return "¥" + s.replace(/0+$/, "").replace(/\.$/, "");
}

// 会话成本是 cost_usd（标 USD，与 payload 的 CNY 各标各的，v1 不换算）。
function fmtUSD(x) {
  if (x == null || Number.isNaN(x)) return "—";
  return "$" + x.toFixed(2);
}

// v0.9.1 起 cost 列输入是 `cost_minor: {amount_minor, currency} | null`（spec §0.1：
// 金额一律 i64 minor units 整数，存储层无浮点）。null → "—"（不冒充 ¥0.00）；
// 命中 → currency 走 USD/CNY 各自显示，amount_minor / 100 得元，浮点只在这一步
// 出 renderer——存储与 IPC 全程整数。
function fmtCostMinor(cm) {
  if (cm == null) return "—";
  const minor = cm.amount_minor;
  const cur = cm.currency;
  if (typeof minor !== "number" || !cur) return "—";
  const yuan = minor / 100;
  if (cur === "USD") return fmtUSD(yuan);
  if (cur === "CNY") return fmtMoney(yuan);
  // 未知币种：显示币种代码 + 元值（避免被 fmtUSD/fmtMoney 之一误标）
  return cur + " " + yuan.toFixed(2);
}

// 成本为空时必须把原因展示出来：订阅 token 不是逐 token 账单，缺价卡/价卡
// 快照也不等于免费。cost_status 来自 SQL authority 的统一会话投影。
function fmtCostStatus(status) {
  if (!status) return "成本不可用 · 未知原因";
  const labels = {
    subscription: "订阅用量 · 无逐 token 账单",
    unpriced: "未计价 · 无原厂价格卡",
    unavailable: "成本不可用",
    estimated: "按量估算",
  };
  const reasons = {
    "no-usage-facts": "没有用量事实",
    "no-pricing-snapshot": "没有覆盖事件时间的价格快照",
    "no-price-card": "没有匹配的原厂价格卡",
    "multiple-provider-costs-require-breakdown": "多个 provider，需分桶查看",
    "subscription-token-usage-is-not-a-per-token-bill": "订阅 token 不产生逐 token 账单",
    "cost-query-failed": "成本查询失败",
  };
  const state = labels[status.state] || "成本不可用";
  const reason = reasons[status.reason] || status.reason || "未知原因";
  return state + " · " + reason;
}

function fmtSessionCost(session) {
  if (session && session.cost_minor != null) {
    return fmtCostMinor(session.cost_minor) + (session.cost_minor.basis === "metered_estimate" ? " · 估算" : "");
  }
  return fmtCostStatus(session && session.cost_status);
}

// token 缩写：≥1M "1.4M"、≥1K "8.2K"（<10K 一位小数）、<1K 原样 —— 镜像 lib.rs::fmt_tokens。
function fmtTokens(n) {
  if (n == null) return "—";
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) {
    const k = n / 1e3;
    return (k < 10 ? k.toFixed(1) : Math.round(k).toString()) + "K";
  }
  return String(n);
}

function fmtPct(x) {
  return Math.round(x * 100) + "%";
}

// 统计时区今天 → "YYYY-MM-DD"；供应商价格策略时区不由这个 UI 日期 helper 推断。
function systemTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

// 统计窗口使用后端持久化的用户选择；系统时区只作为配置不可读时的安全回退。
let configuredStatisticsTimezone = systemTimezone();

async function loadStatisticsTimezonePreference() {
  try {
    const config = await invoke("statistics_timezone_config");
    if (config && config.status === "ok") {
      const timezone = String(config.timezone || config.system_timezone || "").trim();
      if (timezone) {
        new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
        configuredStatisticsTimezone = timezone;
      }
    }
  } catch (e) {
    console.warn("[workbench] 统计时区读取失败，使用系统时区", e);
  }
}

function statisticsTimezoneName() {
  return configuredStatisticsTimezone;
}

function formatStatisticsDateTime(value, options) {
  if (value == null || value === "") return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: statisticsTimezoneName(),
    ...options,
  }).format(date);
}

function systemToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: statisticsTimezoneName(), year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
  return values.year + "-" + values.month + "-" + values.day;
}

function statisticsToday() {
  return systemToday();
}

function statisticsMonth() {
  return statisticsToday().slice(0, 7);
}

function shiftStatisticsDate(days) {
  const d = new Date(statisticsToday() + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------- 错误规范化（永不假空） ----------

// 后端命令错误形状：`{error:{code,message}}`（store.rs 的类型化错误码）。Tauri v2
// 的 invoke 对命令 Err(Value) 会把该 Value 作为 rejection 原因；这里防御性地归一
// 成 {code, message}——再包裹一层也认得出来。
function normErr(e) {
  const obj = (e && typeof e === "object") ? e : {};
  const inner = (obj.error && typeof obj.error === "object") ? obj.error : obj;
  return {
    code: inner.code || "unknown",
    message: inner.message || (typeof e === "string" ? e : String(e)),
  };
}

// 类型化错误码 → 人话（never fake empty：报错就明说错，不摆空列表/¥0）。
const ERR_TEXT = {
  "source-unavailable": "数据源不可用",
  "not-found": "会话不存在",
  "stale-revision": "列表已更新，请重新加载",
  "schema-mismatch": "数据版本不兼容",
  permission: "无权限访问",
  database_missing: "权威数据库尚未建立",
  database_unreadable: "权威数据库无法读取",
  schema_too_new: "权威数据库需要更新版本",
  schema_migration_required: "权威数据库需要迁移",
};

function errText(e) {
  const n = normErr(e);
  return ERR_TEXT[n.code] || n.message || "未知错误";
}

function showBanner(id, e, showReload) {
  const el = document.getElementById(id);
  if (!el) return;
  el.hidden = false;
  el.textContent = errText(e);
  if (showReload && (normErr(e).code === "stale-revision")) {
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.style.marginLeft = "8px";
    btn.textContent = "重载";
    btn.onclick = () => { el.hidden = true; loadSessions(true); };
    el.appendChild(btn);
  }
}

// ---------- 事件桥：fold 完成 → 立即重拉当前 tab（Rust 侧 emit，见 lib.rs） ----------
// Rust `sync_tick` 在 fold 成功落盘后去抖 emit `usage-fold-updated`（200ms 窗口，
// 负载只有 `{at: unix 秒}`，字段语义见 lib.rs `emit_fold_event`；事件名两处必须
// 一致）。这里订阅它，收到后重拉当前 tab 的概览数据，让工作台在托盘/外部手动
// 同步完成的那一刻就刷新，而不是等下一个 5 分钟 tick 或窗口聚焦。
//
// **这不是实时通道的替代，是加速带**：事件丢时（webview 未就绪、emit 早于
// listen 到达）由 5 分钟 tick / 「立即同步」按钮轮询 / 窗口聚焦兜底——丢一两个
// 事件不会让工作台停在旧数据上超过一个同步周期（lib.rs 的 emit 注释写了同一句
// 话，两个方向都要记这个取舍）。

let manualSyncPolling = false; // 「立即同步」按钮的轮询回退在跑（按钮 handler 置位）

// 概览重拉的合并状态机（纯函数，可单测——scripts/verify-workbench-fold-bridge.mjs
// 从真实文件里取它断言，不是照抄一份逻辑去测）。
// 语义：同一时刻至多一轮重拉在途；在途期间的新触发只标记「稍后再拉一次」，
// 在途那轮回来后自动补一轮。事件与手点/聚焦同刻到达时，合并器把 N 次触发
// 折叠成 ≤2 轮重拉（1 轮在途 + 至多 1 轮补拉），不会并发双拉。
function makePullMerger() {
  let running = false;
  let queued = false;
  return {
    // 触发一次重拉。返回 true = 由本次触发开始了一轮（调用方去拉数据）；
    // false = 已在在途，标 queued 由在途那轮回来补。
    fire() {
      if (running) { queued = true; return false; }
      running = true;
      queued = false;
      return true;
    },
    // 一轮拉完。返回 true = 有排队触发，调用方应再拉一轮（保持 running）；
    // false = 无排队，释放 running。
    done() {
      if (queued) { queued = false; return true; }
      running = false;
      return false;
    },
  };
}

const wbPull = makePullMerger();

// 合并的「重拉当前 tab」入口：事件桥与手点都走这里。只刷两个便宜页
// （overview/calendar）：sessions/findings/sources 是懒加载的重活（spawn 二进制、
// 几十秒），fold 事件不该把用户正在看的分页/筛选搅掉——与聚焦刷新同一口径。
async function refreshActiveTab() {
  if (!wbPull.fire()) return;
  do {
    if (activeTab === "overview") await renderOverview();
    else if (activeTab === "calendar") await renderCalendar();
  } while (wbPull.done());
}

function subscribeFoldEvent() {
  // listen 返回 Promise<unlisten>；工作台是常驻窗口，订阅一次终身有效，不调
  // unlisten。失败只警告不重试——轮询兜底在，不需要自愈回路。
  listen("usage-fold-updated", () => {
    // 手动轮询在跑时，事件是同一轮 fold 的第二个完成信号——按钮自己的 poll
    // 已经（或将）在重拉，跳过避免双拉。事件负载只有 at、不携带手动/自动来源，
    // 这里靠按钮 handler 置位的 manualSyncPolling 区分，不靠猜。
    if (manualSyncPolling) return;
    refreshActiveTab();
  }).catch((e) => {
    console.warn("[workbench] usage-fold-updated 订阅失败（5 分钟 tick / 手动同步兜底）", e);
  });
}

function subscribeSyncStatusEvent() {
  // 首次扫描没有新 facts 时同样需要刷新首屏状态；和 fold 事件分离，避免把
  // “扫描结束但无记录”伪装成一次用量更新。
  listen("sync-status-updated", () => {
    if (manualSyncPolling) return;
    refreshActiveTab();
  }).catch((e) => {
    console.warn("[workbench] sync-status-updated 订阅失败（手动刷新可恢复）", e);
  });
}

// 菜单信息行导航（双通路，与 spec §7 深链同构——§7 描述的就是这套持久目标 +
// 事件通知机制）：
//   - `focus-tab` 事件是快路径（窗口已可见时菜单一戳就跳）；
//   - `peek_nav_target` 持久目标是慢路径——窗口未建/未可见时 emit 是空操作，目标留到
//     下次 init/focus 时 pull。**事件只是通知，pull 是最终仲裁**：监听器不读 e.payload，
//     统一从 state 读目标，apply 后 clear 是单点，事件与焦点 pull 不会各 apply 一遍。
async function pullNavTarget() {
  try {
    const tab = await invoke("peek_nav_target");
    if (tab) {
      switchTab(tab);
      await invoke("clear_nav_target");
    }
  } catch (e) {
    console.warn("[workbench] peek_nav_target 失败（菜单导航不可用）", e);
  }
}

function subscribeNavEvent() {
  // 终身订阅，不调 unlisten（与 subscribeFoldEvent 同款）。
  listen("focus-tab", () => {
    pullNavTarget();
  }).catch((e) => {
    console.warn("[workbench] focus-tab 订阅失败（持久目标 pull 兜底）", e);
  });
}

// 会话深链导航（spec §7.2，与信息行导航同一套双通路）：`focus-target` 事件是
// 快路径，`peek_focus_target` 持久目标是慢路径（窗口未建/未可见时 emit 丢掉的
// 点击留到 init/focus/visibilitychange 时命中）。拿到 `SessionDetail` → 切会话
// tab + showSession（最小对象，复用 openSessionFromFinding 范式——摘要卡缺字段
// 显示「—」，完整数字由 sessions_read 的 envelope 分区填）；拿到 `SessionList`
// → 切 tab + 设 host 过滤 + 重置分页 + 重新加载（v1 菜单不发射它，消费路径先
// 落地，等「查看全部会话」回归）。apply 后 clear 是单点；apply 失败也 clear
// （错误横幅已向用户说明，不无限重试，菜单再点会覆盖新目标）。
async function pullFocusTarget() {
  let t;
  try {
    t = await invoke("peek_focus_target");
  } catch (e) {
    console.warn("[workbench] peek_focus_target 失败（会话深链不可用）", e);
    return;
  }
  if (!t) return;
  try {
    if (t.type === "sessionDetail" && t.session_key) {
      switchTab("sessions");
      // showSession 摘要即时渲染，envelope 异步补齐——导航已生效即可 clear，
      // 不等 sessions_read（冷 cache 30s+，等它会让深链目标滞留整轮）。
      showSession({
        session_key: t.session_key,
        title: null,
        model: null,
        host_kind: t.session_key.host_kind || null,
      });
    } else if (t.type === "sessionList") {
      sessFilter = t.host_kind || "all";
      updateFilterChips();
      // loadSessions(true) 同步置 loaded，切 tab 的懒加载不会再叠一次请求。
      loadSessions(true);
      switchTab("sessions");
    }
    await invoke("clear_focus_target");
  } catch (e) {
    await invoke("clear_focus_target");
    console.warn("[workbench] 深链目标应用失败（已 clear，菜单再点会覆盖新目标）", e);
  }
}

function subscribeFocusTargetEvent() {
  // 终身订阅，不调 unlisten（与 subscribeNavEvent 同款）。
  listen("focus-target", () => {
    pullFocusTarget();
  }).catch((e) => {
    console.warn("[workbench] focus-target 订阅失败（持久目标 pull 兜底）", e);
  });
}

// ---------- tab 切换 ----------

let activeTab = "overview";
let calMonth = statisticsMonth();
let calSelectedDate = null; // 当日按小时面板选中的日期（null = 今天）
let calData = null;
let calMetric = "tokens"; // 日历主数：tokens 或按来源口径的成本
let sessState = { items: [], nextCursor: null, total: null, loaded: false, error: false };
// 会话列表 host 过滤（spec §7.3）："all" | "dsh" | "codex"。过滤变化重置分页
// （游标语义是「全量翻页」，带旧过滤的游标续拉会混页）；深链 SessionList 目标
// 也写这里。
let sessFilter = "all";
let sessStatusFilter = "all";
// Findings/数据源页同款懒加载：CLI 汇总较重（sessions_findings / sessions_list 都
// spawn 二进制），首进一次、之后「重载」按钮刷新——与 sessions 页同一套理由。
let findState = { loaded: false, error: false, data: null, sev: "all", rule: "all", expanded: {}, nextCursor: null, loadingMore: false };
let srcState = { loaded: false, error: false, sources: null, sync: null, paused: false };

function switchTab(name) {
  activeTab = name;
  document.querySelectorAll(".tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === name);
  });
  document.querySelectorAll(".tabpane").forEach((p) => {
    p.classList.toggle("active", p.id === "tab-" + name);
  });
  loadActiveTab();
}

async function loadActiveTab() {
  // 总览/日历的所有入口（切 tab、刷新按钮、窗口 focus、fold 事件）必须共用
  // wbPull：否则连续点刷新或频繁切回窗口仍会绕开事件桥的合并器，重叠查询同一
  // 份 SQL 数据。sessions/findings/sources 保留各自的懒加载语义，不进这里。
  if (activeTab === "overview" || activeTab === "calendar") {
    await refreshActiveTab();
  }
  // 会话页懒加载：首进一次，之后只在「重载列表 / 加载更多」时拉。切 tab 不重拉
  // 也不追加——反复 overview↔sessions 切着看，分页游标不能被一次切换吞掉一页。
  else if (activeTab === "sessions") { if (!sessState.loaded) loadSessions(); }
  // Findings / 数据源同款懒加载（CLI 汇总较重，见 state 注释）。
  else if (activeTab === "findings") { if (!findState.loaded) loadFindings(); }
  else if (activeTab === "sources") {
    await Promise.allSettled([loadSettingsData(), ...(!srcState.loaded ? [loadSources()] : [])]);
  }
}

// 聚焦刷新：与弹窗同款 —— 窗口每次重新获得焦点都重拉（hide 不是 close，数据要新鲜）。
// 会话页例外：CLI 列表较重，首进加载一次、之后用「重载列表」按钮；焦点只刷新
// 总览与日历两个便宜页。
window.addEventListener("focus", () => {
  // 菜单导航慢路径：窗口重新获得焦点时 pull 持久目标（窗口未可见时 emit 丢掉的
  // 那次点击在这里命中）。信息行与会话深链各一个 slot，都先 pull 再刷新——避免
  // pull 切 tab 后又按旧 activeTab 刷新。
  pullNavTarget();
  pullFocusTarget();
  refreshActiveTab();
});

// 可见性恢复（隐藏/显示、切走再切回）也是「窗口变得可见」——`show()` 后 focus
// 事件不一定跟着来（focus_session 的 show 早于 webview 完成可见），
// visibilitychange(visible) 兜底这条路径（spec §7.2 的 pull 触发点之一）。
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    pullNavTarget();
    pullFocusTarget();
  }
});

// ---------- 总览 ----------

// ---------- 总览 KPI helpers（v0.9 Stage D）----------
// 币种符号：by_provider 条目带 currency（Stage C），写符号不再是编造；
// null = 条目未声明单币，裸数字 + 「口径未声明」，不冒充任何币。
function curSymbol(cur) { return cur === "CNY" ? "\u00a5" : cur === "USD" ? "$" : ""; }
function fmtCur(amount, cur) {
  const v = (Math.round(amount * 100) / 100).toFixed(2);
  return curSymbol(cur) + v + (cur ? "" : "（币种未声明）");
}
const PROVIDER_LABEL = {
  anthropic: "Anthropic", minimax: "MiniMax", "zhipu-glm": "智谱 GLM",
  openai: "OpenAI", deepseek: "DeepSeek", "deepseek-official": "DeepSeek 官方", shengsuanyun: "胜算云",
  unknown: "未知提供方", unattributed: "未归属",
};
// 名义成本 = by_provider 各条目的官方标价折算之和（分币）——FixedSubscription
// 是月费不是标价折算，排除。
function nominalFromByProvider(byProvider) {
  const out = {}; // currency -> sum
  for (const [key, h] of Object.entries(byProvider || {})) {
    const cur = h.currency || "";
    for (const [basis, amt] of Object.entries(h.amounts_by_basis || {})) {
      if (basis === "fixed_subscription") continue;
      out[cur] = (out[cur] || 0) + amt;
    }
  }
  return out;
}
function fmtCurMap(m) {
  // 币序统一：CNY 优先（中文语境 + 主要支出是 ¥），USD 次之，其余币种按
  // 键序殿后——审查 #5：此前名义按插入序、实际按 Rust BTreeMap 序、日历头
  // 写死序，同一屏三种 $/¥ 排列。
  const rank = (c) => (c === "CNY" ? 0 : c === "USD" ? 1 : 2);
  return Object.entries(m || {}).filter(([, v]) => v > 0)
    .sort((a, b) => rank(a[0]) - rank(b[0]) || (a[0] < b[0] ? -1 : 1))
    .map(([c, v]) => fmtCur(v, c || null));
}
// 速览层混币折算（PM 决策 2026-09-07）：把 {CNY, USD, …} 金额 map 按
// `assets/pricing.json::fx_estimate` 的汇率（`Overview.fx = {usd_cny, as_of}`）
// 并成一个 `≈¥` 数——**是估算标签不是口径**。只用于名义 / 单位成本（速览层）；
// 实际支出 / 预算 / 双轨账 / 本月结论行永远分币不相加（那些是账单级口径）。
// 返回 null → 调用方退回分币旧行为，触发条件：无汇率 · map 为空 · 只有 CNY 一种
//（无需折算，不凭空长 `≈`）· 出现认不出的币种（宁可分币也不编一个折算数）。
function fxMerge(curMap, fx) {
  const rate = fx && Number(fx.usd_cny);
  if (!rate || !(rate > 0)) return null;
  const entries = Object.entries(curMap || {}).filter(([, v]) => v > 0);
  if (!entries.length) return null;
  if (entries.every(([c]) => c === "CNY")) return null; // 单币无需折算
  let cny = 0;
  for (const [c, v] of entries) {
    if (c === "CNY") cny += v;
    else if (c === "USD") cny += v * rate;
    else return null; // 认不出的币 → 分币，不折
  }
  return { cny, parts: fmtCurMap(curMap), rate, asOf: fx.as_of || null };
}
// `≈¥X`（折算总额）。原始分币走调用方的 hover title。
function fmtFxApprox(m) { return "≈" + fmtCur(m.cny, "CNY"); }
// 折算口径的人话副行片段：「混币按 ≈7.15 折算（2026-09）」。
function fxNote(m) {
  return "混币按 ≈" + m.rate + " 折算" + (m.asOf ? "（" + m.asOf + "）" : "");
}
function tokensSum(tokensByHost) {
  let unc = 0, read = 0, write = 0, out = 0, total = 0;
  for (const t of Object.values(tokensByHost || {})) {
    unc += t.uncached_input || 0; read += t.cache_read || 0;
    write += t.cache_write || 0; out += t.output || 0; total += t.total || 0;
  }
  const denom = unc + read + write;
  return { total, hit: denom > 0 ? read / denom : null };
}

// 跳到设置页某个分区（设置 tab 的内部名仍是 "sources"）。
function openSettingsSection(sectionId, focusId) {
  switchTab("sources");
  const section = document.getElementById(sectionId);
  if (section && section.scrollIntoView) section.scrollIntoView({ behavior: "smooth", block: "start" });
  const focus = focusId && document.getElementById(focusId);
  if (focus && focus.focus) focus.focus();
}

// 可信度两条状态行（IA 复核 §3.2）：「路由与缺价」和「价格覆盖」是两个轴，
// 不合成一个百分比。行的颜色只由 data_status.health 派生——此前把 unpriced
// 算成「100% 可计价」并上绿色强调色，同屏 health=warn 横幅还在说"金额可能为
// 估算"，专门传达可信的卡在说反话。
function trustRowLevel(health, hasIssue) {
  if (health === "critical") return "danger";
  if (hasIssue || (health && health !== "ok")) return "warn";
  return "ok";
}
// 全 ok → .compact（位置不变，只是不抢视线）。
function placeTrustRows(allOk) {
  const ul = document.getElementById("ov-trust-rows");
  if (ul && ul.classList && typeof ul.classList.toggle === "function") ul.classList.toggle("compact", allOk);
}
// 套餐提示当前的可见状态与影响 tokens（renderBillingImportCandidates 写入）——
// 归属缺口与待确认套餐同源时，⚠ 行不再自带按钮，指向唯一主动作。
// var 而非 let：verify-workbench-kpi-decide.mjs 在 vm 里从 sandbox 直接改它，
// 顶层 let 不会挂到 vm 全局上。
var billingPromptState = { visible: false, pendingTokens: 0 };
function renderTrustRows(status, monthly) {
  const route = document.getElementById("ov-trust-route");
  const price = document.getElementById("ov-trust-price");
  if (!route || !price) return;
  const finish = () => placeTrustRows(
    String(route.className).includes("notice ok") && String(price.className).includes("notice ok"));
  const setRow = (li, level, text, action) => {
    li.className = "notice " + level;
    const textEl = li.querySelector(".notice-text");
    if (textEl) textEl.textContent = text;
    const btn = li.querySelector(".notice-actions button");
    if (!btn) return;
    btn.hidden = !action;
    if (action) { btn.textContent = action.label; btn.onclick = action.onClick; }
  };
  const toDiagnostics = { label: "查看详情", onClick: () => openSettingsSection("settings-about", "ov-diagnostic-status") };
  const toPricing = { label: "查看价格表", onClick: () => openSettingsSection("settings-data", "ov-pricing-catalog-status") };
  price.hidden = false;
  if (!status || status.status !== "ok") {
    setRow(route, "danger", "读不到数据状态，无法确认这些数字是否完整", toDiagnostics);
    price.hidden = true;
    finish();
    return;
  }
  const d = status.data || {};
  const health = d.health || "ok";
  const unresolved = Math.max(0, Number(d.unresolved_tokens || 0));
  const unpriced = Math.max(0, Number(d.unpriced_tokens || 0));
  const total = monthly ? tokensSum(monthly.tokens_by_host).total : null;
  // 路由与缺价：未定 provider 的 token 让按量金额只能是下界。
  if (unresolved > 0) {
    // 同源判定：套餐提示可见且其影响范围盖住了这批 token → 同一件事，一个按钮。
    const sameSource = billingPromptState.visible && billingPromptState.pendingTokens >= unresolved;
    setRow(route, trustRowLevel(health, true),
      "有 " + fmtTokens(unresolved) + " tokens 还不知道是哪家服务商的，按量费用可能少算" +
        (sameSource ? "——确认下方套餐信息即可解决" : ""),
      sameSource ? null : toDiagnostics);
  } else if (health !== "ok") {
    setRow(route, trustRowLevel(health, false), "数据检查发现问题（" + health + "），数字可能不完整", toDiagnostics);
  } else {
    setRow(route, "ok", "所有用量都已归到对应服务商", null);
  }
  // 价格覆盖：名义成本能解释多少已观测用量（下钻到价格目录）。
  const pricingStale = !!(d.pricing && d.pricing.stale);
  if (total === null) {
    setRow(price, "warn", "本月用量暂不可读，无法核对价格完整性" +
      (unpriced > 0 ? "；有 " + fmtTokens(unpriced) + " tokens 缺少价格" : "") +
      (pricingStale ? "；价格表已过期" : ""), toPricing);
  } else if (!(total > 0)) {
    setRow(price, "ok", "本月还没有用量，暂无需核对价格", null);
  } else if (unpriced > 0) {
    const missing = Math.max(0, Math.min(1, unpriced / total));
    setRow(price, trustRowLevel(health, true),
      "有 " + fmtTokens(unpriced) + " tokens 的模型没有价格，按官方价折算的金额少算了约 " + fmtPct(missing) +
        (pricingStale ? "；价格表也已过期" : ""),
      toPricing);
  } else if (pricingStale) {
    setRow(price, trustRowLevel(health, true), "所有模型都有价格，但价格表已过期，按官方价折算的金额可能偏旧", toPricing);
  } else {
    setRow(price, "ok", "所有模型都有价格，按官方价折算没有漏算", toPricing);
  }
  // 两条都 ✓ → 合成一句，用户不需要读两行。
  const bothOk = String(route.className).includes("notice ok") && String(price.className).includes("notice ok");
  if (bothOk) {
    setRow(route, "ok", "数据完整：所有用量都已归到服务商，所有模型都有价格", toPricing);
    price.hidden = true;
  }
  finish();
}

// 首行来源状态：「3 个来源正常，1 个需检查」（规格 §4 第 87 行，详细卡在设置→数据源）。
// 只按 data_source_status 的连接状态计数；未探测到的来源单列为尚未接入。
function sourcesBrief(report) {
  const el = document.getElementById("ov-sources-brief");
  if (!el) return;
  if (!report || report.status !== "ok" || !Array.isArray(report.sources)) {
    el.textContent = "来源状态不可用";
    const a = document.getElementById("ov-sources-brief-action");
    if (a) a.hidden = true;
    return;
  }
  let okCount = 0, check = 0, notDetected = 0;
  for (const row of report.sources) {
    switch (row.connection_state) {
      case "connected": okCount += 1; break;
      case "needs_attention":
      case "paused":
      case "excluded": check += 1; break;
      case "not_detected": notDetected += 1; break;
      default: check += 1; break; // 未知状态不能冒充正常。
    }
  }
  const action = document.getElementById("ov-sources-brief-action");
  if (action) {
    action.hidden = !(check > 0);
    action.onclick = () => openSettingsSection("settings-sources");
  }
  if (okCount + check + notDetected === 0) { el.textContent = "尚未连接数据来源"; return; }
  const parts = [];
  if (okCount + check > 0) parts.push(okCount + " 个来源正常");
  if (check) parts.push(check + " 个需检查");
  if (notDetected) parts.push(notDetected + " 个尚未接入");
  el.textContent = parts.join("，");
}

// 卡片入口（第三档 CTA）：导航，不是待办。绑定一次。
function bindOverviewLinks() {
  const bind = (id, fn) => {
    const el = document.getElementById(id);
    if (!el || el.dataset.bound === "1") return;
    el.dataset.bound = "1";
    el.onclick = fn;
  };
  const toCalendar = (selectToday) => {
    calMonth = statisticsMonth();
    calSelectedDate = selectToday ? statisticsToday() : null;
    switchTab("calendar");
  };
  bind("ov-link-spend", () => {
    const target = document.getElementById("ov-dual-title");
    if (target && target.scrollIntoView) target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  bind("ov-link-today", () => toCalendar(true));
  bind("ov-link-usage", () => toCalendar(false));
  bind("ov-link-days", () => toCalendar(false));
  bind("ov-link-budget", () => openSettingsSection("settings-budget", "ov-budget-monthly-amount"));
  bind("ov-link-set-budget", () => openSettingsSection("settings-budget", "ov-budget-monthly-amount"));
  bind("ov-link-plans", () => openSettingsSection("settings-billing"));
  bind("ov-link-billing", () => openSettingsSection("settings-billing"));
}

// B1-M1.1: command/section contract (spec §4). Raw DTOs stay at this boundary;
// renderers receive validated values or null, with normalized errors kept separately.
const overviewRecord = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const overviewNumber = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;
const overviewAmounts = (v) => overviewRecord(v) && Object.values(v).every(overviewNumber);
function overviewSummaryValid(v) {
  return overviewRecord(v) && overviewRecord(v.tokens_by_host)
    && Object.values(v.tokens_by_host).every((t) => overviewRecord(t)
      && ["total", "uncached_input", "cache_read", "cache_write", "output"].every((k) => overviewNumber(t[k])))
    && overviewRecord(v.by_provider) && overviewRecord(v.by_host)
    && Object.values(v.by_provider).every((p) => overviewRecord(p) && overviewAmounts(p.amounts_by_basis)
      && (p.currency === null || typeof p.currency === "string"))
    && Object.values(v.by_host).every(overviewRecord)
    && overviewAmounts(v.total_actual_spend) && overviewRecord(v.actual_spend_by_basis)
    && Object.values(v.actual_spend_by_basis).every(overviewAmounts);
}
const overviewList = (key, fields) => (v) => overviewRecord(v) && v.status === "ok" && Array.isArray(v[key])
  && v[key].every((item) => overviewRecord(item) && fields.every((field) => typeof item[field] === "string"));
const OVERVIEW_REQUESTS = Object.freeze([
  { key: "overview", command: "read_overview", sections: ["sync", "budget", "fx"],
    valid: (v) => overviewRecord(v) && overviewRecord(v.sync) && typeof v.sync.ok === "boolean"
      && typeof v.sync.at === "string" },
  { key: "monthly", command: "data_monthly_summary", sections: ["spend", "usage", "breakdown", "decide"],
    args: (w) => ({ month: w.month }), valid: overviewSummaryValid },
  { key: "daily", command: "data_daily_summary", sections: ["today"],
    args: (w) => ({ date: w.date }), valid: overviewSummaryValid },
  { key: "calendar", command: "read_calendar_month", sections: ["recent-days"],
    args: (w) => ({ month: w.month }), valid: (v) => overviewRecord(v) && overviewRecord(v.days)
      && Object.entries(v.days).every(([date, d]) => /^\d{4}-\d{2}-\d{2}$/.test(date) && date.startsWith(v.month + "-")
        && overviewRecord(d) && overviewNumber(d.total_tokens)
        && ["dsh_cost_cny", "claude_cost_cny", "claude_cost_usd", "codex_cost_usd"].every((k) => d[k] == null || overviewNumber(d[k]))) },
  { key: "sources", command: "data_source_status", sections: ["sources"], valid: overviewList("sources", ["host", "connection_state"]) },
  { key: "quality", command: "data_status", sections: ["trust"],
    valid: (v) => overviewRecord(v) && v.status === "ok" && overviewRecord(v.data)
      && typeof v.data.health === "string" && overviewNumber(v.data.unresolved_tokens)
      && overviewNumber(v.data.unpriced_tokens) && overviewRecord(v.data.pricing)
      && typeof v.data.pricing.stale === "boolean" },
  { key: "quota", command: "data_codex_quota", sections: ["decide"],
    valid: (v) => v === null || (overviewRecord(v) && typeof v.plan_type === "string"
      && (v.limits == null || (overviewRecord(v.limits) && Object.values(v.limits).every((w) => overviewRecord(w)
        && (w.used_percent == null || overviewNumber(w.used_percent))
        && (w.resets_at == null || overviewNumber(w.resets_at)))))
      && typeof v.observed_at === "string") },
  { key: "candidates", command: "billing_import_candidates", sections: ["billing"], valid: (v) => overviewList("candidates", ["candidate_id", "host", "provider_id", "status", "currency", "billing_period_start"])(v)
      && v.candidates.every((c) => overviewNumber(c.amount_minor) && (c.impact == null ||
        (overviewRecord(c.impact) && (c.impact.status !== "ok" ||
          ["total_tokens", "fact_count", "session_count"].every((k) => overviewNumber(c.impact[k])))))) },
  { key: "declarations", command: "billing_declarations", sections: ["billing"], valid: overviewList("declarations", ["declaration_id", "host", "provider_id", "relationship_kind", "effective_start", "current_revision_id"]) },
  { key: "jobs", command: "billing_recalculation_jobs", sections: ["billing"], valid: overviewList("jobs", ["job_id", "status"]) },
]);

async function loadOverviewData() {
  await loadStatisticsTimezonePreference();
  // Capture once, including if midnight occurs while independent IPC calls settle.
  const date = statisticsToday();
  const window = { date, month: date.slice(0, 7) };
  const results = await Promise.allSettled(OVERVIEW_REQUESTS.map(async (request) => {
    const value = await invoke(request.command, request.args ? request.args(window) : undefined);
    if (value && value.status === "unavailable") {
      throw { code: value.code || "source-unavailable", message: value.reason || "数据源不可用", recovery_action: value.recovery_action };
    }
    const matchesWindow = request.key === "daily" ? value && value.date === window.date
      : ["monthly", "calendar"].includes(request.key) ? value && value.month === window.month : true;
    if (!matchesWindow || !request.valid(value)) throw { code: "schema-mismatch", message: request.command + " DTO 不兼容" };
    return value;
  }));
  const data = {}, errors = {};
  results.forEach((result, index) => {
    const key = OVERVIEW_REQUESTS[index].key;
    data[key] = result.status === "fulfilled" ? result.value : null;
    if (result.status === "rejected") {
      errors[key] = normErr(result.reason);
      const action = result.reason && result.reason.recovery_action;
      if (overviewRecord(action) && typeof action.kind === "string") errors[key].recovery_action = action;
    }
  });
  return { window, data, errors };
}

// Settings-only reads start when the Settings (sources) tab is entered.
// 已有账单：只读展示（规格 §4.2、§7 D3）。录入表单与 CSV 导入是 Beta 延期
// 能力，DOM 保留但不显示；这里不再调用 renderHostBills（它绑定的是隐藏表单）。
// 左栏导航高亮：滚动到哪个分区，对应导航项加 .current（规格 §3.1）。锚点跳转
// 本身用原生 <a href="#id">，这里只负责高亮，不拦截点击。
let settingsNavBound = false;
function bindSettingsNav() {
  if (settingsNavBound) return;
  // document.querySelector 在真实浏览器里总有；guard 只是为了不让这个纯装饰性的
  // 高亮功能在缺 DOM API 的宿主（测试沙箱、未来非浏览器渲染）里把整个
  // loadSettingsData() 拖下水——同步抛出会让上面六个设置读取一个都不跑
  // （Promise.allSettled 接的是 loadSettingsData() 这一个 promise，不是内部
  // 每条 invoke，函数体前段抛出会让整个 await 链路提前失败）。
  if (typeof document.querySelector !== "function") return;
  const nav = document.querySelector(".settings-nav");
  const sections = document.querySelectorAll(".settings-section[id]");
  if (!nav || !sections.length || typeof IntersectionObserver !== "function") return;
  settingsNavBound = true;
  const linkFor = (id) => nav.querySelector('a[href="#' + id + '"]');
  const setCurrent = (id) => {
    nav.querySelectorAll("a").forEach((a) => a.classList.remove("current"));
    const link = linkFor(id);
    if (link) link.classList.add("current");
  };
  if (sections[0]) setCurrent(sections[0].id);
  const observer = new IntersectionObserver((entries) => {
    const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (visible[0]) setCurrent(visible[0].target.id);
  }, { rootMargin: "-10% 0px -70% 0px" });
  sections.forEach((section) => observer.observe(section));
}

async function renderBillsReadOnly(period) {
  const section = document.getElementById("settings-bills");
  const list = document.getElementById("settings-bills-list");
  if (!section || !list) return;
  try {
    const report = await invoke("host_bills_for_period", { billingPeriod: period });
    const bills = report && report.status === "ok" ? (report.bills || []) : [];
    section.hidden = !bills.length;
    list.textContent = "";
    for (const bill of bills) {
      const row = document.createElement("div");
      row.className = "billing-review-row";
      row.textContent = (HOST_DISPLAY[bill.host] || bill.host) + " · " + bill.provider_id + " · " +
        (bill.billing_basis || "") + " · " + fmtCur(Number(bill.amount_minor || 0) / 100, bill.currency);
      list.appendChild(row);
    }
  } catch (_) { section.hidden = true; }
}

async function loadSettingsData() {
  bindSettingsNav();
  bindDiagnosticExport();
  bindUpdateCheck();
  bindTrustedReleasesPage();
  await Promise.allSettled([
    renderBillsReadOnly(statisticsMonth()), renderRetentionSettings(),
    renderStatisticsTimezoneSettings(), renderPricingCatalogSettings(),
    renderAboutDiagnostics(), renderBudgetSettings(),
  ]);
}

async function renderOverview() {
  bindOverviewLinks();
  const { data, errors, window: overviewWindow } = await loadOverviewData();
  const { daily, monthly, calendar: cal, overview: ov } = data;
  const unavailable = (key) => ({ status: "unavailable", ...errors[key], reason: errText(errors[key]) });
  const quality = data.quality || unavailable("quality");
  renderQualityStatus(quality);
  sourcesBrief(data.sources);
  renderBillingImportCandidates(data.candidates || unavailable("candidates"));
  renderTrustRows(quality, monthly);
  renderBillingDeclarations(data.declarations || unavailable("declarations"));
  renderBillingRecalculationJobs(data.jobs || unavailable("jobs"));
  renderOverviewDays(cal);
  renderSpendCards(daily, monthly, ov && ov.fx, overviewWindow);
  bindSummaryExport(monthly);
  renderDualTrack(monthly);
  renderDecideCard(monthly, data.quota);
  const overview = ov || { sync: { ok: false, stage: "unavailable", message: "暂无法读取同步状态" } };
  syncDot(overview.sync);
  renderFirstRunState(overview.sync);
  renderNoRecordsState(overview.sync, data.sources);

  // 预算 —— 读后端权威（level/ratio/snooze/reasons），不重算百分比。口径 =
  // 跨宿主「按量实付」CNY（PM 决策 2026-09-07）。`source` 两态都是权威：
  // "alert" = 旧 alert.json 快照（带 generated_at，可能过期）；"sql" = SQL
  // 权威库**实时算**（无快照时刻 → generated_at null，结构上不会过期，新鲜度
  // 归下方「上次同步」行）。Phase 4.3 托盘已切 "sql"，工作台这里此前漏改，
  // 一直落进「等预算数据」兜底（screenshot 事故）。"missing" 才是真降级。
  const b = overview.budget || { source: "missing" };
  const budgetValid = overviewRecord(b) && ["sql", "alert"].includes(b.source)
    && ["no_budget", "ok", "warn", "over", "snoozed", "disabled"].includes(b.level) && (b.level === "no_budget" ||
      (overviewNumber(b.monthly_cny) && b.monthly_cny > 0 && overviewNumber(b.month_cost) && overviewNumber(b.month_ratio)))
    && (b.effective_daily_budget == null || overviewNumber(b.effective_daily_budget))
    && (b.reasons == null || (Array.isArray(b.reasons) && b.reasons.every((r) => typeof r === "string")));
  const budgetLive = b.source === "sql"; // 实时算：无 generated_at 不代表「没产出」
  const fill = document.getElementById("ov-budget-fill");
  const budgetSub = document.getElementById("ov-budget-sub");
  const budgetAmt = document.getElementById("ov-budget-amount");
  const budgetCard = document.getElementById("ov-budget-card");
  budgetSub.title = "";
  const denom = b.monthly_cny;
  // 规格 §4 第 80 行：预算「仅配置后出现摘要卡；未配置不显示 0%」。可见性由
  // 这里决定（仅 no_budget 隐藏；不可读显示降级说明），不得再用 CSS 无条件藏卡
  // ——那样 JS 写了读数、用户却看不到，且 vm 测试对 display:none 免疫。
  const budgetConfigured = (b.source === "alert" || b.source === "sql") && b.level && b.level !== "no_budget";
  if (budgetCard) budgetCard.hidden = budgetValid && b.level === "no_budget";
  const setBudgetLink = document.getElementById("ov-link-set-budget");
  if (setBudgetLink) setBudgetLink.hidden = budgetConfigured;
  // 新鲜度先算好——预算卡片自己也要用，不能只靠页面最下面那行 note。真实事故
  // （2026-09-01）：alert.json 停在 8 月最后一次 oneline（两天前），总览把它的
  // 292% 超支当"本月"现状展示，旁边的"本月"卡片同一时刻已经因为按当月过滤
  // 显示 ¥0——两个数字自相矛盾却都没有任何过期标记，用户没法从卡片本身判断
  // "这是不是真的"。5 分钟阈值与 `stale_from`（`lib.rs`，托盘文案用的同一个
  // 判据）保持一致，不新发明一套。
  let stale = false;
  let freshHHMM = "";
  if (budgetValid && b.generated_at && Number.isFinite(Date.parse(b.generated_at))) {
    const t = new Date(b.generated_at);
    freshHHMM = formatStatisticsDateTime(t, { hour: "2-digit", minute: "2-digit", hour12: false });
    stale = Date.now() - t.getTime() > 5 * 60 * 1000;
  }
  if (!budgetValid || (b.source !== "alert" && b.source !== "sql") || !b.level) {
    fill.style.width = "0%";
    fill.className = "fill";
    budgetAmt.textContent = "—";
    budgetSub.textContent = "预算状态暂不可读，请刷新重试";
  } else if (b.level === "no_budget") {
    fill.style.width = "0%";
    fill.className = "fill";
    budgetAmt.textContent = "—";
    budgetSub.textContent = "尚未设置预算 · 成本统计不受影响";
  } else {
    const ratio = Math.min(1, b.month_ratio);
    const daily =
      b.effective_daily_budget != null ? " · 日预算 " + fmtMoney(b.effective_daily_budget) : "";
    fill.style.width = fmtPct(ratio);
    const levelCls =
      b.level === "over" ? " danger" : b.level === "warn" ? " warn" : "";
    fill.className = "fill" + levelCls;
    // 大字 = 已用 / 预算（钱），副行 = 百分比 + 日预算 + 剩余天数；不把 68% 说两遍。
    budgetAmt.textContent = fmtMoney(b.month_cost) + " / " + fmtMoney(denom);
    const todayKeyB = overviewWindow.date;
    const daysInMonth = new Date(Number(todayKeyB.slice(0, 4)), Number(todayKeyB.slice(5, 7)), 0).getDate();
    const daysLeft = Math.max(0, daysInMonth - Number(todayKeyB.slice(8)));
    const tail = daily + " · 本月剩 " + daysLeft + " 天";
    if (b.level === "over") {
      budgetSub.textContent = "已超预算 " + fmtMoney(Math.max(0, (b.month_cost) - denom)) + tail;
    } else if (b.level === "snoozed") {
      budgetSub.textContent = "提醒已静默" + (b.snoozed_until ? "至 " + b.snoozed_until : "") + tail;
    } else if (b.level === "disabled") {
      budgetSub.textContent = "预算提醒已关闭" + tail;
    } else {
      budgetSub.textContent = "已用 " + fmtPct(b.month_ratio) + tail;
    }
    // 过期时把警告直接贴在数字旁边，不指望用户往下翻到页尾的 note 才看到——
    // 这条数字本身可能是几天前的旧账（比如日历月翻了页但当天还没有新会话
    // 触发过重新评估），过期提示必须跟数字长在一起。
    if (stale) {
      budgetSub.textContent = "⚠ 数据截至 " + freshHHMM + "，可能不是最新 · " + budgetSub.textContent;
    }
    budgetSub.title = (b.reasons || []).join("\n");
  }

  // 新鲜度 + 同步状态 + 立即同步（与弹窗同一套 poll-at-change 回路）。
  let freshness = "";
  if (budgetValid && b.generated_at && Number.isFinite(Date.parse(b.generated_at))) {
    freshness = stale ? "⚠ 数据过期（更新于 " + freshHHMM + "）" : "数据更新于 " + freshHHMM;
  } else if (budgetLive) {
    // 实时算无快照时刻——新鲜度由下方「上次同步」行统一承载（facts 同步是
    // 另一条回路），这里不说「尚未产出」（会误读成坏了）。
    freshness = "预算按最新数据实时计算";
  } else {
    freshness = "预算数据尚未生成";
  }
  const sync = overview.sync || { ok: false, stage: "never", message: "尚未同步" };
  const syncStatus = document.getElementById("ov-sync-status");
  const syncNow = document.getElementById("ov-sync-now");
  if (sync.stage === "paused") {
    syncStatus.textContent = "自动同步已暂停（到数据源页恢复）";
    syncStatus.title = sync.message || "恢复前不会读取新的本地日志";
    syncNow.hidden = true;
  } else if (sync.ok) {
    // sync.at 形状出处：overview.rs SyncStatus::ok → local_timestamp_text
    // "YYYY-MM-DD HH:MM:SS"（统计时区本地时间），slice(11,16) 即本地 HH:MM。
    syncStatus.textContent = sync.at ? "已更新 " + sync.at.slice(11, 16) : "已同步";
    syncStatus.title = sync.message + (sync.at ? "（" + sync.at + "）" : "");
    syncNow.hidden = true;
  } else if (sync.stage === "never") {
    syncStatus.textContent = "尚未同步（点右侧立即同步）";
    syncNow.hidden = false;
  } else {
    syncStatus.textContent = "⚠ 上次同步失败：" + (sync.message || "未知原因");
    syncStatus.title = sync.message;
    syncNow.hidden = false;
  }
  syncNow.disabled = false;
  bindOverviewSync(sync, syncNow, syncStatus);

  // 数据根简写放设置→关于（规格 §4 第 95 行），不再经 note 漏回首屏。
  document.getElementById("ov-note").textContent = freshness + " · " + (overview.estimate_note || "");

  // 「数据源」面板已并入费用明细（renderDualTrack 每行带 by_host 新鲜度）；
  // 详细数据源卡在设置→数据源。
}

// Keep the existing 10 × 1s manual-sync poll and event-bridge suppression.
function bindOverviewSync(sync, syncNow, syncStatus) {
  syncNow.onclick = async () => {
    syncNow.disabled = true;
    syncStatus.textContent = "同步中…";
    const before = sync.at || "";
    // 事件桥与手点同刻完成：手动 poll 自己会重拉，事件到达时跳过（见
    // subscribeFoldEvent）。用 finally 保证任何出口（成功/失败/return）都复位，
    // 漏复位会让之后的事件全被误吞。
    manualSyncPolling = true;
    try {
      await invoke("trigger_sync");
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const o = await invoke("read_overview");
        if (o.sync && (o.sync.at || "") !== before) {
          renderOverview();
          return;
        }
      }
      renderOverview();
    } catch (e2) {
      syncStatus.textContent = "同步请求失败：" + errText(e2);
      syncNow.disabled = false;
    } finally {
      manualSyncPolling = false;
    }
  };
}

function bindDiagnosticExport() {
  const button = document.getElementById("ov-diagnostic-export");
  const status = document.getElementById("ov-diagnostic-status");
  if (!button || !status || button.dataset.bound === "1") return;
  button.dataset.bound = "1";
  button.onclick = async () => {
    button.disabled = true;
    status.hidden = false;
    status.textContent = "正在准备脱敏诊断包…不会上传本地数据。";
    try {
      const result = await invoke("export_diagnostic_package");
      status.textContent = result && result.status === "cancelled"
        ? "已取消保存。"
        : "诊断包已保存到你选择的位置；是否提交由你决定。";
    } catch (e) {
      status.textContent = "保存诊断包失败：" + errText(e);
    } finally {
      button.disabled = false;
    }
  };
}

function bindTrustedReleasesPage() {
  const button = document.getElementById("ov-releases-open");
  if (!button || button.dataset.bound === "1") return;
  button.dataset.bound = "1";
  button.onclick = async () => {
    button.disabled = true;
    try {
      await invoke("open_trusted_releases_page");
    } catch (e) {
      const target = document.getElementById("ov-diagnostic-status");
      if (target) { target.hidden = false; target.textContent = "打开发布页失败：" + errText(e); }
    } finally { button.disabled = false; }
  };
}

function bindUpdateCheck() {
  const button = document.getElementById("ov-update-check");
  const status = document.getElementById("ov-diagnostic-status");
  if (!button || !status || button.dataset.bound === "1") return;
  button.dataset.bound = "1";
  button.onclick = async () => {
    button.disabled = true;
    status.hidden = false;
    status.textContent = "正在检查可信发布页…不会上传本地数据。";
    try {
      const result = await invoke("check_for_updates");
      status.textContent = result && result.latest_tag
        ? "当前包 " + (result.current_version || "—") + " · 最新发布 " + result.latest_tag + "；请从可信发布页确认安装。"
        : "未找到可用的 app-v 发布。";
    } catch (e) {
      status.textContent = "检查新版本失败：" + errText(e);
    } finally { button.disabled = false; }
  };
}

async function renderAboutDiagnostics() {
  const target = document.getElementById("ov-about-versions");
  if (!target || target.dataset.loaded === "1") return;
  // 常显版本表（规格 §4.5、B11）：App/CLI/数据库 schema/价格目录四行，不折叠。
  const row = (dt, dd) => {
    const t = document.createElement("dt"); t.textContent = dt;
    const d = document.createElement("dd"); d.textContent = dd;
    return [t, d];
  };
  try {
    const d = await invoke("about_diagnostics");
    const pricing = d && d.pricing
      ? (d.pricing.version + " · 捕获于 " + formatStatisticsDateTime(d.pricing.captured_at_ms))
      : "暂无价格快照";
    const sync = d && d.sync ? ((d.sync.ok ? "正常" : "需检查") + " · " + (d.sync.message || "")) : "暂无同步回执";
    target.textContent = "";
    target.append(
      ...row("App", d.app_version || "—"),
      ...row("CLI", d.cli_version || "未找到"),
      ...row("Engine", d.engine_version || "—"),
      ...row("架构", d.architecture || "—"),
      ...row("Authority schema", d.authority_schema || "—"),
      ...row("统计时区", d.statistics_timezone || "—"),
      ...row("价格目录", pricing),
      ...row("同步", sync),
    );
    target.dataset.loaded = "1";
  } catch (e) {
    target.textContent = "";
    target.append(...row("状态", "版本诊断读取失败：" + errText(e)));
  }
}

function renderFirstRunState(sync) {
  const panel = document.getElementById("ov-first-run");
  const sources = document.getElementById("ov-first-run-sources");
  const pause = document.getElementById("ov-first-run-pause");
  if (!panel || !sources || !pause) return;
  panel.hidden = !sync || sync.stage !== "never";
  if (!sources.dataset) sources.dataset = {};
  if (sources.dataset.bound === "1") return;
  sources.dataset.bound = "1";
  sources.onclick = () => switchTab("sources");
  pause.onclick = async () => {
    pause.disabled = true;
    try {
      await invoke("set_sync_paused", { paused: true });
      await renderOverview();
    } catch (e) {
      pause.disabled = false;
      console.warn("暂停解析失败", e);
    }
  };
}

function renderNoRecordsState(sync, report) {
  const panel = document.getElementById("ov-no-records");
  const sourcesButton = document.getElementById("ov-no-records-sources");
  const sampleButton = document.getElementById("ov-no-records-sample");
  const sample = document.getElementById("ov-no-records-sample-content");
  if (!panel || !sourcesButton || !sampleButton || !sample) return;
  panel.hidden = true;
  if (!sync || !sync.ok || sync.stage === "never" || sync.stage === "paused") return;
  // Failed source reads are not evidence of an empty database.
  if (!report || report.status !== "ok") return;
  const sources = report.sources;
  panel.hidden = sources.some((source) => {
    const scan = source.scan || {};
    const imported = source.import_scope || {};
    return Number(scan.source_count || 0) > 0 || Number(imported.sessions || 0) > 0;
  });
  if (sourcesButton.dataset.bound === "1") return;
  sourcesButton.dataset.bound = "1";
  sourcesButton.onclick = () => switchTab("sources");
  sampleButton.onclick = () => {
    sample.hidden = !sample.hidden;
    sample.textContent = sample.hidden
      ? ""
      : "演示样例（不会写入你的数据）：今天 126K tokens · 名义成本 ≈¥4.20 · 数据源：示例。";
    sampleButton.textContent = sample.hidden ? "查看样例" : "收起样例";
  };
}

function renderQualityStatus(status) {
  const banner = document.getElementById("ov-quality-banner");
  if (!banner) return;
  banner.hidden = true;
  banner.textContent = "";
  banner.className = "notice danger";
  if (!status || status.status !== "ok") {
    banner.hidden = false;
    const code = status && status.code;
    banner.appendChild(document.createTextNode(
      "⚠ " + (ERR_TEXT[code] || "权威数据状态不可用") + "：" +
      ((status && status.reason) || "未知原因")
    ));
    const action = status && status.recovery_action;
    if (action && action.kind) {
      const button = document.createElement("button");
      button.className = "btn secondary";
      button.type = "button";
      button.textContent = action.label || "查看恢复选项";
      button.style.marginLeft = "8px";
      button.onclick = async () => {
        if (action.kind === "export_diagnostics") {
          button.disabled = true;
          try {
            await invoke("export_diagnostic_package");
            button.textContent = "诊断包已保存";
          } catch (e) {
            button.textContent = "保存失败：" + errText(e);
            button.disabled = false;
          }
        } else if (action.kind === "restore_backup") {
          if (!window.confirm("选择一个已验证的权威数据库备份并恢复？\n\n当前数据库会先保留为 .pre-restore 备份；不会删除宿主原始日志。")) return;
          button.disabled = true;
          try {
            const restored = await invoke("restore_authority_backup");
            button.textContent = restored && restored.status === "cancelled"
              ? "已取消选择备份"
              : "备份已恢复，正在重新加载…";
            if (restored && restored.status === "restored") {
              window.setTimeout(() => window.location.reload(), 250);
            }
          } catch (e) {
            button.textContent = "恢复失败：" + errText(e);
            button.disabled = false;
          }
        } else if (action.kind === "upgrade_app") {
          button.textContent = "请安装新版本后重试";
        } else {
          switchTab("sources");
        }
      };
      banner.appendChild(button);
    }
    return;
  }
  // 路由/缺价/价格快照的 warn 级信息由两条可信度状态行承载（renderTrustRows），
  // 不再在这里重复成横幅——同一事实说两遍是 IA 复核抓到的问题。横幅只留
  // critical：权威库 integrity 失败，恢复 = rm + data-migrate，必须最显眼。
  const d = status.data || {};
  if (d.health !== "critical") return;
  banner.hidden = false;
  banner.textContent = "⚠ 权威数据健康状态 critical：金额与用量可能不完整，请到设置→关于与诊断查看恢复选项。";
}

function billingCandidateAmount(candidate) {
  const amount = Number(candidate.amount_minor || 0) / 100;
  if (candidate.currency === "CNY") return fmtMoney(amount) + "/月";
  return amount.toFixed(2) + " " + (candidate.currency || "") + "/月";
}

function budgetProfileLevelText(level) {
  return {
    ok: "正常",
    warn: "接近预算",
    exceeded: "已超预算",
    incomplete: "部分覆盖",
    no_data: "无数据",
    disabled: "未启用",
  }[level] || String(level || "未知状态");
}

function budgetProfileStatusText(profile) {
  if (!profile || !profile.level) return "尚未配置此预算口径";
  const currency = profile.currency || "";
  const monthlyLevel = budgetProfileLevelText(profile.level);
  // no_data / disabled 是事实状态，不得用 spent_minor 的默认 0 伪装成
  // “已用 0”。incomplete 可以展示已知下界，但要明确仍有未覆盖用量。
  let monthly = "本月：" + monthlyLevel;
  if (profile.level === "incomplete") {
    monthly += " · 至少已用 " + String(profile.spent_minor ?? "—") + " " + currency + "，仍有未覆盖用量";
  } else if (!["no_data", "disabled"].includes(profile.level)) {
    monthly += " · 已用 " + String(profile.spent_minor ?? "—") + " " + currency;
  }
  if (!profile.daily_level || profile.daily_level === "disabled") return monthly;
  const dailyLevel = budgetProfileLevelText(profile.daily_level);
  let daily = "；今日：" + dailyLevel;
  if (profile.daily_level === "incomplete") {
    daily += " · 至少已用 " + String(profile.daily_spent_minor ?? "—") + " " + currency + "，仍有未覆盖用量";
  } else if (profile.daily_level !== "no_data") {
    daily += " · 已用 " + String(profile.daily_spent_minor ?? "—") + " " + currency;
  }
  return monthly + daily;
}

let billingDeclarationCandidate = null;
let billingDeclarationState = null;
let billingReviewOpen = false;

async function renderBudgetSettings() {
  const currencySelect = document.getElementById("ov-budget-currency");
  const monthly = document.getElementById("ov-budget-monthly-amount");
  const daily = document.getElementById("ov-budget-daily-amount");
  const save = document.getElementById("ov-budget-save");
  const status = document.getElementById("ov-budget-settings-status");
  const legacy = document.getElementById("ov-budget-legacy");
  const legacyText = document.getElementById("ov-budget-legacy-text");
  const live = document.getElementById("ov-budget-live");
  const snoozeText = document.getElementById("ov-budget-snooze-text");
  const snoozeDay = document.getElementById("ov-budget-snooze-day");
  const snoozeClear = document.getElementById("ov-budget-snooze-clear");
  const confirmedBox = document.getElementById("ov-budget-confirmed");
  const confirmedText = document.getElementById("ov-budget-confirmed-text");
  if (!currencySelect || !monthly || !daily || !save || !status || !legacy || !live ||
      !snoozeDay || !snoozeClear || !confirmedBox) return;

  const updateSymbols = () => {
    const symbol = currencySelect.value === "USD" ? "$" : "¥";
    document.querySelectorAll(".ov-budget-symbol").forEach((el) => { el.textContent = symbol; });
  };
  currencySelect.onchange = updateSymbols;

  let estimateProfile = null;
  try {
    const [config, profileStatus, ov] = await Promise.all([
      invoke("budget_config"),
      invoke("budget_profiles_status", { month: statisticsMonth() }),
      invoke("read_overview").catch(() => null),
    ]);
    // 旧版 config.toml/兼容表预算：只读提示，不再提供编辑入口（规格 §4.3.3）；
    // 保存下面的表单后以新预算（estimate profile）为准，不自动转换口径。
    if (config && config.status === "ok" && config.origin === "legacy_import") {
      legacy.hidden = false;
      legacyText.textContent = "检测到旧版预算 " + fmtMoney(Number(config.monthly_cny_minor || 0) / 100) +
        "/月。它仍在生效；保存下面的预算后将以新预算为准。";
    } else {
      legacy.hidden = true;
    }
    const profiles = profileStatus && profileStatus.status === "ok" ? (profileStatus.profiles || []) : [];
    estimateProfile = profiles.find((p) => p.profile_id === "estimate") || null;
    if (estimateProfile) {
      currencySelect.value = estimateProfile.currency || "CNY";
      monthly.value = estimateProfile.monthly_minor != null ? (Number(estimateProfile.monthly_minor) / 100).toFixed(2) : "";
      daily.value = estimateProfile.daily_minor != null ? (Number(estimateProfile.daily_minor) / 100).toFixed(2) : "";
    }
    updateSymbols();
    live.hidden = !(estimateProfile && estimateProfile.level);
    if (estimateProfile && estimateProfile.level) live.textContent = budgetProfileStatusText(estimateProfile);
    const confirmedProfile = profiles.find((p) => p.profile_id === "confirmed" && p.monthly_minor != null);
    confirmedBox.hidden = !confirmedProfile;
    if (confirmedProfile && confirmedText) confirmedText.textContent = budgetProfileStatusText(confirmedProfile);
    // 静默状态目前只挂在旧 alert 链路（`read_overview().budget.snoozed_until`）；
    // 一个静默同时压住 profile 通知和旧版通知（budget_alerts.rs 的读取顺序）。
    const snoozedUntil = ov && ov.budget && ov.budget.snoozed_until;
    const snoozedActive = !!snoozedUntil && Date.parse(snoozedUntil) > Date.now();
    snoozeDay.hidden = snoozedActive;
    snoozeClear.hidden = !snoozedActive;
    snoozeText.textContent = snoozedActive
      ? "本周期提醒已静默至 " + formatStatisticsDateTime(new Date(snoozedUntil), { month: "2-digit", day: "2-digit" }) + "。"
      : "";
  } catch (_) { /* 预算读取失败不遮蔽总览；表单保持空态可直接填写 */ }

  if (save.dataset.bound === "1") return;
  save.dataset.bound = "1";
  const refreshAfterBudgetAction = async (message) => {
    status.hidden = false;
    status.textContent = message;
    await renderBudgetSettings();
    await renderOverview();
  };
  snoozeDay.onclick = async () => {
    snoozeDay.disabled = true;
    try {
      await invoke("snooze_budget_current_period");
      await refreshAfterBudgetAction("提醒已静默至本周期结束；用量与成本统计仍会继续更新。");
    } catch (e) {
      status.hidden = false;
      status.textContent = "静默失败：" + errText(e);
    } finally {
      snoozeDay.disabled = false;
    }
  };
  snoozeClear.onclick = async () => {
    snoozeClear.disabled = true;
    try {
      await invoke("clear_budget_snooze");
      await refreshAfterBudgetAction("提醒已恢复。");
    } catch (e) {
      status.hidden = false;
      status.textContent = "恢复失败：" + errText(e);
    } finally {
      snoozeClear.disabled = false;
    }
  };
  save.onclick = async () => {
    const m = Math.round(Number(monthly.value) * 100);
    const dailyText = daily.value.trim();
    const d = dailyText === "" ? null : Math.round(Number(dailyText) * 100);
    status.hidden = false;
    if (!Number.isSafeInteger(m) || m <= 0 || (d !== null && (!Number.isSafeInteger(d) || d <= 0))) {
      status.textContent = "请填写正数月预算；日预算可留空。";
      return;
    }
    save.disabled = true;
    try {
      const saved = await invoke("save_budget_profile", { input: {
        profile_id: "estimate", currency: currencySelect.value, monthly_minor: m,
        daily_minor: d, warning_ratio_bp: 8000,
      } });
      const permission = saved && saved.notification_permission;
      status.textContent = "已保存 " + formatStatisticsDateTime(new Date(), { hour: "2-digit", minute: "2-digit" }) + "。" +
        (permission && permission !== "Granted" ? "系统通知未授权，可在系统设置中开启。" : "");
      await renderOverview();
    } catch (e) {
      status.textContent = "保存失败：" + errText(e);
    } finally {
      save.disabled = false;
    }
  };
}


function statisticsMidnightMs(year, monthIndex, day) {
  const civilMs = Date.UTC(year, monthIndex, day);
  let guess = civilMs;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: statisticsTimezoneName(),
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  // Solve UTC = local civil midnight - offset(UTC). Re-evaluate the offset so
  // a midnight crossing a DST boundary uses the offset valid at that instant.
  for (let i = 0; i < 4; i++) {
    const parts = formatter.formatToParts(new Date(guess));
    const values = Object.fromEntries(parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
    const projectedMs = Date.UTC(
      Number(values.year), Number(values.month) - 1, Number(values.day),
      Number(values.hour), Number(values.minute), Number(values.second),
    );
    const next = civilMs - (projectedMs - guess);
    if (next === guess) return next;
    guess = next;
  }
  return guess;
}

function billingMonthWindow(month) {
  const parts = String(month || "").split("-").map(Number);
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const start = statisticsMidnightMs(parts[0], parts[1] - 1, 1);
  const end = statisticsMidnightMs(parts[1] === 12 ? parts[0] + 1 : parts[0], parts[1] === 12 ? 0 : parts[1], 1);
  return { start, end };
}

function parseBillingCsvLine(line) {
  const cells = [], re = /(?:^|,)("(?:[^"]|"")*"|[^,]*)/g;
  let match;
  while ((match = re.exec(line)) !== null) {
    const cell = match[1] || "";
    cells.push(cell.startsWith('"') && cell.endsWith('"')
      ? cell.slice(1, -1).replace(/""/g, '"') : cell.trim());
  }
  return cells;
}

function parseBillingCsv(text) {
  const required = ["host", "provider_id", "billing_period", "billing_basis", "amount_minor", "currency", "evidence_ref"];
  const lines = String(text || "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length || JSON.stringify(parseBillingCsvLine(lines[0])) !== JSON.stringify(required)) {
    return { rows: [], errors: ["第1行表头不匹配，必须使用模板字段"] };
  }
  const rows = [], errors = [], seen = new Set();
  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseBillingCsvLine(lines[i]);
    if (cells.length !== required.length) { errors.push("第" + (i + 1) + "行字段数错误"); continue; }
    const [host, provider_id, billing_period, billing_basis, amountText, currency, evidence_ref] = cells;
    const amount_minor = Number(amountText);
    const key = [host, provider_id, billing_period, billing_basis, evidence_ref].join("\u0000");
    if (!host || !provider_id || !/^\d{4}-(0[1-9]|1[0-2])$/.test(billing_period) ||
        !["fixed_subscription", "host_billed", "metered_actual", "metered_estimate", "api_equivalent"].includes(billing_basis) ||
        !Number.isSafeInteger(amount_minor) || amount_minor < 0 || !/^[A-Z]{3}$/.test(currency) || !evidence_ref) {
      errors.push("第" + (i + 1) + "行字段值无效");
    } else if (seen.has(key)) {
      errors.push("第" + (i + 1) + "行与 CSV 内已有记录重复");
    } else {
      seen.add(key);
      rows.push({ host, provider_id, billing_period, billing_basis, amount_minor, currency, evidence_ref });
    }
  }
  return { rows, errors };
}

// 与 authority::host_bill_put 的唯一键保持同构：重复导入同一行必须是更正/幂等，
// 不能因为导入时间不同而生成另一条账单身份。
function billingCsvBillId(row) {
  return "csv-" + [row.host, row.provider_id, row.billing_period,
    row.billing_basis, row.evidence_ref].map(encodeURIComponent).join(":");
}

const BILLING_REVIEW_DEFER_KEY = "agent-vitals-billing-review-deferred-at-ms";
const BILLING_REVIEW_DEFER_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function deferBillingReviewPrompt() {
  const value = String(Date.now());
  try { localStorage.setItem(BILLING_REVIEW_DEFER_KEY, value); } catch (_) { /* best effort */ }
  try { sessionStorage.setItem(BILLING_REVIEW_DEFER_KEY, value); } catch (_) { /* best effort */ }
}

function openBillingDeclaration(candidate) {
  const panel = document.getElementById("ov-billing-declaration-panel");
  const context = document.getElementById("ov-billing-declaration-context");
  const preview = document.getElementById("ov-billing-preview");
  const apply = document.getElementById("ov-billing-apply-actions");
  const relationship = document.getElementById("ov-billing-relationship");
  if (!panel || !context || !preview || !apply) return;
  billingDeclarationCandidate = candidate;
  billingDeclarationState = null;
  if (relationship) relationship.disabled = false;
  context.textContent = candidate.provider_id + " · " + billingCandidateAmount(candidate) +
    " · 自 " + candidate.billing_period_start + " 起（" + candidate.host + "）。" +
    " 这一步只确认计费关系，不证明已付款。";
  preview.hidden = true;
  preview.textContent = "";
  apply.hidden = true;
  const save = document.getElementById("ov-billing-save");
  save.disabled = false;
  save.textContent = "保存并预览影响";
  panel.hidden = false;
  panel.scrollIntoView({ block: "nearest" });
}

function bindBillingDeclarationPanel() {
  const save = document.getElementById("ov-billing-save");
  const cancel = document.getElementById("ov-billing-cancel");
  const apply = document.getElementById("ov-billing-apply");
  if (!save || save.dataset.bound === "1") return;
  save.dataset.bound = "1";
  cancel.onclick = () => { document.getElementById("ov-billing-declaration-panel").hidden = true; };
  save.onclick = async () => {
    const candidate = billingDeclarationCandidate;
    if (!candidate) return;
    save.disabled = true;
    const preview = document.getElementById("ov-billing-preview");
    try {
      const relationshipKind = document.getElementById("ov-billing-relationship").value;
      // 「仍不确定」不是一条计费声明：它必须继续保留候选和按量估算，
      // 不能走 declaration_save（该命令会接受候选并进入重算）。先展示影响，
      // 第二次点击只记录 30 天的提醒降级，然后回到总览。
      if (relationshipKind === "unknown" &&
          (!billingDeclarationState || billingDeclarationState.phase !== "unknown_preview")) {
        const window = billingMonthWindow(statisticsMonth());
        const impact = await invoke("billing_candidate_impact_preview", {
          host: candidate.host, providerId: candidate.provider_id,
          effectiveStart: candidate.billing_period_start, effectiveEnd: null,
          windowStartMs: window ? window.start : 0,
          windowEndMs: window ? window.end : Date.now(), scopes: [],
        });
        preview.hidden = false;
        if (impact.status !== "ok") {
          preview.textContent = "影响预览暂不可用，候选仍待确认：" + (impact.reason || "请稍后重试");
          save.disabled = false;
          return;
        }
        billingDeclarationState = { phase: "unknown_preview", impact };
        preview.textContent = "仍保持按量估算：" + fmtTokens(impact.total_tokens || 0) +
          " tokens · " + (impact.fact_count || 0) + " 条事实 · " +
          (impact.session_count || 0) + " 个会话；候选继续待确认，未创建计费声明。";
        save.textContent = "保持待确认并返回";
        save.disabled = false;
        return;
      }
      if (relationshipKind === "unknown" && billingDeclarationState?.phase === "unknown_preview") {
        deferBillingReviewPrompt();
        billingReviewOpen = false;
        billingDeclarationCandidate = null;
        billingDeclarationState = null;
        document.getElementById("ov-billing-declaration-panel").hidden = true;
        await renderOverview();
        return;
      }
      const window = billingMonthWindow(statisticsMonth());
      const windowStartMs = window ? window.start : 0;
      const windowEndMs = window ? window.end : Date.now();
      if (!billingDeclarationState || billingDeclarationState.phase !== "preview") {
        const impact = await invoke("billing_candidate_impact_preview", {
          host: candidate.host, providerId: candidate.provider_id,
          effectiveStart: candidate.billing_period_start, effectiveEnd: null,
          windowStartMs, windowEndMs, scopes: [],
        });
        preview.hidden = false;
        if (impact.status !== "ok") {
          preview.textContent = "影响预览暂不可用，尚未保存声明：" + (impact.reason || "请稍后重试");
          save.disabled = false;
          return;
        }
        billingDeclarationState = { phase: "preview", impact };
        preview.textContent = "保存前影响预览：" + fmtTokens(impact.total_tokens || 0) +
          " tokens · " + (impact.fact_count || 0) + " 条事实 · " +
          (impact.session_count || 0) + " 个会话。确认后才会保存声明。";
        save.textContent = "确认并保存声明";
        save.disabled = false;
        return;
      }

      const impact = billingDeclarationState.impact;
      const suffix = Date.now().toString(36);
      const declarationId = "decl-" + candidate.candidate_id;
      const revisionId = "rev-" + suffix;
      await invoke("save_billing_declaration_revision", {
        revisionId, declarationId, supersedesRevisionId: null,
        host: candidate.host, providerId: candidate.provider_id,
        relationshipKind: document.getElementById("ov-billing-relationship").value,
        subscriptionName: null, amountMinor: candidate.amount_minor,
        currency: candidate.currency, effectiveStart: candidate.billing_period_start,
        effectiveEnd: null, sourceCandidateId: candidate.candidate_id,
        evidenceRef: "legacy-import-candidate:" + candidate.candidate_id,
        scopes: [],
      });
      billingDeclarationState = { declarationId, revisionId, impact };
      const relationship = document.getElementById("ov-billing-relationship");
      if (relationship) relationship.disabled = true;
      preview.hidden = false;
      preview.textContent = "声明已保存：" + fmtTokens(billingDeclarationState.impact?.total_tokens || 0) +
        " tokens · " + (billingDeclarationState.impact?.fact_count || 0) +
        " 条事实 · " + (billingDeclarationState.impact?.session_count || 0) +
        " 个会话。确认后才会应用到汇总。";
      save.textContent = "已保存";
      apply.hidden = false;
    } catch (e) {
      save.disabled = false;
      preview.hidden = false;
      preview.textContent = "保存失败：" + errText(e);
    }
  };
  apply.onclick = async () => {
    if (!billingDeclarationState) return;
    apply.disabled = true;
    try {
      const jobId = "billing-" + Date.now().toString(36);
      await invoke("enqueue_billing_recalculation", {
        jobId, declarationId: billingDeclarationState.declarationId,
        revisionId: billingDeclarationState.revisionId,
      });
      const preview = document.getElementById("ov-billing-preview");
      preview.textContent += " 已入队，正在等待重算回执…";
      let finalStatus = null;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        const receipt = await invoke("billing_recalculation_job_status", { jobId });
        finalStatus = receipt.status;
        if (["succeeded", "failed", "cancelled"].includes(receipt.status)) break;
      }
      if (finalStatus === "succeeded") {
        preview.textContent += " 已完成：" + jobId + "。";
        await renderOverview();
      } else if (finalStatus === "failed" || finalStatus === "cancelled") {
        preview.textContent += " 未完成（" + finalStatus + "），请查看数据状态后重试。";
        const retry = document.createElement("button");
        retry.className = "btn secondary";
        retry.textContent = "重试重算";
        retry.onclick = async () => {
          retry.disabled = true;
          try {
            await invoke("retry_billing_recalculation", { jobId });
            preview.textContent = "已重新入队，正在后台重试：" + jobId + "。";
          } catch (e) {
            retry.disabled = false;
            preview.textContent += " · 重试失败：" + errText(e);
          }
        };
        preview.appendChild(document.createTextNode(" "));
        preview.appendChild(retry);
      } else {
        preview.textContent += " 仍在后台处理中：" + jobId + "。";
      }
    } catch (e) {
      apply.disabled = false;
      document.getElementById("ov-billing-preview").textContent += " · 入队失败：" + errText(e);
    }
  };
}

async function renderRetentionSettings() {
  const input = document.getElementById("ov-retention-months");
  const save = document.getElementById("ov-retention-save");
  const status = document.getElementById("ov-retention-status");
  if (!input || !save || !status) return;
  const show = (text) => { status.hidden = false; status.textContent = text; };
  try {
    const config = await invoke("retention_config");
    if (!config || config.status !== "ok") throw new Error((config && config.reason) || "保留期设置不可用");
    input.min = String(config.minimum_months);
    input.max = String(config.maximum_months);
    input.value = String(config.months);
    status.hidden = true;
    save.onclick = async () => {
      const months = Number(input.value);
      if (!Number.isInteger(months) || months < Number(input.min) || months > Number(input.max)) {
        show("请输入 " + input.min + "–" + input.max + " 之间的整数月数。");
        status.focus();
        return;
      }
      save.disabled = true;
      try {
        await invoke("save_retention_config", { input: { months } });
        show("已保存：下次本机维护将保留最近 " + months + " 个自然月；不会删除宿主原始日志。");
      } catch (e) {
        show("保存失败：" + errText(e));
        status.focus();
      } finally {
        save.disabled = false;
      }
    };
  } catch (e) {
    show("保留期设置不可用：" + errText(e));
    input.disabled = true;
    save.disabled = true;
  }
}

// 常用时区 + "跟随系统" + "其他…"（规格 §4.4：不要求普通用户手输 IANA 名称）。
const COMMON_STATISTICS_TIMEZONES = [
  "Asia/Shanghai", "Asia/Hong_Kong", "Asia/Tokyo", "Asia/Singapore",
  "America/Los_Angeles", "America/New_York", "Europe/London", "Europe/Berlin", "UTC",
];

async function renderStatisticsTimezoneSettings() {
  const select = document.getElementById("ov-statistics-timezone-select");
  const customLabel = document.getElementById("ov-statistics-timezone-custom");
  const input = document.getElementById("ov-statistics-timezone");
  const save = document.getElementById("ov-timezone-save");
  const status = document.getElementById("ov-timezone-status");
  if (!select || !customLabel || !input || !save || !status) return;
  const show = (text) => { status.hidden = false; status.textContent = text; };
  let systemTz = "UTC";
  const buildOptions = (current) => {
    select.textContent = "";
    const opts = [["__system__", "跟随系统（" + systemTz + "）"]];
    for (const tz of COMMON_STATISTICS_TIMEZONES) opts.push([tz, tz]);
    opts.push(["__custom__", "其他…"]);
    for (const [value, label] of opts) {
      const opt = document.createElement("option");
      opt.value = value; opt.textContent = label;
      select.appendChild(opt);
    }
    const known = COMMON_STATISTICS_TIMEZONES.includes(current);
    if (current === systemTz) select.value = "__system__";
    else if (known) select.value = current;
    else select.value = "__custom__";
    customLabel.hidden = select.value !== "__custom__";
    input.value = current;
  };
  select.onchange = () => {
    customLabel.hidden = select.value !== "__custom__";
    if (select.value !== "__custom__") input.value = select.value === "__system__" ? systemTz : select.value;
  };
  try {
    const config = await invoke("statistics_timezone_config");
    if (!config || config.status !== "ok") throw new Error((config && config.reason) || "统计时区设置不可用");
    systemTz = String(config.system_timezone || systemTz);
    configuredStatisticsTimezone = String(config.timezone || config.system_timezone || configuredStatisticsTimezone).trim();
    buildOptions(configuredStatisticsTimezone);
    status.hidden = true;
    save.onclick = async () => {
      const timezone = (select.value === "__system__" ? systemTz : select.value === "__custom__" ? input.value.trim() : select.value);
      if (!timezone) {
        show("请输入 IANA 时区名称，例如 Asia/Shanghai。");
        status.focus();
        return;
      }
      save.disabled = true;
      try {
        await invoke("save_statistics_timezone_config", { timezone });
        configuredStatisticsTimezone = timezone;
        calMonth = statisticsMonth();
        show("已保存统计时区；正在刷新今天、本月和日历统计。");
        await loadActiveTab();
      } catch (e) {
        show("保存失败：" + errText(e));
        status.focus();
      } finally {
        save.disabled = false;
      }
    };
  } catch (e) {
    show("统计时区设置不可用：" + errText(e));
    select.disabled = true;
    input.disabled = true;
    save.disabled = true;
  }
}

async function renderPricingCatalogSettings() {
  const button = document.getElementById("ov-pricing-catalog-update");
  const status = document.getElementById("ov-pricing-catalog-status");
  const network = document.getElementById("ov-pricing-catalog-network");
  if (!button || !status || !network || button.dataset.bound === "1") return;
  button.dataset.bound = "1";
  const render = (value) => {
    if (!value) { status.textContent = "尚未检查"; return; }
    const state = value.state || value.status || "unknown";
    const version = value.source_version ? " · 版本 " + value.source_version : "";
    const models = value.model_count == null ? "" : " · 覆盖 " + value.model_count + " 个模型";
    const reason = value.failure_reason ? " · 原因：" + value.failure_reason : "";
    const succeeded = state === "ok" || state === "updated" || value.status === "updated";
    status.textContent = (succeeded ? "已成功检查公共目录" : state === "never_checked" ? "尚未检查" : "上次检查未采用新目录") + version + models + reason;
  };
  const initialStatus = await (async () => {
    try { return await invoke("public_pricing_catalog_status"); }
    catch (e) { status.textContent = "价格目录状态不可用：" + errText(e); return null; }
  })();
  if (initialStatus) {
    network.checked = initialStatus.network_enabled === true;
    render(initialStatus);
  }
  network.onchange = async () => {
    network.disabled = true;
    try {
      await invoke("save_public_pricing_catalog_policy", { networkEnabled: network.checked });
      status.textContent = network.checked ? "已允许联网检查；不会上传本地数据。" : "已关闭联网检查；继续使用本地价卡。";
    } catch (e) {
      network.checked = !network.checked;
      status.textContent = "保存联网偏好失败：" + errText(e);
    } finally { network.disabled = false; }
  };
  button.onclick = async () => {
    if (!network.checked) { status.textContent = "请先明确允许访问公共价格服务。"; return; }
    button.disabled = true;
    status.textContent = "正在检查公共价格目录…不会上传本地数据。";
    try {
      render(await invoke("update_public_pricing_catalog"));
      await refreshActiveTab();
    } catch (e) {
      try { render(await invoke("public_pricing_catalog_status")); } catch (_) {}
      status.textContent += "（" + errText(e) + "）";
    } finally { button.disabled = false; }
  };
}

function csvCell(value) {
  let text = value == null ? "" : String(value);
  // provider/model 等虽来自权威 DTO，仍可能源自外部日志；CSV 被表格软件打开时，
  // 公式前缀不能获得执行机会。前导单引号是显示层转义，不改变导出的原始语义。
  if (/^[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

// 当前视图导出刻意只消费已经渲染的月度权威 DTO；不查询会话详情，不重算价格，
// 也不把本地路径、账户或原始日志写进临时文件。金额保留原币与 basis，不跨币相加。
function summaryExportCsv(monthly) {
  const header = ["record_kind", "window", "host", "provider", "tokens", "basis", "currency",
    "amount", "amount_status", "evidence_basis", "pricing_method", "freshness",
    "last_observed_at", "coverage_measured_fields", "coverage_total_fields",
    "coverage_denominator_version", "summary_contract"];
  const rows = [header];
  if (!monthly || !monthly.month) return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const coverage = monthly.coverage || {};
  const common = (recordKind, host, provider, tokens, basis, currency, amount, amountStatus, source) => [
    recordKind, monthly.month, host || "", provider || "", tokens == null ? "" : tokens,
    basis || "", currency || "", amount == null ? "" : amount, amountStatus || "",
    source.evidence_basis || "", source.pricing_method || "", (source.freshness || {}).state || "",
    (source.freshness || {}).last_observed_at || monthly.last_observed_at || "",
    coverage.measured_fields == null ? "" : coverage.measured_fields,
    coverage.total_fields == null ? "" : coverage.total_fields,
    coverage.denominator_version == null ? "" : coverage.denominator_version,
    "monthly_summary/v1",
  ];
  for (const [host, tokens] of Object.entries(monthly.tokens_by_host || {})) {
    const tokenTotal = tokens && tokens.total;
    rows.push(common("host_tokens", host, "", tokenTotal, "", "", "", "observed", (monthly.by_host || {})[host] || {}));
  }
  for (const [hostProvider, source] of Object.entries(monthly.by_provider || {})) {
    const divider = hostProvider.indexOf("/");
    const host = divider >= 0 ? hostProvider.slice(0, divider) : hostProvider;
    const provider = divider >= 0 ? hostProvider.slice(divider + 1) : "";
    const amounts = source.amounts_by_basis || {};
    for (const [basis, amount] of Object.entries(amounts)) {
      rows.push(common("provider_amount", host, provider, "", basis, source.currency || "", amount, "available", source));
    }
    if (source.has_unresolved) {
      rows.push(common("provider_amount", host, provider, "", "", source.currency || "", "", "unresolved", source));
    }
  }
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function bindSummaryExport(monthly) {
  const preview = document.getElementById("ov-export-preview");
  const download = document.getElementById("ov-export-download");
  const content = document.getElementById("ov-export-preview-content");
  if (!preview || !download || !content) return;
  preview.onclick = () => {
    const csv = summaryExportCsv(monthly);
    const [header, ...records] = csv.split("\r\n");
    content.hidden = false;
    content.textContent = "字段：" + header.replaceAll('"', "") + "。将导出 " + records.length +
      " 行当前月摘要；金额保留原币与口径，未定项金额为空且标记 unresolved。";
    download.hidden = false;
  };
  download.onclick = () => {
    const csv = summaryExportCsv(monthly);
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "agent-vitals-" + (monthly && monthly.month ? monthly.month : "summary") + ".csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
}

function renderBillingDeclarations(report) {
  const panel = document.getElementById("ov-billing-declarations-panel");
  const list = document.getElementById("ov-billing-declarations-list");
  if (!panel || !list) return;
  if (!report || report.status !== "ok") {
    panel.hidden = false;
    list.textContent = "待确认状态暂不可读，请刷新重试";
    return;
  }
  const declarations = report && report.status === "ok" ? (report.declarations || []) : [];
  panel.hidden = !declarations.length;
  list.textContent = "";
  for (const declaration of declarations) {
    const row = document.createElement("div");
    row.className = "billing-review-row";
    const detail = document.createElement("div");
    const label = declaration.relationship_kind === "official_subscription" ? "官方订阅" :
      declaration.relationship_kind === "official_api" ? "官方 API" : declaration.relationship_kind;
    detail.textContent = declaration.host + " · " + declaration.provider_id + " · " + label +
      " · 自 " + declaration.effective_start + " 起" +
      (declaration.effective_end ? "，至 " + declaration.effective_end : "");
    const actions = document.createElement("div");
    actions.className = "billing-review-actions";
    const revoke = document.createElement("button");
    revoke.className = "btn secondary";
    revoke.textContent = "撤销计费声明";
    revoke.onclick = async () => {
      if (!declaration.current_revision_id) {
        detail.textContent += " · 无法确定当前修订，请勿继续操作。";
        return;
      }
      revoke.disabled = true;
      try {
        await invoke("revoke_billing_declaration", {
          revisionId: "rev-revoke-" + Date.now().toString(36),
          declarationId: declaration.declaration_id,
          supersedesRevisionId: declaration.current_revision_id,
        });
        billingDeclarationCandidate = null;
        billingDeclarationState = null;
        const declarationPanel = document.getElementById("ov-billing-declaration-panel");
        if (declarationPanel) declarationPanel.hidden = true;
        await renderOverview();
      } catch (e) {
        revoke.disabled = false;
        detail.textContent += " · 撤销失败：" + errText(e);
      }
    };
    actions.appendChild(revoke);
    row.append(detail, actions);
    list.appendChild(row);
  }
}

// 旧版静态资产的套餐声明并非付款证据。这里故意不把它塞进 quality warning：
// 它是用户最有上下文时的低压力输入机会，而非需要用户理解的技术故障。
function renderBillingImportCandidates(report) {
  const prompt = document.getElementById("ov-billing-prompt");
  const panel = document.getElementById("ov-billing-review-panel");
  const reviewButton = document.getElementById("ov-billing-review");
  const closeButton = document.getElementById("ov-billing-review-close");
  const copy = document.getElementById("ov-billing-prompt-copy");
  const list = document.getElementById("ov-billing-review-list");
  const settingsEntry = document.getElementById("settings-billing-candidates");
  const settingsCopy = document.getElementById("settings-billing-candidates-copy");
  const settingsOpen = document.getElementById("settings-billing-candidates-open");
  if (!prompt || !panel || !reviewButton || !closeButton || !copy || !list) return;
  bindBillingDeclarationPanel();
  // A transient authority read failure must not close a panel the user is
  // already reviewing or erase its last rendered candidates. The next
  // successful refresh will reconcile the list; only an explicit `ok` empty
  // result means there are no candidates left.
  if (!report || report.status !== "ok") {
    prompt.hidden = false;
    copy.textContent = "待确认状态暂不可读，请刷新重试";
    billingPromptState = { visible: false, pendingTokens: 0 };
    if (settingsEntry) settingsEntry.hidden = false;
    if (settingsCopy) settingsCopy.textContent = copy.textContent;
    return;
  }
  const candidates = Array.isArray(report.candidates) ? report.candidates : [];
  const pendingCount = candidates.filter((candidate) => candidate.status === "pending").length;
  let deferredAt = 0;
  try { deferredAt = Number(localStorage.getItem(BILLING_REVIEW_DEFER_KEY) || 0); } catch (_) { /* best effort */ }
  if (!deferredAt) {
    try { deferredAt = Number(sessionStorage.getItem(BILLING_REVIEW_DEFER_KEY) || 0); } catch (_) { /* best effort */ }
  }
  const deferred = Number.isFinite(deferredAt) && deferredAt > 0 &&
    Date.now() - deferredAt < BILLING_REVIEW_DEFER_WINDOW_MS;
  if (deferredAt > 0 && !deferred) {
    try { localStorage.removeItem(BILLING_REVIEW_DEFER_KEY); } catch (_) { /* best effort */ }
    try { sessionStorage.removeItem(BILLING_REVIEW_DEFER_KEY); } catch (_) { /* best effort */ }
  }
  // “稍后”只压住尚未处理的提醒；已确认/已忽略项仍保留一个可回看的入口。
  prompt.hidden = !candidates.length || (pendingCount > 0 && pendingCount === candidates.length && deferred);
  billingPromptState = {
    visible: !prompt.hidden && pendingCount > 0,
    pendingTokens: candidates.filter((c) => c.status === "pending")
      .reduce((sum, c) => sum + Number((c.impact || {}).total_tokens || 0), 0),
  };
  if (settingsEntry) settingsEntry.hidden = !candidates.length;
  panel.hidden = !billingReviewOpen;
  list.textContent = "";
  if (!candidates.length || (pendingCount > 0 && pendingCount === candidates.length && deferred)) {
    billingReviewOpen = false;
    panel.hidden = true;
    return;
  }
  copy.textContent = pendingCount
    ? (() => {
      const impact = candidates.filter((candidate) => candidate.status === "pending")
        .reduce((sum, candidate) => {
          const row = candidate.impact || {};
          if (row.status !== "ok") sum.unavailable = true;
          sum.tokens += Number(row.total_tokens || 0);
          sum.facts += Number(row.fact_count || 0);
          sum.sessions += Number(row.session_count || 0);
          return sum;
        }, { tokens: 0, facts: 0, sessions: 0, unavailable: false });
      const scope = impact.unavailable
        ? "涉及范围暂时算不出来（请先检查数据状态）"
        : "涉及本月约 " + fmtTokens(impact.tokens) + " tokens、" + impact.sessions + " 个会话";
      return "发现 " + pendingCount + " 条套餐信息需要你确认，" + scope +
        "。现在先按官方价估算；确认后就能分清哪些在套餐内、哪些要额外按量付费。";
    })()
    : "套餐信息已核对；已核对的套餐不计入实际支出，用量仍按官方价估算。";
  if (settingsCopy) settingsCopy.textContent = copy.textContent;
  if (settingsOpen && settingsOpen.dataset.bound !== "1") {
    settingsOpen.dataset.bound = "1";
    settingsOpen.onclick = () => reviewButton.click();
  }

  document.getElementById("ov-billing-later").onclick = () => {
    deferBillingReviewPrompt();
    billingReviewOpen = false;
    panel.hidden = true;
    prompt.hidden = true;
  };
  document.getElementById("ov-billing-review").onclick = () => {
    billingReviewOpen = true;
    panel.hidden = false;
    switchTab("sources");
    list.textContent = "";
    for (const candidate of candidates) {
      const row = document.createElement("div");
      row.className = "billing-review-row";
      const detail = document.createElement("div");
      detail.textContent = candidate.provider_id + " · " + billingCandidateAmount(candidate) +
        " · 自 " + candidate.billing_period_start + " 起（" + candidate.host + "）";
      const impact = candidate.impact || {};
      if (candidate.status === "pending" && impact.status === "ok") {
        detail.textContent += " · 本月涉及 " + fmtTokens(Number(impact.total_tokens || 0)) +
          " tokens / " + Number(impact.session_count || 0) + " 个会话";
      } else if (candidate.status === "pending") {
        detail.textContent += " · 本月影响范围暂不可用，请检查数据状态";
      }
      const actions = document.createElement("div");
      actions.className = "billing-review-actions";
      // 二选一 + 例外入口（规格 §4.2）：不再是三个并列按钮——"这是我的套餐"和
      // "确认计费方式"语义重叠，改成一个次级按钮 + 一个"不是" + 一个改按其他
      // 方式的文字链。
      const accept = document.createElement("button");
      accept.className = "btn secondary";
      accept.textContent = "是我的套餐";
      const dismiss = document.createElement("button");
      dismiss.className = "chip-link";
      dismiss.textContent = "不是";
      const declare = document.createElement("button");
      declare.className = "chip-link";
      declare.textContent = "改为其他计费方式…";
      declare.onclick = () => openBillingDeclaration(candidate);
      const resolve = async (decision) => {
        accept.disabled = true;
        dismiss.disabled = true;
        try {
          await invoke("resolve_billing_import_candidate", {
            candidateId: candidate.candidate_id, decision,
          });
          const accepted = decision === "accept";
          detail.textContent = (accepted ? "已确认：这是你的套餐。" : "已忽略：这不是你的套餐。") +
            "不会计入实际支出；当前用量仍按原厂价估算。";
          actions.textContent = "";
          const undo = document.createElement("button");
          undo.className = "btn secondary";
          undo.textContent = "撤销";
          undo.onclick = async () => {
            undo.disabled = true;
            try {
              await invoke("resolve_billing_import_candidate", {
                candidateId: candidate.candidate_id, decision: "reopen",
              });
              await renderOverview();
            } catch (e) {
              undo.disabled = false;
              detail.textContent += " · 撤销失败：" + errText(e);
            }
          };
          actions.appendChild(undo);
        } catch (e) {
          accept.disabled = false;
          dismiss.disabled = false;
          detail.textContent += " · 保存失败：" + errText(e);
        }
      };
      if (candidate.status && candidate.status !== "pending") {
        const accepted = candidate.status === "accepted";
        detail.textContent = (accepted ? "已确认：这是你的套餐。" : "已忽略：这不是你的套餐。") +
          "不会计入实际支出；当前用量仍按原厂价估算。";
        const undo = document.createElement("button");
        undo.className = "btn secondary";
        undo.textContent = "撤销";
        undo.onclick = async () => {
          undo.disabled = true;
          try {
            await invoke("resolve_billing_import_candidate", {
              candidateId: candidate.candidate_id, decision: "reopen",
            });
            await renderOverview();
          } catch (e) {
            undo.disabled = false;
            detail.textContent += " · 撤销失败：" + errText(e);
          }
        };
        actions.appendChild(undo);
        row.append(detail, actions);
        list.appendChild(row);
        continue;
      }
      accept.onclick = () => resolve("accept");
      dismiss.onclick = () => resolve("dismiss");
      actions.append(accept, dismiss, declare);
      row.append(detail, actions);
      list.appendChild(row);
    }
  };
  // The bootstrap listener can open the panel before the async candidate read
  // finishes. Re-run the now-bound renderer so that this race cannot leave an
  // apparently open but empty review panel.
  if (billingReviewOpen) reviewButton.onclick();
  closeButton.onclick = () => {
    billingReviewOpen = false;
    panel.hidden = true;
    reviewButton.focus();
  };
}

function renderBillingRecalculationJobs(report) {
  const panel = document.getElementById("ov-billing-recalculation-panel");
  const list = document.getElementById("ov-billing-recalculation-list");
  if (!panel || !list) return;
  if (!report || report.status !== "ok") {
    panel.hidden = false;
    list.textContent = "待确认状态暂不可读，请刷新重试";
    return;
  }
  const jobs = report && report.status === "ok" && Array.isArray(report.jobs) ? report.jobs : [];
  panel.hidden = !jobs.length;
  list.textContent = "";
  for (const job of jobs) {
    const row = document.createElement("div");
    row.className = "billing-review-row";
    const detail = document.createElement("div");
    const statusText = job.status === "failed" || job.status === "cancelled"
      ? "重算待重试"
      : job.status === "running" ? "重算处理中" : "重算排队中";
    detail.textContent = statusText + " · 旧版本结果仍可用 · " + job.job_id;
    if (job.error_detail) detail.textContent += " · " + job.error_detail;
    const actions = document.createElement("div");
    actions.className = "billing-review-actions";
    if (job.status === "failed" || job.status === "cancelled") {
      const retry = document.createElement("button");
      retry.className = "btn secondary";
      retry.textContent = "重试重算";
      retry.onclick = async () => {
        retry.disabled = true;
        try {
          await invoke("retry_billing_recalculation", { jobId: job.job_id });
          await renderOverview();
        } catch (e) {
          retry.disabled = false;
          detail.textContent += " · 重试失败：" + errText(e);
        }
      };
      actions.appendChild(retry);
    }
    row.append(detail, actions);
    list.appendChild(row);
  }
}

async function renderHostBills(period) {
  const existing = document.getElementById("ov-bill-existing");
  const status = document.getElementById("ov-bill-status");
  const save = document.getElementById("ov-bill-save");
  if (!existing || !status || !save) return;
  const showBills = (report) => {
    existing.textContent = "";
    const bills = report && report.status === "ok" ? (report.bills || []) : [];
    if (!bills.length) return;
    const title = document.createElement("div");
    title.className = "muted";
    title.textContent = "当前账期账单记录：";
    existing.appendChild(title);
    for (const bill of bills) {
      const row = document.createElement("div");
      row.className = "billing-review-row";
      const detail = document.createElement("div");
      detail.textContent = bill.host + " · " + bill.provider_id + " · " +
        bill.billing_basis + " · " + bill.amount_minor + " " + bill.currency;
      const remove = document.createElement("button");
      remove.className = "btn secondary";
      remove.textContent = "删除记录";
      remove.onclick = async () => {
        remove.disabled = true;
        try {
          await invoke("delete_host_bill", { billId: bill.bill_id });
          const refreshed = await invoke("host_bills_for_period", {
            billingPeriod: document.getElementById("ov-bill-period").value.trim(),
          });
          showBills(refreshed);
        } catch (e) {
          remove.disabled = false;
          status.hidden = false;
          status.textContent = "删除失败：" + errText(e);
        }
      };
      row.append(detail, remove);
      existing.appendChild(row);
    }
  };
  document.getElementById("ov-bill-period").value = period;
  if (save.dataset.bound === "1") {
    try {
      showBills(await invoke("host_bills_for_period", { billingPeriod: period }));
    } catch (_) { /* 账单是增强入口，不遮蔽总览 */ }
    return;
  }
  save.dataset.bound = "1";
  save.onclick = async () => {
    save.disabled = true;
    status.hidden = false;
    try {
      const host = document.getElementById("ov-bill-host").value.trim();
      const provider = document.getElementById("ov-bill-provider").value.trim();
      const billingPeriod = document.getElementById("ov-bill-period").value.trim();
      const amount = Number(document.getElementById("ov-bill-amount").value);
      const currency = document.getElementById("ov-bill-currency").value.trim();
      const evidence = document.getElementById("ov-bill-evidence").value.trim();
      if (!host || !provider || !/^\d{4}-(0[1-9]|1[0-2])$/.test(billingPeriod) ||
          !Number.isSafeInteger(amount) || amount < 0 || !currency || !evidence) {
        throw new Error("请填写宿主、服务商、有效账期、非负整数金额、币种和来源说明");
      }
      await invoke("save_host_bill", {
        billId: "bill-" + Date.now().toString(36), host, providerId: provider,
        billingPeriod, billingBasis: document.getElementById("ov-bill-basis").value,
        amountMinor: amount, currency, evidenceRef: evidence,
      });
      status.textContent = "账单已保存；它与订阅合同分开，不会改变已观测 tokens。";
      const report = await invoke("host_bills_for_period", { billingPeriod });
      showBills(report);
    } catch (e) {
      status.textContent = "保存失败：" + errText(e);
    } finally {
      save.disabled = false;
    }
  };
  let csvRows = [];
  const csvPreview = document.getElementById("ov-bill-csv-preview");
  const csvImport = document.getElementById("ov-bill-csv-import");
  const csvStatus = document.getElementById("ov-bill-csv-status");
  csvPreview.onclick = () => {
    const parsed = parseBillingCsv(document.getElementById("ov-bill-csv").value);
    csvRows = parsed.rows;
    csvStatus.hidden = false;
    csvStatus.textContent = "可导入 " + csvRows.length + " 行" +
      (parsed.errors.length ? "；拒绝 " + parsed.errors.length + " 行：" + parsed.errors.join("；") : "，未发现错误。");
    csvImport.disabled = !csvRows.length || parsed.errors.length > 0;
  };
  csvImport.onclick = async () => {
    csvImport.disabled = true;
    try {
      await invoke("save_host_bills", { rows: csvRows.map((row, i) => ({
        bill_id: billingCsvBillId(row),
        host: row.host, provider_id: row.provider_id, billing_period: row.billing_period,
        billing_basis: row.billing_basis, amount_minor: row.amount_minor,
        currency: row.currency, evidence_ref: row.evidence_ref,
      })) });
      csvStatus.hidden = false;
      csvStatus.textContent = "已导入 " + csvRows.length + " 行账单记录。";
      const report = await invoke("host_bills_for_period", { billingPeriod: period });
      showBills(report);
    } catch (e) {
      csvImport.disabled = false;
      csvStatus.hidden = false;
      csvStatus.textContent = "导入中断：已成功写入前置行；请根据预览修正后重试。" + errText(e);
    }
  };
  try {
    const report = await invoke("host_bills_for_period", { billingPeriod: period });
    showBills(report);
  } catch (_) { /* 账单是增强入口，不遮蔽总览 */ }
}

// 「本月逐日」panel：read_calendar_month（逐日三宿主 token + 分币耗费）。
// 旧 read_month 的 DSH-only 日轴在 DSH 零用量月份只剩全零行，与总览页的
// 跨宿主叙事自相矛盾——v0.9.1 Phase 4 已退役该命令。costs 每段带宿主前缀。
function renderOverviewDays(cal) {
  const list = document.getElementById("ov-days-list");
  const empty = document.getElementById("ov-days-empty");
  if (!list) return;
  list.textContent = "";
  const days = (cal && cal.days) || {};
  const rows = Object.entries(days)
    .filter(([, d]) => (d.total_tokens || 0) > 0)
    .sort((a, b) => (a[0] < b[0] ? 1 : -1));
  if (!rows.length) {
    empty.hidden = false;
    empty.textContent = cal ? "本月还没有可展示的日记录" : "最近几天暂不可读，请刷新重试";
    return;
  }
  empty.hidden = true;
  for (const [date, d] of rows) {
    const costs = [];
    if ((d.dsh_cost_cny || 0) > 0) costs.push(HOST_DISPLAY.dsh + " " + fmtCur(d.dsh_cost_cny, "CNY"));
    if ((d.claude_cost_cny || 0) > 0) costs.push(HOST_DISPLAY["claude-code"] + " " + fmtCur(d.claude_cost_cny, "CNY"));
    if ((d.claude_cost_usd || 0) > 0) costs.push(HOST_DISPLAY["claude-code"] + " " + fmtCur(d.claude_cost_usd, "USD"));
    if ((d.codex_cost_usd || 0) > 0) costs.push(HOST_DISPLAY.codex + " " + fmtCur(d.codex_cost_usd, "USD"));
    const li = document.createElement("li");
    li.innerHTML = `<span class="day-date">${date}</span>` +
      `<span class="day-tokens">${fmtTokens(d.total_tokens)} tokens</span>` +
      (costs.length ? `<span class="day-cost">${costs.join(" · ")}</span>` : "");
    list.appendChild(li);
  }
}

// ---------- Stage D KPI 行 / 双轨账 / 决策卡 ----------

// ---------- 总览第一行三卡 + 本月用量行 ----------
// 金额纪律：按量实付 / 订阅月费读 DTO 的 `actual_spend_by_basis`（拆栏在
// domain：data_contract.rs::actual_spend_by_basis，各栏之和恒等于
// total_actual_spend），分币并列、永不跨币相加、永不折算（PM 决策 2026-09-07：
// fx 只进名义）。名义 = nominalFromByProvider（官方标价折算，诊断脚注）。
// 无数据一律「无数据」，绝不渲染 0；「无数据」不吃强调色。
function spendByBasis(dto, basis) {
  return ((dto && dto.actual_spend_by_basis) || {})[basis] || {};
}
// 按量实付 = metered_actual + host_billed：两档都是真实账单口径（宿主账单不能
// 重标为模型 API 成本，但同样回答"要付多少"），按币合并。
function meteredSpend(dto) {
  const out = {};
  for (const basis of ["metered_actual", "host_billed"]) {
    for (const [c, v] of Object.entries(spendByBasis(dto, basis))) out[c] = (out[c] || 0) + v;
  }
  return out;
}
function setAmount(id, text, title) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.title = title || ""; // 分币展开挂 hover；未传 → 清掉上一轮的
  el.classList.toggle("muted-amt", text === "无数据");
}
// 名义：混币且有汇率 → 速览层并成 `≈¥`（原始分币进 hover）；否则分币并列。
// cache_write 档位假设必须可见（1hr/5min 差额占名义总额 5.2%，会话日志不记录
// 实际 TTL——假设不是观测），挂在名义的 hover 与卡片副行。
const NOMINAL_BASIS_NOTE = "@官方标价 · cache_write 按 1hr 计";
function renderNominalInto(id, nominal, fx) {
  const parts = fmtCurMap(nominal);
  const merged = fxMerge(nominal, fx);
  if (merged) {
    setAmount(id, fmtFxApprox(merged), NOMINAL_BASIS_NOTE + " · 原始分币 " + merged.parts.join(" + ") + " · " + fxNote(merged));
  } else {
    setAmount(id, parts.length ? parts.join(" + ") : "无数据", parts.length ? NOMINAL_BASIS_NOTE : "");
  }
  return merged;
}
function renderSpendCards(daily, monthly, fx, window = { date: statisticsToday() }) {
  // 本月支出：口径分栏
  const mMetered = fmtCurMap(meteredSpend(monthly));
  const mSubscription = fmtCurMap(spendByBasis(monthly, "fixed_subscription"));
  setAmount("ov-m-metered", mMetered.length ? mMetered.join(" + ") : "无数据");
  setAmount("ov-m-subscription", mSubscription.length ? mSubscription.join(" + ") : "无数据");
  const mNominal = monthly ? nominalFromByProvider(monthly.by_provider) : {};
  renderNominalInto("ov-m-nominal", mNominal, fx);
  const spendSub = document.getElementById("ov-m-spend-sub");
  if (spendSub) {
    spendSub.textContent = !monthly
      ? "本月数据不可用"
      : (mMetered.length || mSubscription.length)
        ? "按量费用与订阅月费分开计；不同币种不相加"
        : "本月还没有真实支出记录";
  }
  // 今日消耗：tokens 主数 + 今日按量实付；名义只作脚注（IA 复核 §7）。
  const tk = tokensSum(daily && daily.tokens_by_host);
  setAmount("ov-t-tokens", daily && tk.total > 0 ? fmtTokens(tk.total) + " tokens" : "无数据");
  const tSub = document.getElementById("ov-t-tokens-sub");
  if (tSub) tSub.textContent = daily && tk.total > 0 ? "今天处理的 token 数（含缓存读写）" : daily ? "今天还没有用量记录" : "今日数据暂不可读，请刷新重试";
  const tMetered = fmtCurMap(meteredSpend(daily));
  setAmount("ov-t-metered", tMetered.length ? tMetered.join(" + ") : "无数据");
  renderNominalInto("ov-t-nominal", daily ? nominalFromByProvider(daily.by_provider) : {}, fx);
  // 本月用量行：规格 §4 的「已观测 tokens」与「名义成本」——首屏可见，不占卡。
  const mtk = tokensSum(monthly && monthly.tokens_by_host);
  const dayOfMonth = Number(window.date.slice(8)) || 1;
  setAmount("ov-m-tokens", monthly && mtk.total > 0 ? fmtTokens(mtk.total) + " tokens" : "无数据");
  const mtkSub = document.getElementById("ov-m-tokens-sub");
  if (mtkSub) {
    mtkSub.textContent = monthly && mtk.total > 0
      ? "日均 " + fmtTokens(Math.round(mtk.total / dayOfMonth)) + "（含缓存读写）"
      : monthly ? "本月还没有用量记录" : "本月用量暂不可读，请刷新重试";
  }
}

// 费用明细（本月）：原「双轨账」+「数据源」合成一张表。**服务商是主键**（用户
// 付钱的对象），宿主是副属性「经 X」——同一服务商经多个工具使用时合成一行
// （同币种相加；币种不同则分行，不跨币相加），宿主并列成 chip，新鲜度取最差。
// 分组：订阅（固定月费）/ 按量（按用量付费）/ 无法归类。订阅利用率倍数 =
// 标价折算 ÷ 月费，>50× 是「请核对套餐」的自检告警而非套利（§6.7 护栏）；
// unresolved 条目只说「部分用量无法估价」，不当 0。evidence_basis /
// pricing_method / unresolved_reason 这些 reason code 只进 hover——规格 §4
// 第 84 行：禁止在卡面展示 raw reason code。工具视角在「用量」页数据源面板。
const DUAL_LABEL = {
  fixed_subscription: "订阅月费",
  api_equivalent: "用量按标价折算",
  metered_actual: "按量实付",
  metered_estimate: "按量估算",
  host_billed: "宿主账单",
};
const FRESH_RANK = { unavailable: 0, fresh: 1, partial: 2, stale: 3 };
function groupByProvider(byProvider, byHost) {
  const groups = new Map(); // provider|currency -> row
  for (const [key, h] of Object.entries(byProvider)) {
    const [host, provider = host] = key.split("/");
    const bases = h.amounts_by_basis || {};
    if (!Object.keys(bases).length && !h.has_unresolved) continue;
    const currency = h.currency || "";
    const id = provider + "|" + currency;
    const fs = ((byHost[host] || {}).freshness) || {};
    let row = groups.get(id);
    if (!row) {
      row = { provider, currency, hosts: [], amounts: {}, has_unresolved: false,
        pricing_methods: new Set(), evidence: new Set(), reasons: new Set(),
        freshness: { state: "unavailable", at: "" } };
      groups.set(id, row);
    }
    row.hosts.push(host);
    for (const [b, v] of Object.entries(bases)) row.amounts[b] = (row.amounts[b] || 0) + v;
    row.has_unresolved = row.has_unresolved || !!h.has_unresolved;
    if (h.pricing_method) row.pricing_methods.add(h.pricing_method);
    if (h.evidence_basis) row.evidence.add(h.evidence_basis);
    if (h.unresolved_reason) row.reasons.add(h.unresolved_reason);
    if ((FRESH_RANK[fs.state] || 0) > (FRESH_RANK[row.freshness.state] || 0) ||
        (fs.state === row.freshness.state && (fs.last_observed_at || "") > row.freshness.at)) {
      row.freshness = { state: fs.state || "unavailable", at: fs.last_observed_at || "" };
    }
  }
  return [...groups.values()];
}
function renderDualTrack(monthly) {
  const list = document.getElementById("ov-dual-list");
  const empty = document.getElementById("ov-dual-empty");
  list.textContent = "";
  const byProvider = (monthly && monthly.by_provider) || {};
  const byHost = (monthly && monthly.by_host) || {};
  const rows = groupByProvider(byProvider, byHost);
  if (!rows.length) {
    empty.hidden = false;
    empty.textContent = monthly ? "本月还没有可拆分的支出记录" : "本月支出明细暂不可读，请刷新重试";
    return;
  }
  empty.hidden = true;
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
  const li = (cls, html, title) => {
    const el = document.createElement("li");
    if (cls) el.className = cls;
    el.innerHTML = html;
    if (title) el.title = title;
    list.appendChild(el);
  };
  if (list.dataset && list.dataset.goBound !== "1" && typeof list.addEventListener === "function") {
    list.dataset.goBound = "1";
    const go = (ev) => {
      const t = ev.target && ev.target.closest ? ev.target.closest("[data-go]") : null;
      if (t) openSettingsSection(t.dataset.go);
    };
    list.addEventListener("click", go);
    list.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); go(ev); } });
  }
  const nameOf = (r) => escapeHtml(PROVIDER_LABEL[r.provider] || r.provider);
  const viaOf = (r) => `<span class="via muted">经 ${r.hosts.map((h) => escapeHtml(HOST_DISPLAY[h] || h)).join("、")}</span>`;
  // hover 里放 reason code：证据来源 / 计价方式 / 未定价原因。
  const hoverOf = (r) => [
    r.evidence.size ? "证据来源 " + [...r.evidence].join(", ") : "",
    r.pricing_methods.size ? "计价方式 " + [...r.pricing_methods].join(", ") : "",
    r.reasons.size ? "未定价原因 " + [...r.reasons].join(", ") : "",
  ].filter(Boolean).join("\n");
  const freshOf = (r) => {
    const at = (r.freshness.at || "").slice(5, 10);
    switch (r.freshness.state) {
      case "fresh": return `<span class="fresh">最新${at ? " " + at : ""}</span>`;
      case "stale": return `<span class="fresh stale"><span class="chip-link" data-go="settings-sources" role="button" tabindex="0">⚠ 数据过期${at ? " · 最后更新 " + at : ""} ›</span></span>`;
      case "partial": return `<span class="fresh stale"><span class="chip-link" data-go="settings-sources" role="button" tabindex="0">数据不完整${at ? " · 最后更新 " + at : ""} ›</span></span>`;
      default: return "";
    }
  };
  const subEntries = [], metered = [], unresolved = [];
  for (const r of rows) {
    const bases = Object.keys(r.amounts);
    if (bases.includes("fixed_subscription") || bases.includes("api_equivalent")) subEntries.push(r);
    else if (bases.some((b) => b.startsWith("metered") || b === "host_billed")) metered.push(r);
    else unresolved.push(r);
  }
  const unresolvedChip = '<span class="chip hostbilled">部分用量无法估价</span>';
  const rowHtml = (r, chips) =>
    `<span class="src-name">${nameOf(r)}</span><span class="basis">${chips.join(" ")} ${viaOf(r)}</span>${freshOf(r)}`;
  if (subEntries.length) li("", `<span class="dual-track">订阅（固定月费）</span>`);
  for (const r of subEntries) {
    const fee = r.amounts.fixed_subscription || 0;
    const listEq = r.amounts.api_equivalent || 0;
    const chips = [];
    if (fee > 0) chips.push(`<span class="chip subscription">${DUAL_LABEL.fixed_subscription} ${fmtCur(fee, r.currency || null)}</span>`);
    if (listEq > 0) chips.push(`<span class="chip diagnostic">${DUAL_LABEL.api_equivalent} ${fmtCur(listEq, r.currency || null)}（参考）</span>`);
    if (r.has_unresolved) {
      chips.push(unresolvedChip);
    } else if (fee === 0 && listEq > 0) {
      chips.push('<span class="chip chip-link" data-go="settings-billing" role="button" tabindex="0">未填写月费，去填写 ›</span>');
    } else if (fee > 0 && listEq > 0) {
      const mult = listEq / fee;
      chips.push(mult > 50
        ? `<span class="chip diagnostic">⚠ 数字异常（折算为月费的 ${mult.toFixed(0)} 倍），请核对套餐</span>`
        : mult < 0.5
          ? `<span class="chip estimate">⚠ 没用够（只值回月费的 ${mult.toFixed(2)}×）</span>`
          : `<span class="chip measured">值回月费 ${mult.toFixed(1)}×</span>`);
    }
    li("", rowHtml(r, chips), hoverOf(r));
  }
  if (metered.length) li("", `<span class="dual-track">按量（按用量付费）</span>`);
  for (const r of metered) {
    const chips = Object.entries(r.amounts).map(([b, v]) => {
      let label = DUAL_LABEL[b] || b;
      if (b === "metered_estimate") {
        label = r.pricing_methods.has("fair-market") ? "按公允价估算"
          : r.pricing_methods.has("fair-market-fallback") ? "按官方价估算" : "按量估算（上界）";
      }
      const cls = b === "metered_actual" || b === "host_billed" ? "measured" : "estimate";
      return `<span class="chip ${cls}">${label} ${fmtCur(v, r.currency || null)}${cls === "estimate" ? "（参考）" : ""}</span>`;
    });
    if (r.has_unresolved) chips.push(unresolvedChip);
    li("", rowHtml(r, chips), hoverOf(r));
  }
  if (unresolved.length) li("", `<span class="dual-track">无法归类</span>`);
  for (const r of unresolved) {
    li("", rowHtml(r, [r.has_unresolved ? unresolvedChip : '<span class="chip">无数据</span>']), hoverOf(r));
  }
}

// 决策卡「现在该用谁」：四态建议行 + 各订阅窗口/利用率为一行。Codex 是唯一
// 正向余量源（data_codex_quota 的 plan 快照）；Claude Pro 余量不可得（quotaLimits
// 只有拒绝快照，不得反推假百分比）；GLM/MiniMax 无配额证据源 → 只显示利用率。
function renderDecideCard(monthly, quota) {
  const body = document.getElementById("ov-decide-body");
  const byProvider = (monthly && monthly.by_provider) || {};
  body.textContent = "";
  const rows = [];
  // Codex 窗口条（真 meter）
  let codexState = null;
  // plan 快照的真实形状是 limits.primary（fold plan_from_rate_limits 产物），
  // 不是顶层 primary——审查 #1：旧读法恒 undefined，决策卡整条失效。
  const codexWin = quota && quota.limits && quota.limits.primary;
  // 无可用配额证据时保留中性说明，不把未知配额当作零成本。
  const card = document.getElementById("ov-decide-card");
  const observed = quota && Date.parse(quota.observed_at);
  // A snapshot older than 24h, from the future, or past reset cannot describe current headroom.
  const hasQuota = !!(codexWin && overviewNumber(codexWin.used_percent) && codexWin.used_percent <= 100
    && Number.isFinite(observed) && observed <= Date.now() && Date.now() - observed <= 24 * 60 * 60 * 1000
    && overviewNumber(codexWin.resets_at) && codexWin.resets_at * 1000 > Date.now());
  if (card) card.hidden = false;
  const observedEl = document.getElementById("ov-decide-observed");
  if (observedEl) {
    observedEl.textContent = hasQuota && quota.observed_at
      ? "快照 " + formatStatisticsDateTime(new Date(quota.observed_at), { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
      : "";
  }
  if (hasQuota) {
    const used = codexWin.used_percent;
    const remain = Math.max(0, 100 - used);
    const resetsAt = codexWin.resets_at
      ? formatStatisticsDateTime(codexWin.resets_at * 1000, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
      : "未知";
    codexState = remain;
    rows.push(`<li><span class="src-name">Codex（${quota.plan_type || "订阅"}）</span>
      <span class="basis"><span class="meter"><span class="meter-fill ${remain < 15 ? "danger" : ""}" style="width:${remain}%"></span></span>
      <span class="fresh ${remain < 15 ? "stale" : ""}">剩余 ${remain.toFixed(0)}% · ${resetsAt} 重置</span></span></li>`);
  } else {
    rows.push(`<li><span class="src-name">Codex</span><span class="basis"><span class="chip">读不到套餐额度</span></span></li>`);
  }
  // Claude Pro：余量不可得（诚实标注）
  const anthropic = byProvider["claude-code/anthropic"];
  if (anthropic) {
    rows.push(`<li><span class="src-name">Claude Pro</span>
      <span class="basis"><span class="chip" title="Claude Code 只记录被限流的时刻，不提供剩余额度，无法推算百分比">无法读取剩余额度</span></span></li>`);
  }
  // GLM / MiniMax：无配额证据源，只显示利用率（双轨账里已有，这里给决策提示）
  for (const key of ["claude-code/zhipu-glm", "claude-code/minimax"]) {
    const h = byProvider[key];
    if (!h) continue;
    const label = PROVIDER_LABEL[key.split("/")[1]] || key;
    const fee = (h.amounts_by_basis || {}).fixed_subscription || 0;
    const eq = (h.amounts_by_basis || {}).api_equivalent || 0;
    if (fee > 0 && eq > 0) {
      const mult = eq / fee;
      const low = mult < 0.5;
      rows.push(`<li><span class="src-name">${label}</span>
        <span class="basis"><span class="chip ${low ? "estimate" : "measured"}">${low ? "⚠ 没用够" : "值回月费"} ${mult.toFixed(1)}×</span>
        <span class="fresh nowrap">月费 ${fmtCur(fee, h.currency)} · 用量按标价折算 ${fmtCur(eq, h.currency)}</span></span></li>`);
    }
  }
  body.innerHTML = `<ul class="src-list">${rows.join("")}</ul>`;
  // 建议行（四态状态机）
  let advice;
  if (codexState != null && codexState < 15) {
    advice = "Codex 额度较低；请在用量或设置中确认可用线路";
  } else if (codexState != null && codexState <= 100) {
    advice = `Codex 额度还剩 ${codexState.toFixed(0)}%，可继续使用`;
  } else {
    advice = "暂无法给出建议：配额证据不可用或已过期";
  }
  const adviceEl = document.createElement("div");
  adviceEl.className = "decide-advice";
  adviceEl.textContent = "💡 " + advice;
  body.appendChild(adviceEl);
  if (card && card.classList) card.classList.toggle("warn", codexState != null && codexState < 15);
}

function syncDot(sync) {
  const dot = document.getElementById("wb-sync-dot");
  if (!sync) return;
  dot.className = "sync-dot" + (sync.ok ? " ok" : sync.stage === "never" ? "" : " fail");
  dot.title = sync.message || (sync.ok ? "同步正常" : "同步状态未知");
}

// v0.9 Stage 0.6 共用渲染器：把 data_monthly_summary 的 DTO 渲染成
// 「数据源」panel。**核心纪律**（spec §0.1）：
// - unavailable 宿主固定显示「无数据」，**绝不渲染 0.00**（空宿主 amount
//   字段是空 map 不是 0，0.00 会让用户把"没测到"误读成"测到 0 元"——
//   .sum() 产 -0.0 的负零事件就是这条纪律踩出来的，DTO 已修到正零），
// - 金额一律带 basis 标签：metered_actual→「实测」、metered_estimate→「估算」、
//   api_equivalent→「套餐等价·诊断」、fixed_subscription→「订阅」、
//   host_billed→「宿主账单」，不允许裸数字；
// - **不带货币符号**——DTO 刻意不带 currency：claude 的 CNY 估与 USD 诊
//   断混在同一 map，前端写 "¥549" 就是编造币种。
// - staleness 必须挂在宿主行右侧（与数字同排），不许只藏到下方 note：
//   用户从卡片本身就能判断"是不是真的"，这是 2026-09-01 alert stale
//   事故里 month.json 与 alert.json 自相矛盾的同款教训。
const BASIS_LABEL = {
  metered_actual: { label: "实测", cls: "measured" },
  metered_estimate: { label: "估算", cls: "estimate" },
  api_equivalent: { label: "套餐等价·诊断", cls: "diagnostic" },
  fixed_subscription: { label: "订阅", cls: "subscription" },
  host_billed: { label: "宿主账单", cls: "hostbilled" },
};
// id 顺序：DTO 给的 BTreeMap 键序就是事实序（白盒契约：白盒降级是从这点
// 开始的——以后 summary 给排序时删这里）。
const HOST_DISPLAY = {
  "dsh": "DeepSeek Harness",
  "claude-code": "Claude Code",
  "codex": "Codex",
  "workbuddy": "WorkBuddy",
};

function freshnessText(state, lastObservedAt) {
  const at = (lastObservedAt || "").slice(0, 10);
  switch (state) {
    case "fresh": return at ? "新鲜 · 观测 " + at : "新鲜";
    case "stale": return "⚠ 过期 · 最后观测 " + at;
    case "partial": return "部分覆盖 · 最后观测 " + at;
    case "unavailable":
    default: return "无数据";
  }
}

function pricingMethodText(method) {
  return {
    "provider-card": "原厂价格卡",
    "fair-market": "官方价参考估算",
    "fair-market-fallback": "当前价参考估算",
  }[method] || null;
}

function pricingReasonText(reason) {
  return {
    "missing-provider-route-evidence": "付费路由待确认",
    "billing-route-unknown": "付费方式待确认",
    "provider-specific-card-unavailable": "缺少对应服务商价卡",
    "missing-or-unpriced-route-evidence": "来源或价格仍待确认",
    "no-price-card": "没有匹配的原厂价格卡",
    "no-pricing-snapshot": "历史缺少事件时间的价格快照",
  }[reason] || null;
}

function renderSourcesPanel(dto, prefix) {
  const list = document.getElementById(prefix + "-list");
  const empty = document.getElementById(prefix + "-empty");
  const meta = document.getElementById(prefix + "-meta");
  list.innerHTML = "";
  meta.innerHTML = "";

  const byHost = dto.by_host || {};
  const keys = Object.keys(byHost);
  const allUnavailable = keys.every(
    (k) => !byHost[k].freshness || byHost[k].freshness.state === "unavailable"
  );

  if (allUnavailable && (dto.excluded_hosts || []).length > 0
      && Object.keys(byHost).length === 0) {
    empty.hidden = false;
    empty.textContent = "本月无跨宿主数据";
  } else {
    empty.hidden = true;
    for (const id of keys) {
      const row = byHost[id];
      const li = document.createElement("li");
      const fs = (row.freshness || {}).state || "unavailable";
      const unavailable = fs === "unavailable";
      li.className = unavailable ? "no-data" : "";

      const name = document.createElement("span");
      name.className = "host";
      name.textContent = HOST_DISPLAY[id] || id;
      li.appendChild(name);

      const basisEl = document.createElement("span");
      basisEl.className = "basis";
      if (unavailable) {
        // 不产 basis chip——chip 会让用户以为"这里有金额"，更糟的是
        // 把 empty map 渲染成「0.00 实测」（spec §0.1 反面教材）。
        const span = document.createElement("span");
        span.className = "chip";
        span.textContent = "无数据";
        basisEl.appendChild(span);
      } else {
        const entries = Object.entries(row.amounts_by_basis || {});
        if (entries.length === 0) {
          // 有观测日但全 unknown（claude 全 unknown 日等）：不算 unavailable，
          // 也不产金额——chip 标「无可计金额」+ has_unresolved=true 时再加
          // 红 tag「含未定价 tokens」。
          const span = document.createElement("span");
          span.className = "chip";
          span.textContent = "无可计金额";
          basisEl.appendChild(span);
        } else {
          for (const [b, v] of entries) {
            const meta2 = BASIS_LABEL[b];
            if (!meta2) continue;
            const chip = document.createElement("span");
            chip.className = "chip " + meta2.cls;
            chip.textContent = meta2.label + " " + v.toFixed(2);
            basisEl.appendChild(chip);
          }
        }
        if (row.has_unresolved) {
          const t = document.createElement("span");
          t.className = "unresolved-tag";
          t.textContent = "含未定价 tokens";
          t.title = "看见了 token 但价目表认不出模型——部分用量暂无法估价，不计 0 也不算没测";
          basisEl.appendChild(t);
        }
      }
      li.appendChild(basisEl);

      const pricing = pricingMethodText(row.pricing_method);
      const reason = pricingReasonText(row.unresolved_reason);
      if (pricing || reason || row.has_unresolved) {
        const explain = document.createElement("span");
        explain.className = "pricing-explain";
        explain.textContent = pricing || "价格暂不可用";
        if (reason) explain.textContent += " · " + reason;
        explain.title = [row.pricing_method, row.unresolved_reason].filter(Boolean).join(" · ");
        li.appendChild(explain);
      }

      const fr = document.createElement("span");
      fr.className = "fresh " + fs;
      fr.textContent = freshnessText(fs, (row.freshness || {}).last_observed_at);
      li.appendChild(fr);

      list.appendChild(li);
    }
  }

  // coverage + excluded + summable。summable 行是诚实窗口外的最后一道：
  // 即便所有宿主都显示「无数据」，summable 也必须是 0 + 备注，而不是消失。
  const cov = dto.coverage || { measured_fields: 0, total_fields: 0, denominator_version: 1 };
  const covLine = document.createElement("div");
  covLine.textContent = "数据覆盖 " + cov.measured_fields + "/" + cov.total_fields +
"";
  meta.appendChild(covLine);

  const excluded = dto.excluded_hosts || [];
  const excLine = document.createElement("div");
  if (excluded.length === 0) {
    excLine.textContent = "范围外：（无）";
  } else {
    excLine.textContent = "范围外：" + excluded.map((h) => HOST_DISPLAY[h] || h).join("、");
  }
  meta.appendChild(excLine);

  // summable 行：unavailable 时改显「无数据」红字 + 备注，绝不显 0.00。
  const summable = dto.total_summable;
  const anyData = keys.some((k) => (byHost[k].freshness || {}).state !== "unavailable");
  const sumLine = document.createElement("div");
  sumLine.className = "summable" + (anyData ? "" : " no-data");
  if (anyData && summable > 0) {
    sumLine.textContent = "账单级实付 " + fmtCur(summable, "CNY");
    const note = document.createElement("span");
    note.className = "note";
    note.textContent = "估算与套餐等价值不计入账单";
    sumLine.appendChild(note);
  } else if (anyData) {
    // 审查 UX#4：DSH stale（非 unavailable）但 summable 恒 0 时渲染大号
    // "0.00" 浅色盒，与头部 ¥580+$1497 同屏对撞，读起来像"钱没了"。降级
    // 为行内灰字说明白"为什么是 0"。
    sumLine.className = "summable-zero";
    sumLine.textContent = "账单级实付：无（当月各家均为估算/套餐等价口径，或数据过期，未出账单）";
  } else {
    sumLine.textContent = "账单级实付：无数据";
    const note = document.createElement("span");
    note.className = "note";
    note.textContent = "全部宿主 unavailable；spec §0.1 不得渲染为 ¥0 或看似完整的总额";
    sumLine.appendChild(note);
  }
  meta.appendChild(sumLine);
}

function renderSourcesPanelFailure(message, prefix) {
  const list = document.getElementById(prefix + "-list");
  const empty = document.getElementById(prefix + "-empty");
  const meta = document.getElementById(prefix + "-meta");
  list.innerHTML = "";
  meta.innerHTML = "";
  empty.hidden = false;
  empty.textContent = "跨宿主源状态读取失败：" + message;
}

// ---------- Token 日历 ----------

function calendarCostText(row) {
  if (!row) return "";
  const parts = [];
  const cny = (row.dsh_cost_cny || 0) + (row.claude_cost_cny || 0);
  const usd = (row.claude_cost_usd || 0) + (row.codex_cost_usd || 0);
  if (cny > 0) parts.push(fmtCur(cny, "CNY"));
  if (usd > 0) parts.push(fmtCur(usd, "USD"));
  return parts.join(" + ");
}

async function renderCalendar() {
  const grid = document.getElementById("cal-grid");
  const empty = document.getElementById("cal-empty");
  const total = document.getElementById("cal-total");
  const monthInput = document.getElementById("cal-month");
  monthInput.value = calMonth;

  // v0.9 Stage D：日历数据源切逐日跨宿主（read_calendar_month）——此前只画
  // DSH 日轴，DSH 零用量月份让 claude/codex 的真实用量在日历上完全不可见
  // （2026-09 实测：57 亿 token 的月份显示一片空白）。旧 read_month 命令
  // v0.9.1 Phase 4 已退役。
  let resp;
  try {
    resp = await invoke("read_calendar_month", { month: calMonth });
  } catch (e) {
    empty.hidden = false;
    empty.textContent = "读取失败：" + errText(e);
    grid.innerHTML = "";
    total.textContent = "";
    return;
  }
  calData = resp;
  grid.innerHTML = "";

  // 数据源 panel（v0.9 Stage 0.6 日历页月份级诚实状态）：并发拉
  // data_monthly_summary，失败不拖垮方格（spec §0.1：日轴与跨宿主源各自
  // 诚实渲染，不互相替代）。方格走 read_month 的 DSH 日轴数据，月级源
  // 状态走 data_monthly_summary——方格与月级源可能分别有/无数据，不许混为一谈。
  let calSourcesDto = null;
  try {
    calSourcesDto = await invoke("data_monthly_summary", { month: calMonth });
  } catch (eCal) {
    renderSourcesPanelFailure(errText(eCal), "cal-sources");
    calSourcesDto = null;
  }
  // cal-total 加新鲜度标注——stale 必须挂在金额旁边，不许只藏到下方 note。
  const calTotalEl = total;
  let calSuffix = "";
  if (calSourcesDto && calSourcesDto.freshness) {
    const fs = calSourcesDto.freshness.state;
    const at = (calSourcesDto.freshness.last_observed_at || "").slice(0, 10);
    if (fs === "fresh") {
      calSuffix = "（新鲜）";
    } else if (fs === "stale") {
      calSuffix = "（数据停在 " + at + "）";
    } else if (fs === "partial") {
      calSuffix = "（部分覆盖）";
    }
    // unavailable 状态：标题不显示金额（spec §0.1 不渲染 0.00）——交由
    // 下方 sources panel 的渲染函数统一处理，这里只覆盖"金额存在"分支。
  }

  // 逐日 map + 月合计（token 跨宿主可加；钱分币并列，口径各异不合并）。
  const calDays = resp.days || {};
  const byDate = calDays;
  let monthTokens = 0;
  const monthCosts = {};
  let hasData = false;
  for (const row of Object.values(calDays)) {
    if ((row.total_tokens || 0) > 0) hasData = true;
    monthTokens += row.total_tokens || 0;
    for (const k of ["dsh_cost_cny", "claude_cost_cny"]) monthCosts.CNY = (monthCosts.CNY || 0) + (row[k] || 0);
    for (const k of ["claude_cost_usd", "codex_cost_usd"]) monthCosts.USD = (monthCosts.USD || 0) + (row[k] || 0);
  }
  if (!hasData) {
    empty.hidden = false;
    empty.textContent = "该月暂无数据";
    total.textContent = calSourcesDto && calSourcesDto.freshness.state !== "unavailable"
      ? "" : calSuffix;
    if (calSourcesDto) renderSourcesPanel(calSourcesDto, "cal-sources");
    document.getElementById("cal-note").textContent =
      "三宿主该月都没有 token 入账（历史月数据按各自归档；当月无数据 = 还没折进账）。";
    return;
  }
  empty.hidden = true;
  const monthCostText = [
    monthCosts.CNY > 0 ? fmtCur(monthCosts.CNY, "CNY") : "",
    monthCosts.USD > 0 ? fmtCur(monthCosts.USD, "USD") : "",
  ].filter(Boolean).join(" + ");
  total.textContent = calMetric === "cost"
    ? (monthCostText ? monthCostText + " · 成本（按来源口径）" : "成本不可用")
    : fmtTokens(monthTokens) + " tokens";
  if (calSuffix) total.textContent += " " + calSuffix;

  const dows = ["日", "一", "二", "三", "四", "五", "六"];
  for (const d of dows) {
    const h = document.createElement("div");
    h.className = "cal-dow";
    h.textContent = d;
    grid.appendChild(h);
  }

  const [y, m] = calMonth.split("-").map(Number);
  // 这些是“日期字符串”的民历运算，不是时间戳投影。使用 UTC 仅作为
  // 无时区的日期容器，避免浏览器本地时区在西区/东区把首日星期或月末
  // 推到前后一天；统计数据本身仍按 statisticsTimezoneName() 查询。
  const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const today = statisticsToday();
  // DSH 的最后观测日（月级，来自 data_monthly_summary.by_host.dsh）——过期时
  // 格子 tooltip 说明 ¥ 段缺席的含义（审查 UX#7）。
  const dshRow = calSourcesDto && calSourcesDto.by_host && calSourcesDto.by_host.dsh;
  const dshStale = dshRow && dshRow.freshness.state === "stale"
    ? (dshRow.freshness.last_observed_at || "").slice(0, 10) : null;

  for (let i = 0; i < lead; i++) {
    const c = document.createElement("div");
    c.className = "cal-cell blank";
    grid.appendChild(c);
  }
  for (let d = 1; d <= dim; d++) {
    const date = calMonth + "-" + String(d).padStart(2, "0");
    const cell = document.createElement("div");
    cell.className = "cal-cell";
    const row = byDate[date];
    const dayTokens = row ? (row.total_tokens || 0) : 0;
    if (dayTokens > 0) {
      cell.classList.add("has-data");
      // 副行：该日耗费，每段带宿主短前缀（审查 UX#6——三段无宿主的钱串只能
      // 靠页脚图例反推，全 USD 时连顺序锚都没有）。口径各异不相加。
      const costs = [];
      if ((row.dsh_cost_cny || 0) > 0) costs.push("DSH " + fmtCur(row.dsh_cost_cny, "CNY"));
      if ((row.claude_cost_cny || 0) > 0) costs.push("CC " + fmtCur(row.claude_cost_cny, "CNY"));
      if ((row.claude_cost_usd || 0) > 0) costs.push("CC " + fmtCur(row.claude_cost_usd, "USD"));
      if ((row.codex_cost_usd || 0) > 0) costs.push("CX " + fmtCur(row.codex_cost_usd, "USD"));
      const day = document.createElement("div");
      day.className = "d";
      day.textContent = String(d);
      const amt = document.createElement("div");
      amt.className = "amt";
      const costText = calendarCostText(row);
      amt.textContent = calMetric === "cost"
        ? (costText || "成本不可用")
        : fmtTokens(dayTokens);
      cell.appendChild(day);
      cell.appendChild(amt);
      if (calMetric === "cost") {
        const token = document.createElement("div");
        token.className = "cost";
        token.textContent = fmtTokens(dayTokens) + " tokens";
        cell.appendChild(token);
      }
      if (costs.length) {
        const cost = document.createElement("div");
        cost.className = "cost";
        cost.textContent = costs.join(" + ");
        cell.appendChild(cost);
      }
      // tooltip：token 与耗费都按宿主逐行（审查 UX#6：耗费行此前是同一串
      // 无宿主的 costs）；DSH 过期期间显式说明 ¥ 段缺席 = 未测到（UX#7）。
      cell.title =
        "DSH " + fmtTokens(row.dsh_tokens || 0) + "（" + fmtCur(row.dsh_cost_cny, "CNY") + "）" +
        "\nClaude " + fmtTokens(row.claude_tokens || 0) + "（" +
        [fmtCur(row.claude_cost_cny, "CNY"), fmtCur(row.claude_cost_usd, "USD")].join(" + ") + "）" +
        "\nCodex " + fmtTokens(row.codex_tokens || 0) + "（" + fmtCur(row.codex_cost_usd, "USD") + "）" +
        "\n耗费口径：DSH 实测 / Claude relay 估算 / Codex 等价标价，不相加" +
        (dshStale ? "\n⚠ DSH 数据过期（最后观测 " + dshStale + "）：¥ 段缺席 = 未测到，非零支出" : "");
    } else {
      const day = document.createElement("div");
      day.className = "d";
      day.textContent = String(d);
      cell.appendChild(day);
    }
    if (date === today) cell.classList.add("today");
    // 审查 UX#8：未来日与"没测到"同款渲染，用户无法区分"还没发生"和
    // "发生过但没测到"——未来日降透明度，不参与无数据解读。
    if (date > today) cell.classList.add("future");
    // 当日按小时面板的入口：点任意非未来日 → 下方面板切到该日
    // （未来日没有"按小时"可看，不响应）。
    if (date <= today) {
      cell.classList.add("clickable");
      const selectDate = () => {
        calSelectedDate = date;
        grid.querySelectorAll(".cal-cell.selected").forEach((el) => el.classList.remove("selected"));
        cell.classList.add("selected");
        renderHourly(date);
      };
      cell.setAttribute("role", "button");
      cell.tabIndex = 0;
      cell.setAttribute("aria-label", date + "，查看按小时用量");
      cell.onclick = selectDate;
      cell.onkeydown = (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectDate();
        }
      };
      if (date === (calSelectedDate || today)) cell.classList.add("selected");
    }
    grid.appendChild(cell);
  }
  document.getElementById("cal-note").textContent = calMetric === "cost"
    ? "方格主行 = 该日成本，按来源分别显示 CNY/USD；无成本证据显示“成本不可用”，不等于 ¥0。副行 = token 总量。点任意过去日 → 下方面板看该日按小时分布。"
    : "方格主行 = 该日三宿主 token 总量（DSH + Claude Code + Codex）；副行 = 该日耗费，分宿主分币并列（DSH 实测 / Claude relay 估算 / Codex 等价标价，口径各异不相加）。点任意过去日 → 下方面板看该日按小时分布。";

  // 月份级跨宿主概览：放在方格之后、note 之前。
  if (calSourcesDto) renderSourcesPanel(calSourcesDto, "cal-sources");

  // 当日按小时（旧 calendar.html 小时格组件的工作台接入）——默认选中今天。
  renderHourly(calSelectedDate || today);
}

// 当日按小时分布。数据来源矩阵（read_hourly_distribution 的 hosts_available
// 值即来源，逐宿主如实渲染）：codex=fold 全量历史；dsh=今日 today-json /
// 历史日 facts-index（该日会话被 ingest 过才有）；claude=facts-index。
// 「来源标注让部分覆盖可见」：claude/dsh 的索引小时只含已 ingest 会话，
// 值偏小不是 bug 是覆盖面——标注写进面板 note。
async function renderHourly(date) {
  const grid = document.getElementById("hourly-grid");
  const note = document.getElementById("hourly-note");
  const titleDate = document.getElementById("hourly-date");
  if (!grid) return; // calendar tab 未建（防御；HTML 里有就该在）
  titleDate.textContent = date + (date === statisticsToday() ? "（今天）" : "");
  grid.innerHTML = "";
  let resp;
  try {
    resp = await invoke("read_hourly_distribution", { date });
  } catch (e) {
    note.textContent = "读取失败：" + errText(e);
    return;
  }
  const hours = resp.hours || [];
  const src = resp.hosts_available || {};
  const HOSTS = [
    ["dsh_tokens", "DSH", "hour-dsh"],
    ["claude_tokens", "CC", "hour-claude"],
    ["codex_tokens", "CX", "hour-codex"],
  ];
  let maxTotal = 0;
  const totals = hours.map((h) =>
    HOSTS.reduce((s, [k]) => s + (h[k] || 0), 0)
  );
  for (const v of totals) if (v > maxTotal) maxTotal = v;
  hours.forEach((h, i) => {
    const cell = document.createElement("div");
    const total = totals[i];
    cell.className = "hour-cell" + (total === 0 ? " empty" : "") +
      (total > 0 && total === maxTotal ? " peak" : "");
    const hh = String(h.hour).padStart(2, "0");
    if (total === 0) {
      // 全宿主该小时都没有测量——空格（虚线），不是 0。
      cell.title = hh + ":00–" + hh + ":59 " + statisticsTimezoneName() + " · 该小时三宿主都没有已测用量";
    } else {
      const bar = document.createElement("div");
      bar.className = "hour-bar";
      // 分段条：各宿主一段（高度占比 = 该宿主 / 全日峰值），从下往上堆。
      // 分段高是**各自占总峰值的比**，不是互相归一——一眼能比跨宿主量级。
      for (const [k, name, cls] of HOSTS) {
        const v = h[k] || 0;
        if (v <= 0) continue;
        const seg = document.createElement("div");
        seg.className = "hour-seg " + cls;
        seg.style.height = Math.max(3, Math.round((v / maxTotal) * 52)) + "px";
        bar.appendChild(seg);
      }
      cell.appendChild(bar);
      const lab = document.createElement("div");
      lab.className = "hour-label";
      lab.textContent = hh;
      cell.appendChild(lab);
      const lines = HOSTS
        .map(([k, name]) => [name, h[k]])
        .filter(([, v]) => v != null && v > 0)
        .map(([name, v]) => name + " " + fmtTokens(v));
      cell.title = hh + ":00–" + hh + ":59 " + statisticsTimezoneName() + "\n" + lines.join("\n");
    }
    grid.appendChild(cell);
  });
  const srcNote = [];
  srcNote.push("Codex：全量折算（fold）");
  srcNote.push(src.dsh === "today-json"
    ? "DSH：今日实时桶"
    : src.dsh === "facts-index" ? "DSH：已 ingest 会话的小时重放（部分覆盖可能偏小）"
    : "DSH：无小时数据（历史日未持久化；该日会话未 ingest）");
  srcNote.push(src.claude === "facts-index"
    ? "Claude：已 ingest 会话的小时重放（部分覆盖可能偏小）"
    : "Claude：无小时数据（ledger 只有日轴；该日会话未 ingest）");
  note.textContent = srcNote.join(" · ") + "。空格 = 该小时没有已测用量（不是 0）。";
}

function shiftMonth(delta) {
  const [y, m] = calMonth.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + delta, 1));
  calMonth = t.getUTCFullYear() + "-" + String(t.getUTCMonth() + 1).padStart(2, "0");
  renderCalendar();
}

// ---------- 会话（列表 + 详情） ----------

// 同一时刻至多一个 page fetch。首页 fetch、用户「更多」、后台预取三者共用同一
// 条 `fetchSessionsPage` 追加路径；没有这层守卫，「更多」与预取并发读同一个
// nextCursor 会双双拉同一页 → 重复追加。
let sessFetching = false;
// reset/reload 时 ++，作废在途预取：加载中途被重置，旧预取的本页不得续写新状态。
let sessPrefetchGen = 0;
let sessPrefetchActive = false;

async function loadSessions(reset) {
  if (reset) {
    sessState = { items: [], nextCursor: null, total: null, loaded: true, error: false };
    sessPrefetchGen++; // 作废在途预取（下一段 await 回来时 gen 对不上，整页丢弃）
    document.getElementById("sess-banner").hidden = true;
  }
  sessState.loaded = true;

  // `sessions_list` spawn 二进制、首次（冷 cache）要几十秒才回——真机实测过
  // 631MB/115 个会话文件冷启动 30+ 秒（2026-09 起：store 构建并行 + app 启动
  // 后台预热 + IPC 走 spawn_blocking，等待被压到秒级且不再冻 UI，这条兜底保留）。
  // 这段等待期间之前完全没有任何视觉反馈（tab 面板就是空的），跟窗口真的假死
  // 在观感上没有区别，这是用户报告"点 tab 卡到假死"的直接原因之一，不只是 IPC
  // 本身慢。加一条"加载中…"，至少让等待是可见、可解释的等待，不是看起来卡死
  // 的等待。
  const loadingEl = document.getElementById("sess-loading");
  loadingEl.hidden = false;
  await fetchSessionsPage(sessPrefetchGen);
  loadingEl.hidden = true;
  // 首页渲染完立刻后台续拉剩余页（「分批出来」）：续页走 cache 命中快路径
  // （~0.1s/页），每页到就重渲染，用户首屏先见第 1 页、数据随后自动补完，不用
  // 手动点「更多」等后续。
  if (sessState.nextCursor) prefetchRemainingPages();
}

/// 拉一页并追加到 `sessState`。守卫 `sessFetching` 防双跑双追；`gen` 是预取代，
/// 中途 reset 后对不上 → 整页丢弃（不续写新状态）。
async function fetchSessionsPage(gen) {
  if (sessFetching) return false;
  sessFetching = true;
  try {
    const args = { pageSize: 50 };
    // 月份窗口（修「上个月会话看不到」）：picker 选了 YYYY-MM 时透传给 IPC，
    // store.rs list_args 优先 month（更粗、用户主动选择）走 --month 路径。
    // picker 为空 → 不传 month → IPC 用 day 兜底为今天（旧契约）。
    // day 字段目前没用（保留 IPC 入参面，未来若加 day picker 再启用）。
    const windowMode = document.getElementById("sess-window").value;
    const monthVal = document.getElementById("sess-month").value;
    if (windowMode === "today") {
      args.day = statisticsToday();
    } else if (windowMode === "7d") {
      args.date_from = shiftStatisticsDate(-6);
      args.date_to = statisticsToday();
    } else if (windowMode === "custom") {
      const from = document.getElementById("sess-from").value;
      const to = document.getElementById("sess-to").value;
      if (!from || !to) throw new Error("请选择完整的自定义日期范围");
      args.date_from = from;
      args.date_to = to;
    } else if (monthVal) {
      args.month = monthVal;
    }
    const modelVal = document.getElementById("sess-model").value.trim();
    if (modelVal) args.model = modelVal;
    const providerVal = document.getElementById("sess-provider").value.trim();
    if (providerVal) args.provider = providerVal;
    // host 过滤（spec §7.3）：此命令的 Tauri 参数保持 Rust 的 snake_case 名称；
    // 传 camelCase 会被当作缺省 None，导致列表静默退回全宿主。过滤变化时调用方
    // 负责重置分页。
    if (sessFilter !== "all") args.host_kind = sessFilter;
    // cursor：v0.9.1 起是 mcp::sessions_search 的不透明串（`<total>:<key_len>:<key>`），
    // 直接透传，不需要 JSON.stringify（旧 r2a_store cursor 是 JSON 对象，
    // 那是 jsonl 重放路径里存的 filter_hash/store_revision，已退役）。
    if (sessState.nextCursor) args.cursor = sessState.nextCursor;
    const resp = await invoke("sessions_list", args);
    // envelope shape（v0.9.1）：`resp.data.sessions[]` + `resp.data.next_cursor` +
    // `resp.data.has_more` + `resp.data.window_total_tokens`。
    // 旧 r2a list DTO 把分页嵌在 `resp.page.{items,next_cursor,total}` —— 那个
    // wrapper 已退役，读错层会恒显「暂无会话」的假空（真机实证的缺陷）。
    const data = resp.data || {};
    if (gen != null && gen !== sessPrefetchGen) return false; // 中途被 reset → 丢本页
    sessState.items = sessState.items.concat(data.sessions || []);
    sessState.nextCursor = data.next_cursor || null;
    // 会话数与 token 总量是不同指标。此前错误地把 window_total_tokens 直接
    // 写进会话计数，导致 UI 显示「23 亿个会话」。
    sessState.total = data.window_session_count != null
      ? data.window_session_count
      : sessState.items.length;
    sessState.error = false;
    renderSessions();
    return true;
  } catch (e) {
    if (gen != null && gen !== sessPrefetchGen) return false;
    sessState.error = true;
    // 报错不摆「暂无会话」的假空——错误横幅就是错误横幅，跟空态二选一。
    showBanner("sess-banner", e, true);
    renderSessions();
    return false;
  } finally {
    sessFetching = false;
  }
}

/// 首页之后的静默续拉：一条直循环拉完剩余页（58 会话 → 第 2 页只有 8 条）。
/// `sessPrefetchActive` 防多个入口叠出第二条预取链。
async function prefetchRemainingPages() {
  if (sessPrefetchActive) return;
  sessPrefetchActive = true;
  const gen = ++sessPrefetchGen;
  try {
    while (sessState.nextCursor && sessPrefetchGen === gen) {
      if (!(await fetchSessionsPage(gen))) return;
    }
  } finally {
    sessPrefetchActive = false;
  }
}

/// 过滤 chips 的选中态（spec §7.3）：active 的 chip 即当前 sessFilter。深链
/// SessionList 与用户点击都写 sessFilter 后调这里，渲染只有一个入口。
function updateFilterChips() {
  document.querySelectorAll("#sess-filter .chip").forEach((c) => {
    c.classList.toggle("active", c.dataset.host === sessFilter);
  });
}

function renderSessions() {
  const body = document.getElementById("sess-body");
  const count = document.getElementById("sess-count");
  const empty = document.getElementById("sess-empty");
  const more = document.getElementById("sess-more");
  body.innerHTML = "";

  // 月份上下文加到计数后缀，让用户清楚看到「这个数是哪个月」（避免把 2026-08
  // 的 50 条误读成「今天居然跑了 50 条」）。picker 为空 → 显示「今日」。
  const monthEl = document.getElementById("sess-month");
  const windowEl = document.getElementById("sess-window");
  const mode = windowEl ? windowEl.value : "month";
  const suffix = mode === "today" ? "今日"
    : mode === "7d" ? "最近 7 天"
    : mode === "custom"
      ? ((document.getElementById("sess-from").value || "?") + ".." +
         (document.getElementById("sess-to").value || "?"))
      : (monthEl && monthEl.value ? monthEl.value : "本月");
  const statusItems = sessStatusFilter === "all" ? sessState.items
    : sessState.items.filter((s) => s.cost_status && s.cost_status.state === sessStatusFilter);
  count.textContent = sessState.total != null
    ? suffix + " 共 " + (sessStatusFilter === "all"
      ? statusItems.length + " 个会话"
      : statusItems.length + " 个匹配会话（原始 " + sessState.total + "）") + " · 点任意行看报告"
    : "";
  empty.textContent = statusItems.length === 0 && sessState.items.length > 0 ? "没有符合该计费状态的会话" : "暂无会话";
  if (statusItems.length === 0) {
    // error 时隐藏空态：横幅已经说明了数据源问题，不要再摆「暂无会话」冒充真空。
    empty.hidden = sessState.error;
    more.hidden = true;
    return;
  }
  empty.hidden = true;
  for (const s of statusItems) {
    const tr = document.createElement("tr");
    const titleCell = document.createElement("td");
    titleCell.textContent = titleText(s);
    // 行尾 chevron：把「这行能点」写进视觉，不用悬停才发现（原来没有任何提示）。
    const chev = el("span", "row-chevron");
    chev.textContent = "›";
    titleCell.appendChild(chev);
    tr.appendChild(titleCell);
    // v0.9.1 envelope 字段映射（mcp::sessions_search）：
    //   host_kind       → host                       （旧 r2a DTO）
    //   model (str)     → model_ids[0] || "—"         （Vec<String>；多模型取首个
    //                                                显示，详情 envelope.data
    //                                                .model_ids[] 里有完整清单）
    //   date_span.first → first_event_at             （RFC3339 Beijing）
    //   date_span.last  → last_event_at              （同）
    //   tokens_total    → tokens.total               （4 buckets 求和已落 envelope）
    //   cost_usd (f64)  → cost_minor.amount_minor/100 （i64 minor / 100；新路径是
    //                                                usage_facts × pricing_snapshots
    //                                                JOIN 的 metered_estimate，
    //                                                §6.7 跨币相加自动 null——
    //                                                此时 cost 列诚实地「—」，
    //                                                不拿 ¥0.00 冒充没花钱）
    //   findings_total  → null                       （不在权威库 envelope 里；
    //                                                findings 跨会话汇总从 findings
    //                                                tab 看，单会话 finding 数等 M4
    //                                                workflow_events 工具落地后回填）
    tr.appendChild(td(s.host || "—"));
    tr.appendChild(td((Array.isArray(s.model_ids) && s.model_ids.length) ? s.model_ids[0] : "—"));
    const span = (s.first_event_at && s.last_event_at)
      ? s.first_event_at.slice(0, 10) + (s.first_event_at !== s.last_event_at ? " … " + s.last_event_at.slice(0, 10) : "")
      : (s.first_event_at ? s.first_event_at.slice(0, 10) : null);
    tr.appendChild(td(span || "—"));
    const tokensTotal = (s.tokens && typeof s.tokens.total === "number") ? s.tokens.total : null;
    tr.appendChild(tdNum(fmtTokens(tokensTotal)));
    // cost_minor 形状: {amount_minor: i64, currency: "USD"|"CNY"} | null
    // 旧 fmtUSD 收 float|null —— 加小 helper 把 amount_minor 转显示串；
    // null → "—"，命中 → "$1.23" / "¥1.23"（按 currency 走；与 fmtUSD/fmtMoney 同款）。
    tr.appendChild(tdNum(fmtSessionCost(s)));
    tr.appendChild(tdNum("—"));
    tr.addEventListener("click", () => showSession(s));
    body.appendChild(tr);
  }
  more.hidden = !sessState.nextCursor;
}

function td(text) {
  const t = document.createElement("td");
  t.textContent = text;
  return t;
}

function tdNum(text) {
  const t = td(text);
  t.className = "num";
  return t;
}

function titleText(s) {
  if (s.title) return s.title;
  // 无标题（Codex 标题命中 87% 不是 100%）→ 用 session_ref 兜底，诚实不臆造标题。
  // 旧 r2a DTO 用 `s.session_key.native_id`（原始会话 id）；v0.9.1 起 list 行只剩
  // HMAC `session_ref`，把 native_session_id 屏蔽到 IPC 边界外（spec §0.3 PII）。
  // session_ref 是 `sr_<32hex>`，截后 8 位当显示够用，整串也短到不会撑坏列宽。
  if (s.session_ref) return s.session_ref.length > 12
    ? "…" + s.session_ref.slice(-8)
    : s.session_ref;
  return "（无标题）";
}

async function showSession(s) {
  document.getElementById("sess-list-view").hidden = true;
  document.getElementById("sess-detail-view").hidden = false;
  document.getElementById("sess-detail-banner").hidden = true;
  renderDetailSummary(s);
  try {
    // v0.9.1 IPC：session_ref 是 HMAC 不透明串（来自 list 行 data.sessions[].session_ref），
    // 不是 native session_key（spec §0.3 PII：原生 session_key 不再穿过 IPC）。
    const env = await invoke("sessions_read", { sessionRef: s.session_ref });
    renderDetailEnvelope(env);
  } catch (e) {
    // 详情错误不挂「重载」按钮——那个按钮重载的是列表，跟详情无关；用户自己
    // 返回列表即可重进。
    showBanner("sess-detail-banner", e, false);
  }
}

function renderDetailSummary(s) {
  const body = document.getElementById("sess-detail-body");
  body.innerHTML = "";
  const cards = el("div", "detail-cards");
  cards.appendChild(detailCard("标题", titleText(s)));
  // v0.9.1 list 行只有 host + model_ids[]，单模型取首个，多模型在详情 envelope
  // .data.model_ids[] 里有完整清单。
  cards.appendChild(detailCard("模型",
    (Array.isArray(s.model_ids) && s.model_ids.length) ? s.model_ids.join(", ") : "—"));
  // date_span → first_event_at / last_event_at（RFC3339 Beijing）
  cards.appendChild(detailCard("宿主 / 日期",
    (s.host || "—") + " · " + (s.first_event_at ? s.first_event_at.slice(0, 10) : "—")));
  // cost 列：list 行只有 cost_minor（i64 minor / 100），格式化交给 fmtCostMinor。
  // 命中时按 currency 标 USD/CNY；null → "—"（不拿 ¥0.00 冒充没花钱）。
  // envelope 到手后 refreshDetailCards 用真实 session 数据把卡片补上（envelope
  // .data.tokens.total 完整；envelope .data.cost_minor 同样 currency-aware）。
  const costCard = detailCard("估算成本", fmtSessionCost(s), "sess-card-cost");
  costCard.querySelector(".label").id = "sess-card-cost-label";
  cards.appendChild(costCard);
  const tokensTotal = (s.tokens && typeof s.tokens.total === "number") ? s.tokens.total : null;
  cards.appendChild(detailCard("Tokens", fmtTokens(tokensTotal), "sess-card-tokens"));
  // 单会话 finding 数：v0.9.1 envelope 不携带（旧 r2a 预计算，SQL 权威库没有
  // workflow 事件维度）。list 行此列恒为 "—"，详情 envelope 同款。Findings tab
  // 跨会话汇总仍可用（仍走 r2a_store，PR #2.3a 任务 #19 待 M4 workflow_events
  // 工具落地后整段迁 mcp::dispatch）。
  cards.appendChild(detailCard("Findings", "—", "sess-card-findings"));
  body.appendChild(cards);

  const loading = el("div", "detail-section");
  loading.id = "sess-detail-loading";
  const lt = el("div", "detail-section-title");
  lt.textContent = "完整审计报告";
  loading.appendChild(lt);
  const p = el("div", "muted");
  p.textContent = "读取中…";
  loading.appendChild(p);
  body.appendChild(loading);
}

function detailCard(label, value, valueId) {
  const card = el("div", "detail-card");
  const l = el("div", "label");
  l.textContent = label;
  const v = el("div", "value");
  v.textContent = value;
  if (valueId) v.id = valueId;
  card.appendChild(l);
  card.appendChild(v);
  return card;
}

// KPI 卡的数字来自列表行摘要，冷字段本来就可能缺（上面 renderDetailSummary 的
// 注释）。envelope 到手后用真实 session 数据把卡片补上——避免"正下方的完整报告
// 已经有真实数字，卡片却写着三个破折号"这种自相矛盾（真机截图能看到这问题）。
//
// **v0.9.1 envelope 字段**：旧 r2a `session.cost_report` / `session.audit.findings`
// / `session.cost.total` / `session.requests[]` / `session.findings[]` 全部已退役
// ——那些字段来自 jsonl 重放，权威库 mcp::session_detail envelope 不含它们。
// 新 envelope 只给：
//   data.tokens.total        (4 buckets 求和已落 envelope)
//   data.cost_minor          (i64 minor / 100; currency-aware)
//   data.event_count / data.model_ids
// Findings 单会话数等 M4 `workflow_events` 工具落地后回填（任务 #19）。
function refreshDetailCards(session) {
  const costEl = document.getElementById("sess-card-cost");
  const tokensEl = document.getElementById("sess-card-tokens");
  const findingsEl = document.getElementById("sess-card-findings");
  if (!costEl || !tokensEl || !findingsEl) return;

  // tokens：envelope 已落 4 buckets 求和
  if (session.tokens && typeof session.tokens.total === "number") {
    tokensEl.textContent = fmtTokens(session.tokens.total);
  }
  // cost：cost_minor.currency 决定显示成 USD 还是 CNY（不只是数值单位）
  if (session.cost_minor != null) {
    const label = document.getElementById("sess-card-cost-label");
    if (label) {
      label.textContent = session.cost_minor.currency === "USD" ? "估算成本(USD)" : "估算成本(CNY)";
    }
    costEl.textContent = fmtCostMinor(session.cost_minor);
  } else {
    const label = document.getElementById("sess-card-cost-label");
    if (label) label.textContent = "成本状态";
    costEl.textContent = fmtCostStatus(session.cost_status);
  }
  // findings：单会话 finding 数不在权威库 envelope 里——M4 之前保持 "—"
  // （renderDetailSummary 已把卡片初始写成 "—"）
}

function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

// ---------- 单会话报告分区渲染 ----------
//
// 之前这里把整份 envelope `JSON.stringify` 成一个 <pre>——一个 DSH 会话实测
// 286KB，用户点进去看到的是一堵文本墙，等于没有报告。现在按宿主拆分成分区：
// 两份宿主的 session payload 形状几乎不相交（DSH：cost/context/waste/compaction/
// duration/subagents/rule_outcomes/*_coverage；Codex：audit/cost_report/coverage/
// quota_trajectory/permission_transitions/turn_ends/effort/notes/…），所以
// renderCodexSections / renderDshSections 各自认自己的键，认不到就整段不渲染，
// 不拿空壳冒充「无数据」。raw JSON 降级成 <details> 默认折叠，留在最底供排查。

function detailSection(title) {
  const sec = el("div", "detail-section");
  const t = el("div", "detail-section-title");
  t.textContent = title;
  sec.appendChild(t);
  return sec;
}

// 一行「标签 + 比例条 + 值」：成本/上下文构成/工具耗时这类要看占比而不只是读数字
// 的维度用它，不用为每个维度单造一种结构。frac 是调用方算好的 0..1 比例；frac 为
// null 时不画条，只退化成右对齐的值——分母不明时不编一条假比例（同 kvRow 挨着
// null-vs-0 的纪律）。
function barRow(label, value, frac, title) {
  const row = el("div", "bar-row");
  const l = el("span", "bar-label");
  l.textContent = label;
  if (title) l.title = title;
  row.appendChild(l);
  const track = el("span", "bar-track");
  if (frac != null) {
    const fill = el("span", "bar-fill");
    fill.style.width = Math.max(0, Math.min(1, frac)) * 100 + "%";
    track.appendChild(fill);
  }
  row.appendChild(track);
  const v = el("span", "bar-value");
  v.textContent = value;
  row.appendChild(v);
  return row;
}

// ---------- 交互式会话时间线（DSH） ----------
//
// dsh-client TimelinePanel 的全功能对齐（用户反馈「折线图功能不完整」）。数据准备
// 镜像 dsh-client timeline.ts 的 DSH 适配（valueOf/modelSwitchEvents/事件定位），
// 渲染壳镜像 TimelinePanel.tsx 的交互集。几何（比例尺/缺口/聚合/事件定位合并）一律
// 来自共享 timeline.js 的 buildGeometry——这里**不做**任何比例尺/计价数学：token 求和
// 公式在 core request_metrics 钉死，逐请求费用由信封 cost_series（Part A）透出，
// 浏览器只读不重算。定位/取值逻辑是展示层第二份（dsh-client 一份、这里一份），属
// 既有「每前端一份 data-prep」格局，不构成 CLAUDE.md 的「第四份拷贝」（计算无第二份）。

// h 多给 8px（190→198）：eventY 标记底缘（±5 → 177）与 turn 刻度文字顶缘原本只
// 隔 ~2px，事件聚堆时圆点和 T65/T80 标签视觉上顶在一起（真实截图可见）。.tl-chart
// 是 height:auto，viewBox 变高就是真实的额外间隔。
const TL_GEO = { w: 1000, h: 198, curveTop: 10, curveBottom: 150, eventY: 172, x0: 6, x1: 994 };
// 「慢」事件阈值：工具调用 ≥60s 才算慢（D9 语义的固定阈值；dsh-client 那边由用户在
// DurationSection 设阈值，工作台固定一个，不额外给设置项）。
const TL_SLOW_MS = 60 * 1000;
const TL_SVGNS = "http://www.w3.org/2000/svg";
const TL_KIND_LABELS = { risk: "风险", waste: "浪费", compaction: "压缩", model: "切换", subagent: "子代理", skill: "skill", slow: "慢" };
const TL_KIND_ORDER = ["risk", "waste", "compaction", "model", "subagent", "skill", "slow"];

// 每行在当前纵轴下的值。null = 这一行没测到（不是 0）——镜像 dsh-client valueOf。
//  - context：provider 实测的该次请求上下文占用（原始值，缺值断开）。
//  - tokens：该次请求消耗的 token 总量（delta，几何层再累加成累计曲线）。
//  - cost：已经是累计值（信封 cost_series 算好），几何层 'carry' 直接透传。
function tlValueOf(mode, r, cum) {
  if (mode === "context") return r.context_tokens != null ? Number(r.context_tokens) : null;
  if (mode === "cost") return cum != null ? cum : null;
  const parts = [r.uncached_input_tokens, r.output_tokens, r.cache_read_tokens];
  if (parts.every((v) => v == null)) return null;
  return parts.reduce((s, v) => s + (v || 0), 0);
}

// 模型切换点：相邻两行 model 不同即为一次切换（镜像 dsh-client modelSwitchEvents）。
function tlModelSwitchEvents(reqs) {
  const out = [];
  for (let i = 1; i < reqs.length; i++) {
    if (reqs[i].model && reqs[i].model !== reqs[i - 1].model) {
      out.push({ kind: "model", seq: reqs[i].seq, turn: reqs[i].turn, label: reqs[i].model });
    }
  }
  return out;
}

// 把事件定位到横轴上某个 request 的 seq（points 的 ordinal 就是 r.seq）：
//   1. seq 精确命中某请求 → 该请求的 seq；
//   2. seq 落在两个请求之间 → 「进行中的请求」（最后一个 seq ≤ ev.seq），语义同
//      dsh-client 的 indexForSeq——事件发生在那次请求进行当中，标在该请求上不算猜；
//   3. 无 seq → 该 turn 的第一个请求（indexForTurn）。
// 全落空 → null，调用方诚实跳过（定位不到不画在猜的位置上）。
function tlOrdinalFor(seq, turn, reqs) {
  if (seq != null) {
    for (let i = reqs.length - 1; i >= 0; i--) {
      const s = reqs[i].seq;
      if (s != null && s <= seq) return s;
    }
  }
  if (turn != null) {
    for (const r of reqs) if (r.turn === turn && r.seq != null) return r.seq;
  }
  return null;
}

// 第 idx 行在它所属 turn 里是第几次请求 / 该 turn 共几次（镜像 dsh-client
// requestOrdinal，信息面板的「turn · request n/m · req{seq}」）。turn 空 → null。
function tlRequestOrdinal(reqs, idx) {
  const turn = reqs[idx] && reqs[idx].turn;
  if (turn == null) return null;
  let n = 0, m = 0;
  for (let i = 0; i < reqs.length; i++) {
    if (reqs[i].turn !== turn) continue;
    m++;
    if (i <= idx) n++;
  }
  return { n, m };
}

// DSH 单会话时间线的数据准备：points（三档纵轴的 values 一次算好）+ 事件（7 种）。
// 返回 null = 没有可画数据（调用方不渲染这一节）。全部输入来自 core 发射器：
// request_metrics（tokens/context）、cost_series（逐请求累计费用）、findings/waste/
// compaction/subagents/skill/duration（事件源）。
function dshTimelineData(session) {
  const reqs = Array.isArray(session.requests) ? session.requests : null;
  if (!reqs || reqs.length === 0) return null;

  // cost_series（Part A 信封键）：{series:[{request_seq,cumulative}], priced, total}，
  // 与 requests 同序（request_seq 即 1..n 行号）；每个请求都有累计条目——未计价
  // （is_peak null / 未知模型）那笔保持上一笔的累计值，几何层 'carry' 沿用不再加。
  const costSeries = session.cost_series && Array.isArray(session.cost_series.series)
    ? session.cost_series.series : [];
  const cumByReqSeq = new Map();
  for (const s of costSeries) if (s && s.request_seq != null) cumByReqSeq.set(s.request_seq, s.cumulative);
  const hasCost = costSeries.length > 0;

  const points = reqs.map((r, i) => ({
    ordinal: r.seq != null ? r.seq : i,
    task_id: r.turn != null ? r.turn : null,
    values: {
      context: tlValueOf("context", r, null),
      tokens: tlValueOf("tokens", r, null),
      cost: tlValueOf("cost", r, cumByReqSeq.get(i + 1) ?? null),
    },
  }));

  const hasContext = reqs.some((r) => r.context_tokens != null);
  const hasTokens = reqs.some((r) =>
    r.uncached_input_tokens != null || r.output_tokens != null || r.cache_read_tokens != null);

  // 事件定位（7 种）。targetId 指向 findingsSection 里对应 finding 行的 DOM id，
  // 点击/回车可跳转——与 dsh-client 的 onFocus 同义；没有对应行的种 targetId 为
  // null，点击是空操作（仍可 hover/焦点读取）。
  const events = [];
  const pushEv = (kind, seq, turn, label, severity, targetId, skillMode) => {
    const ord = tlOrdinalFor(seq, turn, reqs);
    if (ord == null) return;
    events.push({ kind, ordinal: ord, turn: turn != null ? turn : null, label, severity, targetId, skillMode });
  };

  (Array.isArray(session.findings) ? session.findings : [])
    .forEach((f, i) => pushEv("risk", f.seq, f.turn,
      (f.rule || "?") + " " + (f.evidence || ""), f.severity || "info", "tl-finding-" + i, null));

  (Array.isArray(session.waste) ? session.waste : [])
    .forEach((w) => pushEv("waste", w.seq, w.turn,
      (w.rule || "?") + " " + fmtTokens(w.waste_tokens) + " token", w.severity || "info", null, null));

  if (session.compaction) {
    (Array.isArray(session.compaction.compactions) ? session.compaction.compactions : [])
      .forEach((c) => pushEv("compaction", c.start_seq, c.turn, "压缩", null, null, null));
    (Array.isArray(session.compaction.prunes) ? session.compaction.prunes : [])
      .forEach((p) => pushEv("compaction", p.seq, p.turn,
        "剪枝 " + fmtTokens(p.shadowed_token_count) + " token", null, null, null));
  }

  (Array.isArray(session.subagents) ? session.subagents : [])
    .forEach((a) => pushEv("subagent", a.seq, a.turn,
      "子代理 " + (a.description || a.agent_id || "—"), null, null, null));

  (Array.isArray(session.skill) ? session.skill : []).forEach((sk) => {
    // skill 行带 request_seq（core 回填的 1..n 行号）→ 直接精确到那个请求，最可靠；
    // 旧会话没有该字段才退回 seq/turn 定位。
    let ord = null;
    if (sk.request_seq != null) {
      const r = reqs[sk.request_seq - 1];
      if (r && r.seq != null) ord = r.seq;
    }
    if (ord == null) ord = tlOrdinalFor(sk.seq, sk.turn, reqs);
    if (ord == null) return;
    events.push({
      kind: "skill", ordinal: ord, turn: sk.turn != null ? sk.turn : null,
      label: "skill " + (sk.name || "?"), targetId: null,
      skillMode: sk.trigger_mode === "explicit" ? "explicit" : "model_selected",
    });
  });

  // slow ← duration.tool_calls 里 ≥TL_SLOW_MS 的慢调用（十字形状，D9 语义）。
  const calls = session.duration && Array.isArray(session.duration.tool_calls)
    ? session.duration.tool_calls : [];
  for (const c of calls) {
    if (c.duration_ms == null || c.duration_ms < TL_SLOW_MS) continue;
    pushEv("slow", c.seq, c.turn,
      (c.tool_name || "?") + " " + (c.duration_ms / 1000).toFixed(1) + "s", null, null, null);
  }

  for (const m of tlModelSwitchEvents(reqs)) pushEv("model", m.seq, m.turn, m.label, null, null, null);

  const modes = [];
  if (hasTokens) modes.push({ id: "tokens", label: "Token", cumulative: true });
  if (hasContext) modes.push({ id: "context", label: "上下文", cumulative: false });
  if (hasCost) modes.push({ id: "cost", label: "费用", cumulative: "carry" });
  // 三档全空（requests 在但哪档都没测到）→ 没有可画的纵轴，整节不渲染，不拿
  // 空壳冒充「无数据」。
  if (modes.length === 0) return null;

  return {
    points, events, reqs, modes,
    costMeta: hasCost && session.cost_series
      ? { priced: session.cost_series.priced != null ? session.cost_series.priced : 0,
          total: session.cost_series.total != null ? session.cost_series.total : reqs.length }
      : null,
  };
}

// —— SVG 构造小助手（事件形状/轴标签） ——

function tlSvgEl(tag) { return document.createElementNS(TL_SVGNS, tag); }

function tlSvgText(svg, cls, x, y, text) {
  const t = tlSvgEl("text");
  t.setAttribute("class", cls);
  t.setAttribute("x", x);
  t.setAttribute("y", y);
  t.textContent = text;
  svg.appendChild(t);
  return t;
}

// 7 种事件形状（镜像 TimelinePanel 的 EVENT_STYLE）：
//   compaction 方块（7×7 圆角） / model 薄 tick（1.5×10） / subagent 三角 /
//   skill 菱形（explicit）或圆（model_selected） / slow 十字 / 其余圆点。
// 颜色靠 CSS 类（.tl-ev-<kind>[.tl-sev-<severity>] 设 color，形状 fill/stroke
// 用 currentColor）——图例开关的颜色与图表标记同源。
function tlAppendShape(m, ev, g) {
  const x = ev.x, y = g.eventY;
  if (ev.kind === "compaction") {
    const r = tlSvgEl("rect");
    r.setAttribute("x", x - 3.5); r.setAttribute("y", y - 3.5);
    r.setAttribute("width", 7); r.setAttribute("height", 7);
    r.setAttribute("rx", 1);
    m.appendChild(r);
  } else if (ev.kind === "model") {
    const r = tlSvgEl("rect");
    r.setAttribute("x", x - 0.75); r.setAttribute("y", y - 5);
    r.setAttribute("width", 1.5); r.setAttribute("height", 10);
    m.appendChild(r);
  } else if (ev.kind === "subagent") {
    const p = tlSvgEl("path");
    p.setAttribute("d", "M" + x + " " + (y - 5) + "l4.5 8h-9z");
    m.appendChild(p);
  } else if (ev.kind === "skill") {
    if (ev.skillMode === "explicit") {
      const p = tlSvgEl("path");
      p.setAttribute("d", "M" + x + " " + (y - 5) + "l4.5 5l-4.5 5l-4.5-5z");
      m.appendChild(p);
    } else {
      const c = tlSvgEl("circle");
      c.setAttribute("cx", x); c.setAttribute("cy", y);
      c.setAttribute("r", ev.count > 1 ? 5 : 4);
      m.appendChild(c);
    }
  } else if (ev.kind === "slow") {
    for (const [dx, dy, w, h] of [[-4, -1, 8, 2], [-1, -4, 2, 8]]) {
      const r = tlSvgEl("rect");
      r.setAttribute("x", x + dx); r.setAttribute("y", y + dy);
      r.setAttribute("width", w); r.setAttribute("height", h);
      m.appendChild(r);
    }
  } else {
    const c = tlSvgEl("circle");
    c.setAttribute("cx", x); c.setAttribute("cy", y);
    c.setAttribute("r", ev.count > 1 ? 5 : 4);
    m.appendChild(c);
  }
  for (const child of m.children) child.setAttribute("class", "tl-ev-shape");
}

// 交互渲染壳（镜像 TimelinePanel.tsx）：模式切换 / 图例开关 / 悬停+钉住游标 /
// 键盘漫游 / 常驻信息面板（role=status）/ 脚注 / 小屏折叠摘要。状态闭包内：
// 改 mode/hidden → 重算几何重画 SVG；游标/activeEvent → 只更新游标层与信息面板。
function renderInteractiveTimeline(data) {
  const { points, events, reqs, modes, costMeta } = data;
  const state = {
    mode: modes.length ? modes[0].id : "tokens",
    hidden: {}, hover: null, pinned: null, activeEv: null, roving: 0, expanded: false,
  };
  const modeMeta = {};
  for (const m of modes) modeMeta[m.id] = m;

  // —— 结构 ——
  const shell = el("div", "tl-shell");

  const summary = el("div", "tl-summary");
  const summaryLine = el("span", "tl-summary-line");
  const expandBtn = el("button", "tl-expand");
  expandBtn.type = "button";
  expandBtn.setAttribute("aria-expanded", "false");
  const evList = el("div", "tl-summary-list");
  const targetable = events.filter((e) => e.targetId !== null);
  if (targetable.length) {
    const hd = el("div", "tl-summary-list-head");
    hd.textContent = "事件列表（点击跳转 findings）";
    evList.appendChild(hd);
    for (const e of targetable) {
      const btn = el("button", "tl-summary-list-item");
      btn.type = "button";
      btn.textContent = e.label + (e.count > 1 ? " ×" + e.count : "") + (e.turn != null ? " · T" + e.turn : "");
      btn.addEventListener("click", () => focusFinding(e.targetId));
      evList.appendChild(btn);
    }
  }
  summary.appendChild(summaryLine);
  summary.appendChild(expandBtn);
  summary.appendChild(evList);
  shell.appendChild(summary);

  const head = el("div", "tl-head");
  const sub = el("div", "tl-sub");
  sub.textContent = "纵轴切换 · 事件标记在任意纵轴下保持同一位置";
  head.appendChild(sub);
  const modesEl = el("div", "tl-modes");
  modesEl.setAttribute("role", "group");
  for (const m of modes) {
    const b = el("button", "tl-mode-btn");
    b.type = "button";
    b.textContent = m.label;
    b.setAttribute("aria-pressed", state.mode === m.id ? "true" : "false");
    b.addEventListener("click", () => {
      if (state.mode === m.id) return;
      state.mode = m.id;
      for (const bb of modesEl.querySelectorAll(".tl-mode-btn")) {
        bb.setAttribute("aria-pressed", bb === b ? "true" : "false");
      }
      renderChart();
    });
    modesEl.appendChild(b);
  }
  head.appendChild(modesEl);
  shell.appendChild(head);

  const legend = el("div", "tl-legend");
  const curveItem = el("span", "tl-legend-item");
  curveItem.appendChild(el("i", "tl-legend-swatch tl-legend-curve"));
  curveItem.appendChild(document.createTextNode("曲线"));
  legend.appendChild(curveItem);
  const legendBtns = {};
  for (const k of TL_KIND_ORDER) {
    if (!events.some((e) => e.kind === k)) continue;
    const btn = el("button", "tl-legend-btn");
    btn.type = "button";
    btn.dataset.kind = k;
    btn.appendChild(el("i", "tl-legend-swatch tl-ev-" + k));
    btn.appendChild(document.createTextNode(TL_KIND_LABELS[k]));
    btn.setAttribute("aria-pressed", "true");
    legend.appendChild(btn);
    legendBtns[k] = btn;
  }
  shell.appendChild(legend);

  const chartWrap = el("div", "tl-chartwrap");
  shell.appendChild(chartWrap);

  const info = el("div", "tl-info");
  info.setAttribute("role", "status");
  shell.appendChild(info);

  const foot = el("div", "tl-foot");
  shell.appendChild(foot);

  // —— 几何与渲染状态 ——
  let tl = null;
  let cursorG = null, cursorLine = null, cursorDot = null;
  let markers = [];

  function visibleEvents() { return events.filter((e) => !state.hidden[e.kind]); }

  function build(mode) {
    const meta = modeMeta[mode] || { label: mode, cumulative: false };
    const spec = {
      points,
      events: visibleEvents(),
      series: [{ name: mode, label: meta.label, cumulative: meta.cumulative }],
      geometry: TL_GEO,
    };
    // context 模式：context_window 作为显式纵轴上限（曲线画「占了多少窗口」不是
    // 数据峰值，同 TimelinePanel）；全缺不传，几何退回数据最大值并置 yMaxIsData，
    // 脚注如实说「无窗口上限」。
    if (mode === "context") {
      const maxWin = reqs.reduce((a, r) => Math.max(a, r.context_window || 0), 0);
      if (maxWin > 0) spec.yMax = maxWin;
    }
    return window.TimelineGeometry.buildGeometry(spec, { maxBuckets: 220 });
  }

  function cursorAt() {
    const i = state.pinned != null ? state.pinned : state.hover;
    if (i == null || !tl || i < 0 || i >= tl.points.length) return null;
    return tl.points[i];
  }

  function refreshCursorInfo() {
    const cur = cursorAt();
    if (cursorG) {
      if (cur) {
        cursorG.style.display = "";
        const g = tl.geometry;
        cursorLine.setAttribute("x1", cur.x); cursorLine.setAttribute("x2", cur.x);
        cursorLine.setAttribute("y1", g.curveTop); cursorLine.setAttribute("y2", g.eventY + 8);
        if (state.pinned !== null) cursorLine.removeAttribute("stroke-dasharray");
        else cursorLine.setAttribute("stroke-dasharray", "3 3");
        cursorDot.setAttribute("cx", cur.x); cursorDot.setAttribute("cy", cur.y);
        cursorDot.setAttribute("r", state.pinned !== null ? "4.5" : "3.5");
      } else {
        cursorG.style.display = "none";
      }
    }
    updateInfo();
    updateFoot();
    updateSummary();
  }

  function updateInfo() {
    const parts = [];
    if (state.activeEv != null && tl && state.activeEv < tl.events.length) {
      // 事件优先（游标信息退后）——同 TimelinePanel 的优先级。图例隐藏的种不再
      // 出现在 tl.events 里，activeEv 在 renderChart 里已重置。
      const ev = tl.events[state.activeEv];
      parts.push(ev.label + (ev.count > 1 ? " ×" + ev.count : ""));
      if (ev.severity) parts.push(ev.severity);
      const pIdx = window.TimelineGeometry.nearestPoint(tl.points, ev.x);
      const rowIdx = pIdx >= 0 ? tl.points[pIdx].idx : null;
      const ord = rowIdx != null ? tlRequestOrdinal(reqs, rowIdx) : null;
      if (ord && ev.turn != null) {
        parts.push("T" + ev.turn + " · request " + ord.n + "/" + ord.m +
          (reqs[rowIdx] && reqs[rowIdx].seq != null ? " · req" + reqs[rowIdx].seq : ""));
      } else if (ev.turn != null) {
        parts.push("T" + ev.turn);
      }
      if (ev.targetId !== null) parts.push("回车跳转 findings");
    } else {
      const cur = cursorAt();
      const rowIdx = cur ? cur.idx : null;
      if (rowIdx != null && reqs[rowIdx]) {
        const r = reqs[rowIdx];
        const ord = tlRequestOrdinal(reqs, rowIdx);
        if (ord && r.turn != null) {
          parts.push("T" + r.turn + " · request " + ord.n + "/" + ord.m +
            (r.seq != null ? " · req" + r.seq : ""));
        } else {
          parts.push("req" + r.request_seq + (r.seq != null ? " · seq" + r.seq : ""));
        }
        const v = tl && tl.cols[0] ? tl.cols[0].values[cur.idx] : null;
        if (v != null) {
          if (state.mode === "cost") parts.push(fmtMoney(v));
          else {
            parts.push(fmtTokens(v) +
              (state.mode === "context" && r.context_window ? " / " + fmtTokens(r.context_window) : ""));
          }
        }
        if (r.model) parts.push(String(r.model).split("/").pop());
        const k = cur.hi - cur.lo;
        if (k > 1) parts.push(k + " 个请求合并");
        const here = tl.events.filter((e) => Math.abs(e.x - cur.x) < 3);
        if (here.length > 0) {
          parts.push("事件 " + here.map((e) => e.label + (e.count > 1 ? " ×" + e.count : "")).join("、"));
        }
        if (state.pinned !== null) parts.push("已固定");
      }
    }
    info.classList.toggle("tl-info-pinned", state.pinned !== null);
    info.textContent = parts.length > 0
      ? parts.join(" · ")
      : "悬停 / 点击 / ←→ 查看请求；Tab 漫游事件标记";
  }

  function updateFoot() {
    foot.innerHTML = "";
    if (!tl) return;
    const parts = [];
    parts.push(tl.buckets < tl.total
      ? tl.total + " 个请求聚合为 " + tl.buckets + " 桶"
      : tl.total + " 个请求");
    if (tl.measured < tl.total) parts.push((tl.total - tl.measured) + " 行未测到");
    if (tl.gaps > 0) parts.push("曲线 " + tl.gaps + " 处断开");
    if (state.mode === "context" && tl.yMaxIsData) parts.push("无上下文窗口上限，按数据峰值缩放");
    if (state.mode === "cost" && costMeta && costMeta.priced < costMeta.total) {
      parts.push((costMeta.total - costMeta.priced) + " 笔未计价（缺时间戳），累计为下限");
    }
    for (const p of parts) {
      const s = el("span", "tl-foot-item");
      s.textContent = p;
      foot.appendChild(s);
    }
  }

  function updateSummary() {
    if (!tl) { summaryLine.textContent = ""; expandBtn.textContent = "展开时间线"; return; }
    const peak = state.mode === "cost" ? fmtMoney(tl.yMax) : fmtTokens(tl.yMax);
    const anomalies = events.filter((e) => e.kind === "risk").length;
    summaryLine.textContent = tl.total + " 个请求 · 峰值 " + peak + " · " + anomalies + " 条风险";
    expandBtn.textContent = state.expanded ? "收起时间线" : "展开时间线";
    expandBtn.setAttribute("aria-expanded", state.expanded ? "true" : "false");
    shell.classList.toggle("tl-expanded", state.expanded);
  }

  function focusFinding(id) {
    const target = document.getElementById(id);
    if (!target) return;
    if (typeof target.scrollIntoView === "function") {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    target.classList.add("tl-finding-flash");
    setTimeout(() => target.classList.remove("tl-finding-flash"), 1800);
  }

  function onPointer(evt) {
    if (state.pinned !== null || !tl) return;
    const g = tl.geometry;
    const box = evt.currentTarget.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const vx = ((evt.clientX - box.left) / box.width) * g.w;
    const i = window.TimelineGeometry.nearestPoint(tl.points, vx);
    if (i >= 0) { state.hover = i; refreshCursorInfo(); }
  }

  function moveCursor(delta) {
    if (!tl) return;
    const last = tl.points.length - 1;
    const base = state.pinned != null ? state.pinned : (state.hover != null ? state.hover : 0);
    const next = Math.max(0, Math.min(last, base + delta));
    state.pinned = next;
    state.hover = next;
    refreshCursorInfo();
  }

  function moveEventFocus(next) {
    if (!tl || tl.events.length === 0) return;
    const clamped = Math.max(0, Math.min(tl.events.length - 1, next));
    state.roving = clamped;
    for (let i = 0; i < markers.length; i++) {
      markers[i].setAttribute("tabindex", i === clamped ? "0" : "-1");
    }
    const ev = tl.events[clamped];
    const pIdx = window.TimelineGeometry.nearestPoint(tl.points, ev.x);
    if (pIdx >= 0) { state.pinned = pIdx; state.hover = pIdx; }
    setActiveEv(clamped);
    if (markers[clamped] && typeof markers[clamped].focus === "function") markers[clamped].focus();
    if (ev.targetId !== null) focusFinding(ev.targetId);
  }

  function setActiveEv(i) {
    state.activeEv = i;
    refreshCursorInfo();
  }

  function renderChart() {
    tl = build(state.mode);
    markers = [];
    chartWrap.innerHTML = "";
    if (tl === null) {
      const na = el("div", "tl-empty");
      na.textContent = "该纵轴没有可画的数据";
      chartWrap.appendChild(na);
      cursorG = cursorLine = cursorDot = null;
      state.activeEv = null;
      refreshCursorInfo();
      return;
    }
    const g = tl.geometry;
    const yFor = (v) => g.curveBottom - (v / tl.yMax) * (g.curveBottom - g.curveTop);

    const svg = tlSvgEl("svg");
    svg.setAttribute("class", "tl-chart");
    svg.setAttribute("viewBox", "0 0 " + g.w + " " + g.h);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("role", "img");
    svg.setAttribute("tabindex", "0");
    svg.setAttribute("aria-label", "会话时间线（" + (modeMeta[state.mode] ? modeMeta[state.mode].label : state.mode) + " 纵轴）");

    // 网格线画在量程的 0/50%/100%，不是字面值 0/0.5/1——后者在 tokens/cost 模式
    // （yMax 上亿）下 (1/yMax)≈0，三条线全塌到底部基线上，顶标 yMax 也跟着被放
    // 到 yFor(1)≈基线旁：真实截图里「138.7M」挤在底部「0」边上就是这个。context
    // 模式（值本身是 0..1 比例、yMax≈1）碰巧两套算出同一位置，所以 bug 只在后
    // 两种模式暴露。
    for (const frac of [0, 0.5, 1]) {
      const y = yFor(frac * tl.yMax);
      const line = tlSvgEl("line");
      line.setAttribute("class", "tl-grid");
      line.setAttribute("x1", g.x0); line.setAttribute("x2", g.x1);
      line.setAttribute("y1", y); line.setAttribute("y2", y);
      svg.appendChild(line);
    }
    // 顶标放顶网格线正下方（同 dsh-native-v2 原型「128K」对顶格线的摆法）；曲线
    // 左端起点低，左上角内侧不会被线压住。
    tlSvgText(svg, "tl-axis", g.x0, g.curveTop + 9,
      state.mode === "cost" ? fmtMoney(tl.yMax) : fmtTokens(tl.yMax));
    tlSvgText(svg, "tl-axis", g.x0, g.curveBottom + 11, "0");

    if (tl.area) {
      const area = tlSvgEl("path");
      area.setAttribute("class", "tl-area");
      area.setAttribute("d", tl.area);
      svg.appendChild(area);
    }
    const path = tlSvgEl("path");
    path.setAttribute("class", "tl-line");
    path.setAttribute("d", tl.path);
    svg.appendChild(path);

    const cg = tlSvgEl("g");
    cg.setAttribute("class", "tl-cursor");
    cg.setAttribute("aria-hidden", "true");
    cursorG = cg;
    cursorLine = tlSvgEl("line");
    cursorDot = tlSvgEl("circle");
    cg.appendChild(cursorLine);
    cg.appendChild(cursorDot);
    svg.appendChild(cg);

    state.roving = Math.min(state.roving, tl.events.length - 1);
    state.activeEv = null;
    for (let i = 0; i < tl.events.length; i++) {
      const ev = tl.events[i];
      const m = tlSvgEl("g");
      const sevCls = ev.severity && ev.kind === "risk" ? " tl-sev-" + ev.severity : "";
      m.setAttribute("class", "tl-ev tl-ev-" + ev.kind + sevCls);
      m.setAttribute("data-kind", ev.kind);
      m.setAttribute("tabindex", i === state.roving ? "0" : "-1");
      m.setAttribute("aria-label",
        ev.label + (ev.count > 1 ? " ×" + ev.count : "") + (ev.turn != null ? " · T" + ev.turn : ""));
      const clickable = ev.targetId !== null;
      if (clickable) m.setAttribute("role", "button");
      const title = tlSvgEl("title");
      title.textContent = m.getAttribute("aria-label");
      m.appendChild(title);
      tlAppendShape(m, ev, g);
      m.addEventListener("focus", () => setActiveEv(i));
      m.addEventListener("mouseenter", () => setActiveEv(i));
      m.addEventListener("mouseleave", () => { if (state.activeEv === i) setActiveEv(null); });
      m.addEventListener("blur", () => { if (state.activeEv === i) setActiveEv(null); });
      m.addEventListener("click", (evt) => {
        evt.stopPropagation();
        setActiveEv(i);
        if (clickable) focusFinding(ev.targetId);
      });
      m.addEventListener("keydown", (evt) => {
        if (evt.key === "ArrowRight") { evt.preventDefault(); evt.stopPropagation(); moveEventFocus(i + 1); }
        else if (evt.key === "ArrowLeft") { evt.preventDefault(); evt.stopPropagation(); moveEventFocus(i - 1); }
        else if (evt.key === "Home") { evt.preventDefault(); evt.stopPropagation(); moveEventFocus(0); }
        else if (evt.key === "End") { evt.preventDefault(); evt.stopPropagation(); moveEventFocus(tl.events.length - 1); }
        else if ((evt.key === "Enter" || evt.key === " ") && clickable) {
          evt.preventDefault(); evt.stopPropagation(); setActiveEv(i); focusFinding(ev.targetId);
        } else if (evt.key === "Escape") {
          evt.stopPropagation(); state.pinned = null; state.hover = null; setActiveEv(null);
        }
      });
      markers.push(m);
      svg.appendChild(m);
    }

    for (const tk of tl.turnTicks) tlSvgText(svg, "tl-axis", tk.x, g.h - 1, tk.label);

    svg.addEventListener("mousemove", onPointer);
    svg.addEventListener("mouseleave", () => {
      if (state.pinned == null) { state.hover = null; refreshCursorInfo(); }
    });
    svg.addEventListener("click", (evt) => {
      const box = svg.getBoundingClientRect();
      if (!box || box.width === 0) return;
      const i = window.TimelineGeometry.nearestPoint(tl.points, ((evt.clientX - box.left) / box.width) * g.w);
      if (i >= 0) {
        state.pinned = state.pinned === i ? null : i;
        state.hover = i;
        refreshCursorInfo();
      }
    });
    svg.addEventListener("keydown", (evt) => {
      if (evt.key === "ArrowRight") { evt.preventDefault(); moveCursor(1); }
      else if (evt.key === "ArrowLeft") { evt.preventDefault(); moveCursor(-1); }
      else if (evt.key === "Home") { evt.preventDefault(); state.pinned = 0; state.hover = 0; refreshCursorInfo(); }
      else if (evt.key === "End") { evt.preventDefault(); const l = tl.points.length - 1; state.pinned = l; state.hover = l; refreshCursorInfo(); }
      else if (evt.key === "Escape") { state.pinned = null; state.hover = null; refreshCursorInfo(); }
    });

    chartWrap.appendChild(svg);
    // 测试钩子：jsdom 验证读它（不进任何决策路径）。
    if (window.__wbTimeline) window.__wbTimeline.lastGeo = tl;
    refreshCursorInfo();
  }

  expandBtn.addEventListener("click", () => {
    state.expanded = !state.expanded;
    updateSummary();
  });

  // 测试钩子：jsdom 验证读它（不进任何决策路径）。
  if (!window.__wbTimeline) window.__wbTimeline = {};
  window.__wbTimeline.data = data;

  renderChart();
  return shell;
}

// DSH 分支入口：数据准备 + 渲染壳。timeline.js 没加载 → 不渲染这一节，不是报错。
function dshTimelineSection(session) {
  if (!window.TimelineGeometry || !window.TimelineGeometry.buildGeometry) return null;
  const data = dshTimelineData(session);
  if (!data) return null;
  const sec = detailSection("会话时间线");
  sec.appendChild(renderInteractiveTimeline(data));
  return sec;
}

// 会话时间线：把宿主 envelope 里的用量序列 + 事件投影到通用几何
// （src-tauri/ui/timeline.js 的 TimelineGeometry.buildTimeline，spec §4 契约）。
// 纯数据准备 + 渲染壳——比例尺/缺口/事件保真都在 timeline.js 的纯函数里，这里只
// 负责把 DSH `requests` / Codex `cost_report.hours` 映射成 points/events。
function timelineSection(session, host) {
  // DSH 走上面的交互式渲染壳（3 纵轴/7 事件/游标/键盘，用户反馈「功能不完整」的
  // 对象）；Codex 信封没有逐请求 context/cost，升级对它是无中生有，保持静态图。
  if (host === "dsh") return dshTimelineSection(session);

  const geo = window.TimelineGeometry && window.TimelineGeometry.buildTimeline;
  if (!geo) return null; // timeline.js 没加载 → 不渲染这一节，不是报错

  let points = null, events = [], series = null, title = "会话时间线";
  // Codex：逐小时 token 桶（cost_report.hours 已是统计时区的逐小时 delta）。
  const hours = session.cost_report && Array.isArray(session.cost_report.hours) ? session.cost_report.hours : null;
  if (!hours || hours.length === 0) return null;
  points = hours.map((h, i) => ({ ordinal: i, values: { tokens: h.tokens } }));
  series = [{ name: "tokens", label: "token", cumulative: false }];
  title = "逐小时 token 用量（" + hours.length + " 小时）";
  // 事件叠加：Codex 的 findings 带 seq（事件空间、千级）+ severity/evidence，但
  // 没有时间；turn_timeline 的 source_order 与 finding.seq 同号，且 hour 是宿主侧
  // 用核心 codex_hour_of 折好的**统计时区小时桶键**（与 cost_report.hours 同一把尺，
  // 浏览器不算第二遍时区转换）。这里只做两次字典查表：finding.seq →
  // turn_timeline.source_order → hour → 桶下标。seq 不在 turn_timeline 里
  //（该事件不是 5 类生命周期之一）→ 无 hour → 诚实跳过，不画在猜的位置上
  //（几何层 orphan 跳过同款）。
  const hourToOrd = {};
  for (let i = 0; i < hours.length; i++) hourToOrd[hours[i].hour] = i;
  const tt = Array.isArray(session.turn_timeline) ? session.turn_timeline : [];
  const seqToHour = {};
  for (const e of tt) if (e.hour != null && !(e.source_order in seqToHour)) seqToHour[e.source_order] = e.hour;
  const codexFindings = session.audit && Array.isArray(session.audit.findings) ? session.audit.findings : [];
  for (const f of codexFindings) {
    const h = f.seq != null ? seqToHour[f.seq] : null;
    if (h == null || !(h in hourToOrd)) continue;
    events.push({
      ordinal: hourToOrd[h],
      kind: f.rule || "risk",
      label: (f.rule || "?") + " " + (f.evidence || ""),
      severity: f.severity || "info",
    });
  }

  const svg = geo({ points, events, series, width: 800, height: 130, pad: 26 });
  const sec = detailSection(title);
  const wrap = el("div");
  wrap.innerHTML = svg;
  sec.appendChild(wrap);
  return sec;
}

// 一行「标签 + 值」：标签走 muted，值靠右 tabular-nums。用于成本/上下文这类
// 数字键值，不用为每个小维度单造一种结构。
function kvRow(label, value, title) {
  const row = el("div", "kv-row");
  const l = el("span", "kv-label");
  l.textContent = label;
  row.appendChild(l);
  const v = el("span", "kv-value");
  v.textContent = value;
  if (title) v.title = title;
  row.appendChild(v);
  return row;
}

function sevBadge(severity) {
  const b = el("span", "sev " + (severity || "info"));
  b.textContent = severity || "info";
  return b;
}

// findings 在两个宿主里位置不同、形状略异，但都是 {rule,severity,evidence,…}。
// 取 evidence 当展示文本（Codex 无 where/title），rule 当标签，其余进 title 悬停。
function findingsSection(session) {
  const codexAudit = session.audit && Array.isArray(session.audit.findings) ? session.audit.findings : null;
  const findings = Array.isArray(session.findings) ? session.findings : codexAudit;
  if (!findings || findings.length === 0) return null;
  const sec = detailSection("findings（" + findings.length + "）");
  for (let i = 0; i < findings.length; i++) {
    const f = findings[i];
    const row = el("div", "detail-finding");
    // 交互时间线的 risk 事件带同款 id（tl-finding-<i>），点击/回车跳转过来。
    row.id = "tl-finding-" + i;
    row.appendChild(sevBadge(f.severity));
    const txt = el("span");
    txt.textContent = (f.rule || "—") + "　" + (f.evidence || "");
    txt.title = f.tool_name ? "tool: " + f.tool_name : "";
    row.appendChild(txt);
    sec.appendChild(row);
  }
  return sec;
}

// ---------- DSH 分区 ----------

function dshCostSection(s) {
  if (!s.cost || !s.cost.per_model) return null;
  const sec = detailSection("成本明细（CNY，估算值）");
  sec.appendChild(kvRow("合计", fmtMoney(s.cost.total || 0)));
  if (s.cost.peak_total) sec.appendChild(kvRow("高峰", fmtMoney(s.cost.peak_total)));
  const total = s.cost.total || 0;
  for (const [model, m] of Object.entries(s.cost.per_model)) {
    const label = m.short_name || model;
    const sub = m.provider ? " · " + m.provider : "";
    // 占比条相对合计——多模型混跑时一眼看出钱花在哪个模型上，不用逐行读数字比较。
    const frac = total > 0 && m.total != null ? m.total / total : null;
    sec.appendChild(barRow(label + sub, fmtMoney(m.total || 0), frac, model));
  }
  return sec;
}

function dshContextSection(s) {
  if (!s.context) return null;
  const c = s.context;
  const sec = detailSection("上下文构成");
  const parts = [["system", c.system_tokens], ["tools", c.tools_tokens], ["catalog", c.catalog_tokens]];
  const sum = parts.reduce((a, [, v]) => a + (v || 0), 0);
  for (const [label, v] of parts) {
    const frac = sum > 0 && v != null ? v / sum : null;
    const suffix = label === "catalog" ? "（" + (c.catalog_entries || 0) + " 条目）" : "";
    sec.appendChild(barRow(label, fmtTokens(v) + suffix, frac));
  }
  if (Array.isArray(c.catalog_names) && c.catalog_names.length) {
    // 每个 skill 目录条目各占多少 token——这个仓库的核心命题，别埋在 JSON 里。
    // 条形相对本会话里最大的那个条目（不是相对 catalog 合计），这样即使 catalog
    // 只占 system/tools 里的一小份，条目之间谁大谁小依然一目了然。
    const sorted = c.catalog_names.slice().sort((a, b) => (b.tokens || 0) - (a.tokens || 0));
    const max = sorted[0].tokens || 0;
    const TOP_N = 8;
    const sub = el("div", "detail-subsection");
    for (const n of sorted.slice(0, TOP_N)) {
      const frac = max > 0 && n.tokens != null ? n.tokens / max : null;
      sub.appendChild(barRow(n.name || "—", fmtTokens(n.tokens), frac));
    }
    sec.appendChild(sub);
    const rest = sorted.slice(TOP_N);
    if (rest.length) {
      const det = el("details", "detail-collapsible");
      const summary = el("summary");
      summary.textContent = "其余 " + rest.length + " 条目";
      det.appendChild(summary);
      for (const n of rest) det.appendChild(kvRow(n.name || "—", fmtTokens(n.tokens)));
      sec.appendChild(det);
    }
  }
  return sec;
}

function dshWasteSection(s) {
  if (!Array.isArray(s.waste) || s.waste.length === 0) return null;
  const sec = detailSection("浪费（" + s.waste.length + "）");
  for (const w of s.waste) {
    const row = el("div", "detail-finding");
    row.appendChild(sevBadge(w.severity));
    const txt = el("span");
    txt.textContent = (w.rule || "—") + "　" + fmtTokens(w.waste_tokens) + " token";
    if (w.suggestion) txt.title = w.suggestion;
    row.appendChild(txt);
    sec.appendChild(row);
  }
  return sec;
}

function dshCompactionSection(s) {
  if (!s.compaction) return null;
  const comps = Array.isArray(s.compaction.compactions) ? s.compaction.compactions : [];
  const prunes = Array.isArray(s.compaction.prunes) ? s.compaction.prunes : [];
  if (comps.length === 0 && prunes.length === 0) return null;
  const sec = detailSection("压缩 / 剪枝");
  sec.appendChild(kvRow("压缩", comps.length + " 次"));
  sec.appendChild(kvRow("剪枝", prunes.length + " 次（共 " +
    fmtTokens(prunes.reduce((a, p) => a + (p.shadowed_token_count || 0), 0)) + " shadowed）"));
  return sec;
}

function dshDurationSection(s) {
  const calls = s.duration && Array.isArray(s.duration.tool_calls) ? s.duration.tool_calls : null;
  if (!calls || calls.length === 0) return null;
  // 273 次调用不逐条列——按工具聚合，按总耗时降序取 Top 10，一眼看出时间都烧在哪。
  const byTool = {};
  for (const c of calls) {
    const n = c.tool_name || "?";
    const d = c.duration_ms || 0;
    const e = byTool[n] || (byTool[n] = { count: 0, sum: 0, max: 0 });
    e.count++; e.sum += d; if (d > e.max) e.max = d;
  }
  const top = Object.entries(byTool)
    .map(([n, e]) => ({ n, ...e, avg: e.sum / e.count }))
    .sort((a, b) => b.sum - a.sum)
    .slice(0, 10);
  const sec = detailSection("工具耗时（Top " + top.length + "，共 " + calls.length + " 次调用）");
  const maxSum = top.length ? top[0].sum : 0;
  for (const t of top) {
    // 条形相对 Top 1 的总耗时——哪个工具吃掉大部分时间一眼可见，不用逐行比数字。
    const frac = maxSum > 0 ? t.sum / maxSum : null;
    sec.appendChild(barRow(
      t.n + "（" + t.count + " 次，峰值 " + Math.round(t.max) + "ms）",
      (t.sum / 1000).toFixed(1) + "s",
      frac
    ));
  }
  return sec;
}

function dshSubagentsSection(s) {
  if (!Array.isArray(s.subagents) || s.subagents.length === 0) return null;
  const sec = detailSection("子代理（" + s.subagents.length + "）");
  for (const a of s.subagents) {
    sec.appendChild(kvRow("T" + (a.turn != null ? a.turn : "?") + " " + (a.description || a.agent_id || "—"), ""));
  }
  return sec;
}

// 规则三态 / 覆盖率是"这份数据可不可信"的排查信息，不是"发生了什么"的主叙事——
// 一次会话可以有十几条 SV 规则、六项覆盖率，逐行 kv-row 摆出来会跟成本/时间线抢
// 同样的视觉权重。做成默认折叠的 <details>（summary 借 .detail-section-title 的
// 样式，看起来还是一个章节标题，只是可以收起），展开后用 chip 网格代替逐行文字。
function dshRuleOutcomesSection(s) {
  if (!s.rule_outcomes) return null;
  const entries = Object.entries(s.rule_outcomes);
  // findings / measured_zero / unavailable 三种结局，一次会话里每条 SV 规则落在哪
  // 一格——诚实的三态不折叠成「没发现」，chip 颜色只分这三档，不编第四种。
  const findingsCount = entries.filter(([, o]) => o && o.status === "findings").length;
  const det = el("details", "detail-section detail-collapsible");
  const summary = el("summary", "detail-section-title");
  summary.textContent = "规则三态（" + entries.length + " 条规则 · " + findingsCount + " 条有 finding）";
  det.appendChild(summary);
  const wrap = el("div", "chips");
  for (const [rule, o] of entries) {
    const status = o && o.status ? o.status : "?";
    const suffix = status === "findings" && o.count ? "（" + o.count + "）" : "";
    const cls = status === "findings" ? "status-findings" : status === "measured_zero" ? "status-zero" : "status-unavailable";
    const chip = el("span", "chip " + cls);
    chip.textContent = rule + suffix;
    chip.title = status;
    wrap.appendChild(chip);
  }
  det.appendChild(wrap);
  return det;
}

function dshCoverageSection(s) {
  const fields = ["usage_coverage", "duration_coverage", "skill_coverage",
    "subagents_coverage", "compaction_coverage", "waste_coverage"];
  const present = fields.filter((k) => s[k]);
  if (present.length === 0) return null;
  const det = el("details", "detail-section detail-collapsible");
  const summary = el("summary", "detail-section-title");
  summary.textContent = "覆盖率（" + present.length + " 项）";
  det.appendChild(summary);
  const wrap = el("div", "chips");
  for (const k of present) {
    const c = s[k];
    const v = c.status || "?";
    const extra = c.count != null ? " · " + c.count : (c.sample_count != null ? " · " + c.sample_count : "");
    const chip = el("span", "chip");
    chip.textContent = k.replace("_coverage", "") + "：" + v + extra;
    wrap.appendChild(chip);
  }
  det.appendChild(wrap);
  return det;
}

function renderDshSections(body, s) {
  const sections = [
    timelineSection(s, "dsh"),
    dshCostSection(s),
    dshContextSection(s),
    dshWasteSection(s),
    dshCompactionSection(s),
    dshDurationSection(s),
    dshSubagentsSection(s),
    dshRuleOutcomesSection(s),
    dshCoverageSection(s),
  ];
  for (const sec of sections) if (sec) body.appendChild(sec);
}

// ---------- Codex 分区 ----------

function codexAuditSection(s) {
  const sum = s.audit && s.audit.summary;
  if (!sum) return null;
  const sec = detailSection("审计摘要");
  sec.appendChild(kvRow("findings", (sum.findings_total != null ? sum.findings_total : "—") +
    "（critical " + (sum.critical || 0) + " / warning " + (sum.warning || 0) + " / info " + (sum.info || 0) + "）"));
  if (sum.rules_unavailable) sec.appendChild(kvRow("规则不可用", sum.rules_unavailable + " 条"));
  return sec;
}

function codexCostSection(s) {
  if (!s.cost_report) return null;
  const r = s.cost_report;
  const sec = detailSection("成本报告（USD）");
  sec.appendChild(kvRow("合计", fmtUSD(r.total_cost_usd)));
  const tk = r.total_tokens || {};
  sec.appendChild(kvRow("tokens", fmtTokens(
    (tk.uncached_input_tokens || 0) + (tk.cached_input_tokens || 0) + (tk.output_tokens || 0))));
  if (r.per_model) {
    // 与 dshCostSection 同款占比条（相对合计），多模型混跑时钱花在谁身上一眼可见。
    const total = r.total_cost_usd;
    for (const [model, m] of Object.entries(r.per_model)) {
      const frac = total != null && total > 0 && m.cost_usd != null ? m.cost_usd / total : null;
      sec.appendChild(barRow(m.short_name || model, fmtUSD(m.cost_usd), frac, model));
    }
  }
  return sec;
}

function codexCoverageSection(s) {
  if (!s.coverage || typeof s.coverage !== "object") return null;
  const sec = detailSection("信号覆盖率");
  for (const [sig, c] of Object.entries(s.coverage)) {
    const avail = c.available ? "" : "（不可用）";
    sec.appendChild(kvRow(sig, (c.measured || 0) + " measured" + avail));
  }
  return sec;
}

function codexQuotaSection(s) {
  if (!s.quota_trajectory) return null;
  const q = s.quota_trajectory;
  const sec = detailSection("配额轨迹");
  if (q.first) sec.appendChild(kvRow("开始", q.first.used_percent + "%"));
  if (q.last) sec.appendChild(kvRow("结束", q.last.used_percent + "%"));
  if (q.reason) sec.appendChild(kvRow("说明", q.reason));
  return sec;
}

function codexPermissionSection(s) {
  if (!s.permission_transitions) return null;
  const p = s.permission_transitions;
  const sec = detailSection("权限切换");
  sec.appendChild(kvRow("危险 turn", (p.dangerous_turns || 0) + " 个"));
  const tr = Array.isArray(p.transitions) ? p.transitions : [];
  // 只列权限真正变化过的（effective_profile 有值）与 sandbox=full-access 的，其余
  // 是 on-request/workspace-write 的常态，列出来是噪声。
  const notable = tr.filter((t) => t.sandbox === "danger-full-access" || t.approval === "never" || t.effective_profile);
  for (const t of notable.slice(0, 12)) {
    sec.appendChild(kvRow(
      "sandbox " + (t.sandbox || "?") + " · approval " + (t.approval || "?"),
      t.effective_profile ? "→ " + t.effective_profile : ""
    ));
  }
  return sec;
}

function codexTurnEndsSection(s) {
  if (!s.turn_ends) return null;
  const t = s.turn_ends;
  const sec = detailSection("Turn 结局");
  sec.appendChild(kvRow("合计", t.total + "（clean " + t.clean + " / error " + t.error + " / incomplete " + t.incomplete + "）"));
  return sec;
}

function codexMetaSection(s) {
  const sec = detailSection("会话元数据");
  if (s.cli_version) sec.appendChild(kvRow("cli", s.cli_version));
  if (s.history_mode) sec.appendChild(kvRow("模式", s.history_mode));
  if (s.context_window) sec.appendChild(kvRow("上下文窗口", fmtTokens(s.context_window)));
  if (s.effort) {
    sec.appendChild(kvRow("推理力度", (s.effort.reasoning_effort || s.effort.effective || "—") +
      (s.effort.reasoning_summary ? " · " + s.effort.reasoning_summary : "")));
  }
  if (Array.isArray(s.workspace_roots) && s.workspace_roots.length) {
    for (const w of s.workspace_roots) sec.appendChild(kvRow("工作区", w));
  }
  if (Array.isArray(s.files) && s.files.length) {
    for (const f of s.files.slice(0, 3)) sec.appendChild(kvRow("文件", f));
  }
  if (Array.isArray(s.notes) && s.notes.length) {
    for (const n of s.notes) {
      const row = el("div", "detail-meta");
      row.textContent = "· " + n;
      sec.appendChild(row);
    }
  }
  return sec;
}

function renderCodexSections(body, s) {
  const sections = [
    timelineSection(s, "codex"),
    codexAuditSection(s),
    codexCostSection(s),
    codexCoverageSection(s),
    codexQuotaSection(s),
    codexPermissionSection(s),
    codexTurnEndsSection(s),
    codexMetaSection(s),
  ];
  for (const sec of sections) if (sec) body.appendChild(sec);
}

function rawSection(env) {
  const det = el("details", "detail-raw-wrap");
  const sum = el("summary");
  sum.textContent = "原始 JSON（" + Math.round(JSON.stringify(env).length / 1024) + " KB，排查用）";
  det.appendChild(sum);
  const pre = el("pre", "detail-raw");
  pre.textContent = JSON.stringify(env, null, 2);
  det.appendChild(pre);
  return det;
}

function renderDetailEnvelope(env) {
  const body = document.getElementById("sess-detail-body");
  const loading = document.getElementById("sess-detail-loading");
  if (loading) loading.remove();

  // v0.9.1 envelope shape（mcp::session_detail）：
  //   {schema_version, data_version, authority_state, authority_revision,
  //    generated_at, timezone, coverage, freshness, warnings,
  //    data: {session_ref, host, first_event_at, last_event_at, event_count,
  //           model_ids[], identity_kind, tokens{4 buckets + total},
  //           cost_minor, timeline[{event_at, model_id, observation_kind,
  //           peak, fact_id, tokens}], has_more, next_cursor, note}}
  //
  // 旧 r2a envelope `env.session.{cost, requests, findings, audit, ...}` 已退役
  // ——那些字段是 jsonl 重放路径里的 DSH/Codex 专属 envelope sections，
  // 不在权威库 envelope 里。本函数把 envelope 直接渲染：summary + timeline 表 +
  // 元数据，不再调 renderCodexSections/renderDshSections/findingsSection
  // （那些函数读 OLD shape 字段，全 undefined 会渲染成空壳）。
  const data = env.data || {};

  // envelope 到手先把顶部 KPI 卡补真（list 行可能 model_ids[0]/cost_minor 是
  // 缺场值，envelope.data 是权威源——以它为准）
  refreshDetailCards(data);

  // summary panel：host / event_count / model_ids / 时间范围 / token 4 桶 / cost_minor
  body.appendChild(renderDetailSummaryPanel(data));
  body.appendChild(renderBillingBreakdown(data.billing_breakdown));

  // timeline table：按 event_at 排序的事实流（每条 fact 一行）
  const tl = Array.isArray(data.timeline) ? data.timeline : [];
  body.appendChild(renderDetailTracePlaceholder(data.session_ref));
  loadDetailTrace(data.session_ref);
  body.appendChild(renderDetailTimelineTable(tl, data.has_more));

  // 元数据：schema / data version / authority_revision（权威库 commit 标记）/
  // generated_at / authority_state —— 排查用信息，不是「这次会话发生了什么」。
  body.appendChild(renderDetailMeta(env, data));

  body.appendChild(rawSection(env));
}

function renderBillingBreakdown(buckets) {
  const sec = detailSection("计费归因与估算依据");
  const rows = Array.isArray(buckets) ? buckets : [];
  if (rows.length === 0) {
    const p = el("div", "muted");
    p.textContent = "没有可审计的计费桶；不会把它显示为零成本。";
    sec.appendChild(p);
    return sec;
  }
  const table = el("table", "detail-timeline");
  const head = el("thead");
  const headRow = el("tr");
  for (const label of ["Provider / 模型", "计费口径", "价格来源", "估算成本", "状态"]) {
    const th = el("th");
    th.textContent = label;
    headRow.appendChild(th);
  }
  head.appendChild(headRow);
  table.appendChild(head);
  const body = el("tbody");
  for (const b of rows) {
    const tr = el("tr");
    tr.appendChild(td((b.provider_raw || b.provider_id || "<unknown>") + " · " + (b.model_id || "<unknown>")));
    tr.appendChild(td((b.billing_mode || "unknown") + " · " + (b.pricing_basis || "unavailable")));
    tr.appendChild(td((b.pricing_source || "无可用价格") + (b.pricing_version ? " · " + b.pricing_version.slice(0, 12) : "")));
    tr.appendChild(tdNum(b.cost_minor ? fmtCostMinor(b.cost_minor) + " · 估算" : "—"));
    const status = b.billing_mode === "subscription"
      ? (b.unresolved_reason || "订阅 token 不按量计费")
      : (b.has_unresolved ? (b.unresolved_reason || "归因未决") : "可审计");
    tr.appendChild(td(status));
    body.appendChild(tr);
  }
  table.appendChild(body);
  sec.appendChild(table);
  return sec;
}

function renderDetailTracePlaceholder(sessionRef) {
  const sec = detailSection("会话轨迹图");
  const target = el("div", "detail-trace");
  target.id = "sess-detail-trace";
  target.dataset.sessionRef = sessionRef || "";
  target.textContent = "轨迹加载中…";
  sec.appendChild(target);
  return sec;
}

async function loadDetailTrace(sessionRef) {
  const target = document.getElementById("sess-detail-trace");
  if (!target || !sessionRef) {
    if (target) target.textContent = "轨迹不可用：缺少安全会话引用。";
    return;
  }
  try {
    const [seriesEnv, graphEnv] = await Promise.all([
      invoke("session_trace", { sessionRef, output: "timeline_series" }),
      invoke("session_trace", { sessionRef, output: "graph" }),
    ]);
    if (target.dataset.sessionRef !== sessionRef) return;
    if (seriesEnv && seriesEnv.error) {
      target.textContent = "轨迹不可用：" + (seriesEnv.error.message || seriesEnv.error.code);
      return;
    }
    const series = (seriesEnv && seriesEnv.data) || {};
    if (!Array.isArray(series.points) || series.points.length === 0) {
      target.textContent = "该会话没有可绘制的 turn 样本；事实时间线仍在下方保留。";
      return;
    }
    target.innerHTML = window.TimelineGeometry.buildTimeline(series);
    const graph = graphEnv && !graphEnv.error ? graphEnv.data : null;
    const meta = el("div", "detail-meta");
    meta.textContent = graph ? detailTraceCoverageText(graph) : "轨迹覆盖率不可用";
    if (series.unplaced_events) {
      meta.textContent += " · " + series.unplaced_events + " 个事件没有可定位的 turn";
    }
    target.appendChild(meta);
  } catch (e) {
    if (target.dataset.sessionRef === sessionRef) {
      target.textContent = "轨迹加载失败：" + errText(e);
    }
  }
}

function detailTraceCoverageText(graph) {
  const c = graph.coverage || {};
  return "节点 " + (c.total_nodes ?? "—") + " · 边 " + (c.total_edges ?? "—") +
    " · 缺父 " + (c.missing_parent ?? "—") + " · 缺时 " + (c.missing_time ?? "—") +
    " · 缺状态 " + (c.missing_status ?? "—") + " · 废弃分支 " + (c.unmetered_nodes ?? "—");
}

// v0.9.1 详情视图降级 banner：旧 r2a envelope 的 DSH/Codex 专属分区不在权威库
// envelope 里。保留 banner 直到 M4 workflow_events 工具落地后由代码删这条
// appendChild 自动消失。
function downgradeBanner() {
  const sec = el("div", "detail-section");
  const t = el("div", "detail-section-title");
  t.textContent = "详情视图（v0.9.1 降级）";
  const body = el("div", "muted");
  body.textContent = "会话详情从 SQL 权威库 envelope 渲染（host / tokens 4 桶 / cost_minor / 时间线 fact 流）。" +
    "旧 r2a envelope 的 DSH/Codex 专属分区（cost_report / audit.findings / requests / findings[] / " +
    "context / waste / compaction / duration / subagents / rule_outcomes 等）" +
    "等 M4 workflow_events MCP 工具落地后回填（PR #2.3a task #19）。" +
    "Findings 跨会话汇总请切「Findings」tab。";
  sec.appendChild(t);
  sec.appendChild(body);
  return sec;
}

// 详情 summary panel：4 桶 tokens + cost_minor（权威）+ 模型列表 + 时间范围。
// 是 envelope.data 的真实形状，不是 list 行的冷字段。
function renderDetailSummaryPanel(d) {
  const sec = el("div", "detail-section");
  const t = el("div", "detail-section-title");
  t.textContent = "会话概览（权威库 envelope）";
  sec.appendChild(t);
  const tk = d.tokens || {};
  const lines = [];
  lines.push("host · " + (d.host || "—"));
  lines.push("events · " + (d.event_count != null ? d.event_count : "—"));
  lines.push("models · " + (Array.isArray(d.model_ids) && d.model_ids.length ? d.model_ids.join(", ") : "—"));
  lines.push("时间 · " + (d.first_event_at || "—") + " … " + (d.last_event_at || "—"));
  lines.push("uncached_input · " + fmtTokens(tk.uncached_input_tokens));
  lines.push("cache_read · " + fmtTokens(tk.cache_read_tokens));
  lines.push("cache_write · " + fmtTokens(tk.cache_write_tokens));
  lines.push("output · " + fmtTokens(tk.output_tokens));
  lines.push("total · " + fmtTokens(tk.total));
  lines.push("cost · " + fmtSessionCost(d));
  const p = el("div", "detail-meta");
  p.textContent = lines.join(" · ");
  sec.appendChild(p);
  return sec;
}

// 详情 timeline table：envelope.data.timeline[] 每条事实一行。
// 字段（mcp::session_detail 写入）：
//   event_at (RFC3339 Beijing), model_id, identity_kind, observation_kind,
//   peak (0/1), fact_id, tokens{uncached_input/cache_read/cache_write/output/total}
//
// 列精简：时间 / 模型 / observation / peak / total（5 列够用，detail 总宽度
// 1100~1200px，再多列把表格挤窄反不如折叠面板）。model_ids 标"-"代表无
// 模型 id（如纯 message-only 事件）；peak=1 标 ⭐ 强调。
function renderDetailTimelineTable(timeline, hasMore) {
  const sec = el("div", "detail-section");
  const t = el("div", "detail-section-title");
  t.textContent = "时间线（" + timeline.length + " 条事实" + (hasMore ? " · 已截断" : "") + "）";
  sec.appendChild(t);
  if (timeline.length === 0) {
    const p = el("div", "muted");
    p.textContent = "（无事实数据）";
    sec.appendChild(p);
    return sec;
  }
  const table = el("table", "detail-timeline");
  const thead = el("thead");
  const trh = el("tr");
  for (const h of ["时间", "模型", "observation", "peak", "total"]) {
    const th = el("th");
    th.textContent = h;
    trh.appendChild(th);
  }
  thead.appendChild(trh);
  table.appendChild(thead);
  const tbody = el("tbody");
  for (const f of timeline) {
    const tr = el("tr");
    tr.appendChild(td((f.event_at || "").slice(11, 19) || "—"));
    tr.appendChild(td(f.model_id || "—"));
    tr.appendChild(td(f.observation_kind || "—"));
    const peakTd = el("td");
    peakTd.textContent = f.peak === 1 ? "⭐" : "·";
    tr.appendChild(peakTd);
    const tk = f.tokens || {};
    tr.appendChild(tdNum(fmtTokens(tk.total)));
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  sec.appendChild(table);
  return sec;
}

function renderDetailMeta(env, data) {
  const sec = detailSection("版本元数据（权威库 envelope）");
  const mm = el("div", "detail-meta");
  // authority_revision.committed_at / max_observed_at 是 DB 固定字段（PR #2.4
  // S5 守：与 MCP/CLI 字节相等），不在调用时刻变 —— 直接读，不归一化。
  const rev = env.authority_revision || {};
  mm.textContent = [
    "schema " + (env.schema_version || "—"),
    "data " + (env.data_version || "—"),
    "authority " + (env.authority_state || "—"),
    "committed " + (rev.committed_at || "—"),
    "max_observed " + (rev.max_observed_at || "—"),
    "生成于 " + (env.generated_at || "—"),
    "session_ref " + (data.session_ref || "—"),
  ].join(" · ");
  sec.appendChild(mm);
  return sec;
}

// ---------- Issues（跨会话汇总；保留旧 findings IPC 兼容层） ----------

// finding.time 是 epoch ms（DSH 有、Codex 恒 null）。null → —，诚实不臆造。
function fmtFindingTime(ms) {
  if (ms == null) return "—";
  return formatStatisticsDateTime(ms, {
    month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

// 会话标签：title 优先，否则 native_id 兜底（Codex 标题命中非 100%，DSH 仅 17/59
// 有 workspace.json 标题）。不进 source_profile——那串太长，明细只够放标签。
function findingSessionLabel(f) {
  if (f.title) return f.title;
  if (typeof f.session_key === "string") return f.session_key;
  const id = f.session_key && f.session_key.native_id;
  return id ? String(id) : "（无标题）";
}

async function loadFindings(reset) {
  if (reset) {
    findState = { loaded: true, error: false, data: null, sev: "all", rule: "all", expanded: {}, nextCursor: null, loadingMore: false };
    document.getElementById("find-banner").hidden = true;
  }
  findState.loaded = true;
  // 同 loadSessions：`sessions_findings` 无分页、必须扫全部会话，冷 cache 时
  // 是这三个 tab 里最重的一个，没有任何等待反馈时最容易被当成假死。
  const loadingEl = document.getElementById("find-loading");
  loadingEl.hidden = false;
  try {
    const data = await invoke("sessions_issues", { pageSize: 50, cursor: null });
    findState.data = data;
    findState.nextCursor = data && data.next_cursor || null;
    findState.error = false;
    renderFindings();
  } catch (e) {
    // 报错不摆空卡/零汇总——横幅明说（source-unavailable → 「数据源不可用」）。
    findState.error = true;
    showBanner("find-banner", e, false);
    renderFindings();
  } finally {
    loadingEl.hidden = true;
  }
}

async function loadMoreFindings() {
  if (!findState.nextCursor || findState.loadingMore || !findState.data) return;
  findState.loadingMore = true;
  const button = document.getElementById("find-more");
  button.disabled = true;
  button.textContent = "加载中…";
  try {
    const data = await invoke("sessions_issues", { pageSize: 50, cursor: findState.nextCursor });
    const current = Array.isArray(findState.data.issues) ? findState.data.issues : [];
    const incoming = data && Array.isArray(data.issues) ? data.issues : [];
    findState.data = { ...findState.data, ...data, issues: current.concat(incoming) };
    findState.nextCursor = data && data.next_cursor || null;
    renderFindings();
  } catch (e) {
    showBanner("find-banner", e, false);
  } finally {
    findState.loadingMore = false;
    button.disabled = false;
    button.textContent = "加载更多";
    button.hidden = !findState.nextCursor;
  }
}

function renderFindings() {
  const banner = document.getElementById("find-banner");
  const empty = document.getElementById("find-empty");
  const foot = document.getElementById("find-foot");
  // 清掉上一次的筛选选择（重载即回到全量视图）。
  if (findState.error || !findState.data) {
    document.getElementById("find-total").textContent = "—";
    document.getElementById("find-critical").textContent = "—";
    document.getElementById("find-warning").textContent = "—";
    document.getElementById("find-info").textContent = "—";
    document.getElementById("find-summary").textContent = "";
    document.getElementById("find-chips").innerHTML = "";
    document.getElementById("find-rules-body").innerHTML = "";
    document.getElementById("find-rules-empty").hidden = findState.error;
    document.getElementById("find-body").innerHTML = "";
    document.getElementById("find-note").textContent = "";
    foot.textContent = "";
    document.getElementById("find-more").hidden = true;
    empty.hidden = true;
    return;
  }
  banner.hidden = true;
  const t = findState.data.totals || {};
  const rows = issueRows();
  const total = t.issues != null ? t.issues : (t.findings || rows.length);

  document.getElementById("find-total").textContent = String(total);
  document.getElementById("find-total-sub").textContent =
    (t.sessions_total != null ? t.sessions_total : "?") + " 会话中 " +
    (t.sessions != null ? t.sessions : "?") + " 有发现";
  document.getElementById("find-critical").textContent = String(t.critical || 0);
  document.getElementById("find-warning").textContent = String(t.warning || 0);
  document.getElementById("find-info").textContent = String(t.info || 0);
  document.getElementById("find-summary").textContent =
    "共 " + total + " 条发现 · 规则 " + (findState.data.rules || []).length + " 条" +
    (findState.data.generated_at ? " · 生成于 " + findState.data.generated_at.slice(0, 16).replace("T", " ") : "");

  // 源贡献 chips：按 host_kind 数明细，Claude Code/DSH/Codex 各几条。
  const chips = document.getElementById("find-chips");
  chips.innerHTML = "";
  const bySrc = {};
  for (const f of rows) {
    const k = f.host_kind || "?";
    bySrc[k] = (bySrc[k] || 0) + 1;
  }
  for (const k of ["claude-code", "dsh", "codex"]) {
    if (bySrc[k] == null) continue;
    // 类名映射必须三分支：claude-code 落进 codex 分支会被染成 codex 色。
    const cls = k === "dsh" ? " dsh" : k === "claude-code" ? " claude-code" : " codex";
    const c = el("span", "chip" + cls);
    c.textContent = k + " · " + bySrc[k];
    chips.appendChild(c);
  }

  // 规则表。
  const rules = findState.data.rules || issueRules(rows);
  const rulesBody = document.getElementById("find-rules-body");
  const rulesEmpty = document.getElementById("find-rules-empty");
  rulesBody.innerHTML = "";
  rulesEmpty.hidden = rules.length > 0;
  for (const r of rules) {
    const tr = document.createElement("tr");
    tr.appendChild(td(r.rule || "—"));
    const sev = document.createElement("td");
    const badge = el("span", "sev " + (r.severity || "info"));
    badge.textContent = r.severity || "info";
    sev.appendChild(badge);
    tr.appendChild(sev);
    tr.appendChild(td(r.category || "—"));
    tr.appendChild(tdNum(String(r.hits != null ? r.hits : "—")));
    tr.appendChild(tdNum(String(r.sessions != null ? r.sessions : "—")));
    rulesBody.appendChild(tr);
  }

  // 规则筛选下拉：一次填好（重载时重建），选完只重画明细。
  const ruleSel = document.getElementById("find-rule");
  const prevRule = ruleSel.value || "all";
  ruleSel.innerHTML = '<option value="all">全部规则</option>';
  for (const r of rules) {
    const opt = document.createElement("option");
    opt.value = r.rule;
    opt.textContent = r.rule;
    ruleSel.appendChild(opt);
  }
  if (prevRule !== "all" && ruleSel.querySelector('option[value="' + prevRule + '"]')) {
    ruleSel.value = prevRule;
  } else {
    ruleSel.value = "all";
  }
  if (findState.rule !== ruleSel.value) findState.rule = ruleSel.value;
  // 重载后 findState.sev 回 "all"，但下拉可能还停在用户上次的选择——双向对齐，
  // 否则显示与筛选行为打架（表按 all 筛、下拉亮着 warning）。
  const sevSel = document.getElementById("find-sev");
  if (sevSel.value !== findState.sev) sevSel.value = findState.sev;

  renderFindingsDetail();
  foot.textContent = findState.nextCursor
    ? "已加载 " + rows.length + " / " + total + " 条，可继续加载。"
    : "共 " + rows.length + " 条已加载。";
  document.getElementById("find-more").hidden = !findState.nextCursor;
}

// 只重画明细表：筛选下拉 change 时调，不碰卡片/规则表。
function renderFindingsDetail() {
  const rows = issueRows();
  const sev = findState.sev;
  const rule = findState.rule;
  const filtered = rows.filter((f) =>
    (sev === "all" || (f.severity || "other") === sev) &&
    (rule === "all" || (f.rule || "") === rule)
  );
  const shown = filtered.slice(0, 500);

  const body = document.getElementById("find-body");
  const empty = document.getElementById("find-empty");
  const note = document.getElementById("find-note");
  body.innerHTML = "";
  empty.hidden = shown.length > 0;
  note.textContent =
    "筛选出 " + filtered.length + " 条" +
    (filtered.length > shown.length ? "，仅显示前 " + shown.length : "");

  const frag = document.createDocumentFragment();
  for (const f of shown) {
    const tr = document.createElement("tr");
    tr.appendChild(td(fmtFindingTime(f.time)));
    const objectCell = document.createElement("td");
    const object = document.createElement("div");
    object.textContent = f.object || "—";
    objectCell.appendChild(object);
    const scope = document.createElement("div");
    scope.className = "issue-subline";
    scope.textContent = issueScopeLabel(f);
    objectCell.appendChild(scope);
    const basis = document.createElement("div");
    basis.className = "issue-subline";
    basis.textContent = issueBasisLabel(f);
    objectCell.appendChild(basis);
    tr.appendChild(objectCell);
    const sevCell = document.createElement("td");
    const badge = el("span", "sev " + (f.severity || "info"));
    badge.textContent = f.severity || "info";
    sevCell.appendChild(badge);
    tr.appendChild(sevCell);
    tr.appendChild(td(f.rule || "—"));
    tr.appendChild(tdNum(String(f.count != null ? f.count : "—")));
    const statusCell = document.createElement("td");
    statusCell.appendChild(document.createTextNode(statusRollupLabel(f.status_rollup)));
    const actionHint = document.createElement("div");
    actionHint.className = "issue-subline issue-action-hint";
    actionHint.textContent = issueActionLabel(f);
    statusCell.appendChild(actionHint);
    tr.appendChild(statusCell);
    const action = document.createElement("td");
    const expand = el("button", "btn secondary");
    expand.type = "button";
    expand.textContent = findState.expanded[f.group_id] ? "收起" : "展开";
    expand.addEventListener("click", () => toggleIssueGroup(f, tr));
    action.appendChild(expand);
    tr.appendChild(action);
    frag.appendChild(tr);
    if (findState.expanded[f.group_id]) {
      const detail = document.createElement("tr");
      detail.dataset.issueGroup = f.group_id || "";
      const cell = document.createElement("td");
      cell.colSpan = 7;
      cell.className = "muted";
      cell.textContent = "正在读取原始命中…";
      detail.appendChild(cell);
      frag.appendChild(detail);
      loadIssueGroupInstances(f, detail);
    }
  }
  body.appendChild(frag);
}

function issueScopeLabel(group) {
  const sessions = group.sessions_count != null ? group.sessions_count : group.sessions;
  const count = group.count != null ? group.count : group.hits;
  const parts = [];
  if (group.host) parts.push(group.host);
  if (group.bucket) parts.push(String(group.bucket));
  if (sessions != null) parts.push(String(sessions) + " 个会话");
  if (count != null) parts.push(String(count) + " 条命中");
  return "影响范围：" + (parts.length ? parts.join(" · ") : "范围待确认");
}

function issueBasisLabel(group) {
  const evidence = group.evidence_class || group.evidence || group.category;
  const actionability = Number(group.actionability);
  const confidence = Number.isFinite(actionability)
    ? (actionability >= 0.8 ? "较充分" : actionability >= 0.6 ? "有限" : "较弱")
    : "待确认";
  return "依据：" + (evidence || "已保留原始证据") + " · 置信限制：" + confidence +
    (group.impact == null ? " · 金额影响未量化" : "");
}

function issueActionLabel(group) {
  const remedy = group.remedy && group.remedy.remedy_id;
  if (group.source_kind === "billing_candidate") return "建议：确认计费方式";
  if (group.source_kind === "usage_growth") return "建议：查看对应会话";
  if (group.source_kind === "source_failure") return "建议：查看数据源并重试";
  const labels = {
    "inspect-tool-error": "建议：查看工具错误并重试",
    "inspect-retry-policy": "建议：检查重试策略",
    "reduce-context-window": "建议：检查上下文范围",
    "inspect-usage-change": "建议：查看对应会话",
    "review-budget-or-snooze": "建议：查看预算或静默提醒",
    "diagnostic-only": "建议：查看数据状态",
  };
  return labels[remedy] || "建议：查看详情";
}

function statusRollupLabel(rollup) {
  if (!rollup) return "—";
  const labels = [["open", "待处理"], ["later", "稍后"], ["acknowledged", "已确认"], ["resolved", "已解决"], ["not_applicable", "不适用"]];
  return labels.filter(([key]) => Number(rollup[key] || 0) > 0)
    .map(([key, label]) => label + " " + rollup[key]).join(" · ") || "—";
}

function issueActionsForStatus(status) {
  status = issueStatusCanonical(status);
  const actions = {
    open: [["later", "稍后"], ["acknowledged", "已确认"], ["resolved", "已解决"], ["not_applicable", "不适用"]],
    later: [["open", "恢复待处理"], ["acknowledged", "已确认"], ["resolved", "已解决"], ["not_applicable", "不适用"]],
    acknowledged: [["open", "恢复待处理"], ["later", "稍后"], ["resolved", "已解决"], ["not_applicable", "不适用"]],
    resolved: [["open", "恢复待处理"]],
    not_applicable: [["open", "恢复待处理"]],
  };
  return actions[status] || actions.open;
}

function issueStatusCanonical(status) {
  return {
    pending: "open",
    closed: "resolved",
    wontfix: "not_applicable",
  }[status] || status || "open";
}

function issueStatusLabel(status) {
  return {
    open: "待处理",
    later: "稍后",
    acknowledged: "已确认",
    resolved: "已解决",
    not_applicable: "不适用",
  }[issueStatusCanonical(status)] || "未知状态";
}

function issueSourceLabel(sourceKind) {
  return {
    billing_candidate: "待确认套餐",
    source_failure: "数据源失败",
    data_quality: "数据质量",
    usage_growth: "异常用量增长",
  }[sourceKind] || "来源问题";
}

async function toggleIssueGroup(group) {
  if (!group.group_id) return;
  findState.expanded[group.group_id] = !findState.expanded[group.group_id];
  renderFindingsDetail();
}

async function loadIssueGroupInstances(group, detailRow, cursor, append) {
  try {
    if (group.source_kind === "budget") {
      const sample = group.sample_evidence && group.sample_evidence[0] || {};
      const cell = detailRow.firstElementChild;
      cell.textContent = "预算状态：" + (sample.level || "—") +
        " · 比例 " + (sample.ratio_bp != null ? sample.ratio_bp + "bp" : "—") +
        " · 该项仅支持到预算设置/静默入口处理，不能作为原始 Issue 关闭。";
      const openSettings = el("button", "btn secondary");
      openSettings.type = "button";
      openSettings.textContent = "打开预算设置";
      openSettings.addEventListener("click", () => {
        openSettingsSection("settings-budget", "ov-budget-monthly-amount");
      });
      cell.appendChild(document.createTextNode(" "));
      cell.appendChild(openSettings);
      return;
    }
    if (group.source_kind && group.source_kind !== "behavior") {
      const cell = detailRow.firstElementChild;
      const sample = group.sample_evidence && group.sample_evidence[0] || {};
      const sourceLabel = issueSourceLabel(group.source_kind);
      const evidence = sample.error_code || sample.code || sample.provider_id || sample.detail?.host || "已保留摘要";
      cell.textContent = sourceLabel + "：" + evidence + " · " + String(group.count || 0) +
        " 条来源证据。该组是只读投影，不能按行为 Issue 关闭。";
      const action = el("button", "btn secondary");
      action.type = "button";
      if (group.source_kind === "billing_candidate") {
        action.textContent = "打开计费确认";
        action.addEventListener("click", () => {
          switchTab("overview");
          const review = document.getElementById("ov-billing-review");
          if (review && review.click) review.click();
        });
      } else {
        action.textContent = group.source_kind === "usage_growth" ? "查看会话" : "查看数据源";
        action.addEventListener("click", () => {
          switchTab(group.source_kind === "usage_growth" ? "sessions" : "sources");
        });
      }
      cell.appendChild(document.createTextNode(" "));
      cell.appendChild(action);
      return;
    }
    const data = await invoke("issue_group_instances", { groupId: group.group_id, pageSize: 50, cursor: cursor || null });
    const cell = detailRow.firstElementChild;
    if (!append) cell.textContent = "";
    const list = data && Array.isArray(data.instances) ? data.instances : [];
    if (list.length === 0 && !append) { cell.textContent = "暂无可展开的原始命中"; return; }
    for (const instance of list) {
      const line = document.createElement("div");
      line.className = "issue-instance-line";
      const text = document.createElement("span");
      text.textContent = (instance.evidence || "—") + " · " + issueStatusLabel(instance.status);
      line.appendChild(text);
      const detailButton = el("button", "btn secondary");
      detailButton.type = "button";
      detailButton.textContent = "详情";
      detailButton.addEventListener("click", () => showIssueInstanceDetail(instance.issue_id, line, instance));
      line.appendChild(detailButton);
      const currentStatus = issueStatusCanonical(instance.status);
      for (const [status, label] of issueActionsForStatus(currentStatus)) {
        const button = el("button", "btn secondary");
        button.type = "button";
        button.textContent = label;
        button.addEventListener("click", () => transitionIssueFromUi(instance.issue_id, status));
        line.appendChild(button);
      }
      cell.appendChild(line);
    }
    const more = cell.querySelector("button[data-issue-more]");
    if (more) more.remove();
    if (data && data.next_cursor) {
      const moreButton = el("button", "btn secondary");
      moreButton.type = "button";
      moreButton.dataset.issueMore = "1";
      moreButton.textContent = "加载更多（剩余 " + Math.max(0, Number(data.total_instances || 0) - (Number(cursor || 0) + list.length)) + "）";
      moreButton.addEventListener("click", () => loadIssueGroupInstances(group, detailRow, data.next_cursor, true));
      cell.appendChild(moreButton);
    }
  } catch (e) {
    detailRow.firstElementChild.textContent = "原始命中读取失败：" + (e.message || e);
  }
}

async function showIssueInstanceDetail(issueId, line, seed) {
  const old = line.querySelector(".issue-instance-detail");
  if (old) { old.remove(); return; }
  const detail = document.createElement("div");
  detail.className = "issue-instance-detail muted";
  const renderDetail = (issue) => {
    const metadata = issue && issue.metadata && typeof issue.metadata === "object"
      ? issue.metadata : {};
    detail.textContent = "详情：" + JSON.stringify({
      issue_id: issue && issue.issue_id || issueId,
      host_kind: issue && issue.host_kind || seed && seed.host_kind || null,
      rule: issue && issue.rule || seed && seed.rule || null,
      status: issueStatusLabel(issue && issue.status || seed && seed.status || null),
      evidence: issue && issue.evidence || seed && seed.evidence || null,
      opened_at_ms: issue && issue.opened_at_ms || seed && seed.opened_at_ms || null,
      metadata,
    });
  };
  renderDetail(seed);
  line.appendChild(detail);
  try {
    const data = await invoke("issue_instance_read", { issueId });
    const issue = data && data.issue;
    if (issue) renderDetail(issue);
    else detail.textContent += " · 权威详情不存在";
  } catch (e) {
    detail.textContent += " · 权威详情读取失败：" + (e.message || e);
  }
}

async function transitionIssueFromUi(issueId, toStatus) {
  try {
    await invoke("issue_transition", { issueId, toStatus, reason: "workbench user action" });
    await loadFindings(true);
  } catch (e) {
    showBanner("find-banner", e, false);
  }
}

function issueRows() {
  if (!findState.data) return [];
  return Array.isArray(findState.data.issues) ? findState.data.issues : (findState.data.findings || []);
}

function issueRules(rows) {
  const byRule = {};
  for (const row of rows) {
    const key = row.rule || row.issue_type || "unknown";
    const cur = byRule[key] || { rule: key, severity: row.severity || "info", hits: 0, sessions: 0 };
    cur.hits += 1;
    byRule[key] = cur;
  }
  return Object.values(byRule);
}

// 从 Issues 明细跳转到该会话详情：切到会话 tab 的详情视图，用 issue 里能
// 拿到的字段（session_key/title/model/host_kind）拼一个最小 list item 交给
// showSession。成本/token/findings 三个 summary 卡片会诚实地显示「—」（finding
// 不含这些），完整数字在下方报告分区里。
function openSessionFromFinding(f) {
  if (!f.session_key) return;
  switchTab("sessions");
  showSession({
    session_key: f.session_key,
    title: f.title || null,
    model: f.model || null,
    host_kind: f.host_kind || (f.session_key.host_kind) || null,
  });
}

// ---------- 数据源状态 ----------

async function loadSources(reset) {
  if (reset) {
    srcState = { loaded: true, error: false, sources: null, sync: null, paused: false, customRoots: [], locations: {} };
    document.getElementById("src-banner").hidden = true;
  }
  srcState.loaded = true;
  const loadingEl = document.getElementById("src-loading");
  loadingEl.hidden = false;
  // 两个数据源独立拉：一个失败不吞另一个（partial 照样渲染，横幅明说缺哪个）。
  let err = null;
  try {
    const [r, custom, locations] = await Promise.all([invoke("data_source_status"), invoke("custom_source_roots"), invoke("source_read_locations")]);
    if (!r || r.status !== "ok") throw new Error((r && r.reason) || "数据源状态不可用");
    srcState.sources = Array.isArray(r.sources) ? r.sources : [];
    if (!custom || custom.status !== "ok") throw new Error((custom && custom.reason) || "自定义目录配置不可用");
    srcState.customRoots = Array.isArray(custom.sources) ? custom.sources : [];
    if (!locations || locations.status !== "ok") throw new Error((locations && locations.reason) || "读取位置不可用");
    srcState.locations = locations.locations || {};
  } catch (e) { err = e; }
  try {
    const ov = await invoke("read_overview");
    srcState.sync = (ov && ov.sync) || null;
  } catch (e) { if (!err) err = e; }
  try {
    const control = await invoke("sync_pause_state");
    srcState.paused = control && control.status === "ok" ? control.paused === true : false;
  } catch (e) { if (!err) err = e; }
  loadingEl.hidden = true;
  if (err) { srcState.error = true; showBanner("src-banner", err, false); }
  else { srcState.error = false; }
  renderSources();
}

// 数据源读取失败的原因码 → 人话（规格 §5.6）。摘要行只显示映射后的文字，
// 原始 code 只出现在展开区的 title（供排障，不算"卡面暴露内部词表"）。
const SOURCE_ERROR_TEXT = {
  permission_denied: "没有读取权限",
  permission: "没有读取权限",
  file_missing: "找不到日志文件",
  all_files_failed: "所有日志文件都读取失败",
  db_error: "本地数据库出错",
  migration_failed: "本地数据库需要迁移",
};
function sourceErrorText(code) {
  return SOURCE_ERROR_TEXT[code] || "读取失败";
}

function renderSources() {
  const syncEl = document.getElementById("src-sync");
  const sync = srcState.sync;
  const pauseToggle = document.getElementById("src-pause-toggle");
  pauseToggle.textContent = srcState.paused ? "恢复自动同步" : "暂停自动同步";
  pauseToggle.onclick = async () => {
    pauseToggle.disabled = true;
    try {
      await invoke("set_sync_paused", { paused: !srcState.paused });
      if (!srcState.paused) await invoke("trigger_sync");
      await loadSources(true);
    } catch (e) {
      showBanner("src-banner", e, false);
    } finally {
      pauseToggle.disabled = false;
    }
  };
  if (sync) {
    if (srcState.paused) {
      syncEl.textContent = "自动同步已暂停；已有导入记录仍可查看。";
      syncEl.title = "恢复同步后才会再次读取本地日志";
    } else if (sync.ok) {
      syncEl.textContent = "上次同步：成功" + (sync.at ? " " + sync.at.slice(11, 16) : "");
      syncEl.title = sync.message || "";
    } else if (sync.stage === "never") {
      syncEl.textContent = "尚未同步";
      syncEl.title = "";
    } else {
      syncEl.textContent = "⚠ 上次同步失败：" + (sync.message || "未知原因");
      syncEl.title = sync.message || "";
    }
  } else {
    syncEl.textContent = "同步状态未知";
  }

  const cards = document.getElementById("src-cards");
  renderCustomSourceRoots();
  cards.innerHTML = "";
  if (srcState.error && !srcState.sources) return;
  const sources = Array.isArray(srcState.sources) ? srcState.sources : [];
  // 有失败来源的排到最前（规格 §4.1.2），其余保持契约返回顺序。
  const ordered = [...sources].sort((a, b) => {
    const af = a.connection_state === "needs_attention" || Number((a.failed_scope || {}).sources || 0) > 0;
    const bf = b.connection_state === "needs_attention" || Number((b.failed_scope || {}).sources || 0) > 0;
    return af === bf ? 0 : af ? -1 : 1;
  });
  for (const source of ordered) cards.appendChild(renderSourceRow(source));
  const failedSources = sources.filter((source) =>
    source.connection_state === "needs_attention" ||
    Number((source.failed_scope || {}).sources || 0) > 0
  );
  if (failedSources.length > 0) {
    const details = failedSources.map((source) => HOST_DISPLAY[source.host] || source.host || "未知来源").join("、");
    showBanner(
      "src-banner",
      "部分来源读取失败：" + details + "。其他来源已继续同步；请在对应行展开后重新同步。",
      false,
    );
  }
}

function renderCustomSourceRoots() {
  const host = document.getElementById("src-custom-host");
  const root = document.getElementById("src-custom-root");
  const choose = document.getElementById("src-custom-choose");
  const add = document.getElementById("src-custom-add");
  const list = document.getElementById("src-custom-list");
  const status = document.getElementById("src-custom-status");
  if (!host || !root || !choose || !add || !list || !status) return;
  const show = (text) => { status.hidden = false; status.textContent = text; };
  choose.onclick = async () => {
    choose.disabled = true;
    try {
      const selected = await invoke("pick_custom_source_root");
      if (selected) {
        root.value = selected;
        add.disabled = false;
        status.hidden = true;
      }
    } catch (e) { show("无法打开目录选择：" + errText(e)); status.focus(); }
    finally { choose.disabled = false; }
  };
  add.onclick = async () => {
    if (!root.value) return;
    add.disabled = true;
    try {
      const saved = await invoke("add_custom_source_root", { input: { host: host.value, root: root.value } });
      show(saved.changed ? "已添加目录，正在启动同步。" : "该目录已在读取范围内，正在重新同步。");
      await invoke("trigger_sync");
      await loadSources(true);
    } catch (e) { show("添加失败：" + errText(e)); status.focus(); }
    finally { add.disabled = !root.value; }
  };
  list.textContent = "";
  for (const source of srcState.customRoots || []) {
    const row = document.createElement("div");
    row.className = "src-custom-row";
    const text = document.createElement("div");
    text.className = "src-custom-path";
    text.textContent = (HOST_DISPLAY[source.host] || source.host) + " · " + source.root;
    const remove = document.createElement("button");
    remove.className = "btn secondary";
    remove.textContent = "移除读取位置";
    remove.title = "移除不删除已导入数据";
    remove.onclick = async () => {
      remove.disabled = true;
      try {
        await invoke("remove_custom_source_root", { input: { host: source.host, root: source.root } });
        show("已移除读取位置；已导入数据仍保留。");
        await loadSources(true);
      } catch (e) { remove.disabled = false; show("移除失败：" + errText(e)); status.focus(); }
    };
    row.append(text, remove);
    list.appendChild(row);
  }
}

// 状态词表：connection_state → (词, 修饰符)。paused/excluded 用 muted，不用
// warn 黄——暂停/排除是用户主动选择，不是需要关注的问题（规格 §4.1）。
const SRC_STATE_TEXT = {
  connected: ["已连接", "ok"],
  needs_attention: ["需要处理", "danger"],
  paused: ["已暂停", "muted"],
  excluded: ["已停止读取", "muted"],
  not_detected: ["未检测到", "muted"],
};

function renderSourceRow(src) {
  const key = src.host || src.source_id || "unknown";
  const row = el("div", "src-row");
  row.dataset.host = key;
  const status = src.connection_state || "unknown";
  const [stateText, stateModifier] = SRC_STATE_TEXT[status] || ["状态未知", "muted"];
  const failed = (src.failed_scope && src.failed_scope.sources) || 0;
  const scope = src.import_scope || {};

  const head = el("button", "src-row-head");
  head.type = "button";
  head.setAttribute("aria-expanded", "false");
  const dot = el("span", "src-dot " + (failed > 0 ? "danger" : stateModifier));
  dot.textContent = "●";
  dot.setAttribute("aria-hidden", "true");
  const name = el("span", "src-row-name");
  name.textContent = HOST_DISPLAY[key] || key;
  if (key === "workbuddy") {
    const experimental = el("span", "chip");
    experimental.textContent = "实验支持";
    experimental.style.marginLeft = "6px";
    name.appendChild(experimental);
  }
  const state = el("span", "src-row-state " + (failed > 0 ? "danger" : stateModifier));
  state.textContent = failed > 0 ? "需要处理" : stateText;
  const meta = el("span", "src-row-meta");
  const sessionsText = (scope.sessions ?? 0) > 0 || status !== "not_detected"
    ? Number(scope.sessions || 0) + " 个会话"
    : "尚未导入";
  const lastEventText = fmtSourceTime(src.log && src.log.last_event_at_ms);
  meta.textContent = sessionsText + " · 最近记录 " + lastEventText + (failed > 0 ? " · 读取失败" : "");
  const caret = el("span", "src-row-caret");
  caret.textContent = "▾";
  caret.setAttribute("aria-hidden", "true");
  head.append(dot, name, state, meta, caret);

  const detail = el("div", "src-row-detail");
  detail.hidden = true;
  const location = srcState.locations && srcState.locations[key];
  if (location) {
    const loc = el("div");
    const short = String(location).replace(/^\/Users\/[^/]+/, "~");
    loc.textContent = "读取位置：" + short + " ";
    const showFull = el("button", "chip-link");
    showFull.type = "button";
    showFull.textContent = "显示完整路径";
    showFull.onclick = () => { loc.firstChild.textContent = "读取位置：" + String(location) + " "; showFull.remove(); };
    loc.appendChild(showFull);
    detail.appendChild(loc);
  }
  const range = el("div");
  const first = scope.first_event_at_ms ? fmtSourceTime(scope.first_event_at_ms) : null;
  const last = scope.last_event_at_ms ? fmtSourceTime(scope.last_event_at_ms) : null;
  range.textContent = "导入范围：" + (scope.facts ?? 0) + " 条记录" +
    (first && last ? "（" + first + " – " + last + "）" : "");
  detail.appendChild(range);
  const scan = el("div");
  scan.textContent = "扫描：" + ((src.scan && src.scan.source_count) ?? 0) + " 个文件" +
    (src.scan && src.scan.last_scanned_at_ms ? " · 上次扫描 " + fmtSourceTime(src.scan.last_scanned_at_ms) : "");
  detail.appendChild(scan);
  if (failed > 0) {
    const codes = (src.failed_scope && src.failed_scope.error_codes) || [];
    const text = codes.length ? codes.map(sourceErrorText).join("、") : "读取失败";
    const failRow = el("div", "degraded-row");
    failRow.title = codes.join(", ");
    failRow.textContent = failed + " 个文件读取失败 · " + text + "；本来源本轮不是新鲜数据。";
    detail.appendChild(failRow);
  }
  const action = src.recovery_action || {};
  const actions = el("div", "src-row-detail-actions");
  if (action.label) {
    const button = el("button", "chip-link");
    button.type = "button";
    button.textContent = action.label;
    // 块体箭头函数不会隐式返回 recoverSource 的 promise（旧版单表达式箭头会）——
    // 补 return，否则 onclick() 调用方（真机点击无所谓，但测试和任何未来的
    // await button.onclick() 都会拿到 undefined，观察不到轮询过程就提前判定完成）。
    button.onclick = (event) => { event && event.stopPropagation(); return recoverSource(button, key, action.kind); };
    actions.appendChild(button);
  }
  if (status !== "excluded") {
    const exclude = el("button", "chip-link");
    exclude.type = "button";
    exclude.textContent = "停止读取此来源";
    exclude.title = "停止后续读取，已导入数据保持不变";
    exclude.onclick = async (event) => {
      event && event.stopPropagation();
      exclude.disabled = true;
      try {
        await invoke("set_source_host_excluded", { input: { host: key, excluded: true } });
        await loadSources(true);
      } catch (e) {
        exclude.disabled = false;
        showBanner("src-banner", "无法停止读取：" + errText(e), false);
      }
    };
    actions.appendChild(exclude);
  }
  const clear = el("button", "chip-link danger");
  clear.type = "button";
  clear.textContent = "删除已导入数据…";
  clear.title = "只删除本 App 中该来源的已导入数据；不会删除工具原始日志";
  clear.onclick = async (event) => {
    event && event.stopPropagation();
    const name = HOST_DISPLAY[key] || key;
    if (!window.confirm("删除\u201c" + name + "\u201d已导入到本 App 的数据？\n\n将删除 " + (scope.facts ?? 0) + " 条记录、" + (scope.sessions ?? 0) +
        " 个会话；不会删除该工具的原始日志。该来源会同时停止读取，恢复读取后才会重新导入。")) return;
    clear.disabled = true;
    try {
      const result = await invoke("delete_imported_source_data", { host: key });
      showBanner("src-banner", "已删除 " + result.facts + " 条记录、" + result.sessions + " 个会话；原始日志未修改。", true);
      await loadSources(true);
    } catch (e) {
      clear.disabled = false;
      showBanner("src-banner", "删除失败：" + errText(e), false);
    }
  };
  actions.appendChild(clear);
  detail.appendChild(actions);

  head.onclick = () => {
    const open = detail.hidden;
    detail.hidden = !open;
    row.dataset.open = open ? "1" : "0";
    head.setAttribute("aria-expanded", open ? "true" : "false");
  };
  row.append(head, detail);
  return row;
}

function fmtSourceTime(ms) {
  if (typeof ms !== "number") return "暂无";
  return formatStatisticsDateTime(ms, {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

async function recoverSource(button, host, actionKind) {
  const syncEl = document.getElementById("src-sync");
  button.disabled = true;
  syncEl.textContent = (HOST_DISPLAY[host] || host) + "：正在扫描…";
  try {
    if (actionKind === "resume_sync") {
      await invoke("set_sync_paused", { paused: false });
    }
    if (actionKind === "include_source") {
      await invoke("set_source_host_excluded", { input: { host, excluded: false } });
    }
    const requestId = await invoke("trigger_sync");
    if (!requestId) throw new Error("同步请求未返回追踪编号");
    for (let i = 0; i < 10; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const state = await invoke("sync_request_status", { requestId });
      if (state && state.completed === true) {
        await loadSources(true);
        return;
      }
    }
    throw new Error("同步仍在后台运行，请稍后点重载查看结果");
  } catch (e) {
    showBanner("src-banner", e, false);
  } finally {
    button.disabled = false;
  }
}

// ---------- 初始化 ----------

async function init() {
  // 先拿到后端实际统计时区，再初始化默认的今天、本月和会话月份，避免
  // 用户自定义时区在首屏被浏览器系统时区覆盖。
  await loadStatisticsTimezonePreference();
  calMonth = statisticsMonth();
  subscribeBudgetNotificationActions();
  // fold 完成事件桥：先订阅再首屏渲染，缩小「事件早于 listen」的丢窗口
  // （丢的那几个由 5 分钟 tick / 手动同步兜底，见事件桥一节注释）。
  subscribeFoldEvent();
  subscribeSyncStatusEvent();
  // 菜单导航事件桥同款：先订阅；冷启动（webview 先加载、focus-tab emit 早于 listen）
  // 的那次点击由 init 末尾的 pullNavTarget() 命中，subscribeNavEvent 只管窗口已建后。
  subscribeNavEvent();
  // 会话深链事件桥同款：先订阅；冷启动丢的那次由 init 末尾的 pullFocusTarget()
  // 命中（subscribeFocusTargetEvent 只管窗口已建后）。
  subscribeFocusTargetEvent();
  document.querySelectorAll(".tab").forEach((t) => {
    t.addEventListener("click", () => switchTab(t.dataset.tab));
  });
  // 计费提示由总览异步刷新填充。先在 DOM 初始化阶段挂一个只负责展开的
  // 稳定监听器，避免候选读取完成与用户点击恰好交错时只看到“可确认”提示、
  // 却无法打开面板；候选行和声明动作仍由 renderBillingImportCandidates 绑定。
  const billingReviewButton = document.getElementById("ov-billing-review");
  const billingReviewPanel = document.getElementById("ov-billing-review-panel");
  if (billingReviewButton && billingReviewPanel && billingReviewButton.dataset.fallbackBound !== "1") {
    billingReviewButton.dataset.fallbackBound = "1";
    billingReviewButton.addEventListener("click", () => {
      billingReviewOpen = true;
      billingReviewPanel.hidden = false;
      switchTab("sources");
    });
  }
  document.getElementById("wb-refresh").addEventListener("click", loadActiveTab);
  // FR-11 同款纪律（见 dsh-client audit/actions.ts）：复制类操作不得静默失败——
  // 按钮文字直接说明成功/失败，不摆一个点了没反应的按钮。
  document.getElementById("wb-screenshot").addEventListener("click", async () => {
    const btn = document.getElementById("wb-screenshot");
    const original = btn.textContent;
    btn.disabled = true;
    try {
      await invoke("capture_workbench_screenshot");
      btn.textContent = "已复制";
    } catch (e) {
      btn.textContent = "失败";
      console.error(e);
    }
    setTimeout(() => {
      btn.textContent = original;
      btn.disabled = false;
    }, 1500);
  });
  document.getElementById("cal-prev").addEventListener("click", () => shiftMonth(-1));
  document.getElementById("cal-next").addEventListener("click", () => shiftMonth(1));
  document.getElementById("cal-metric").addEventListener("change", (ev) => {
    calMetric = ev.target.value === "cost" ? "cost" : "tokens";
    renderCalendar();
  });
  document.getElementById("cal-month").addEventListener("change", (ev) => {
    if (ev.target.value) { calMonth = ev.target.value; renderCalendar(); }
  });
  // host 过滤 chips（spec §7.3）：过滤变化 → 重置分页 + 重新加载（游标语义是
  // 全量翻页，带旧过滤的游标续拉会混页）。
  document.querySelectorAll("#sess-filter .chip").forEach((c) => {
    c.addEventListener("click", () => {
      if (c.dataset.host === sessFilter) return;
      sessFilter = c.dataset.host;
      updateFilterChips();
      loadSessions(true);
    });
  });
  document.getElementById("sess-more").addEventListener("click", () => loadSessions(false));
  document.getElementById("sess-reload").addEventListener("click", () => loadSessions(true));
  // 月份 picker（修「点会话 tab 只看到今天」bug）：change 事件重置分页 +
  // 重载（cursor 是 per-window 的，跨月 cursor 无意义——store.rs list_args 不
  // 检查 cursor 与 month 是否匹配，混传会让用户以为在翻页实则乱跳）。
  // picker 默认值 = 当前统计时区月份，保持「开 tab 立刻看到数据」的体感；
  // 用户主动清空 picker → IPC 收 month=undefined → store.rs 兜底为 --day 今天。
  const sessMonthEl = document.getElementById("sess-month");
  sessMonthEl.value = statisticsMonth();
  sessMonthEl.addEventListener("change", () => loadSessions(true));
  const sessWindowEl = document.getElementById("sess-window");
  const sessFromEl = document.getElementById("sess-from");
  const sessToEl = document.getElementById("sess-to");
  const syncSessionWindowControls = () => {
    const custom = sessWindowEl.value === "custom";
    sessFromEl.hidden = !custom;
    sessToEl.hidden = !custom;
    sessMonthEl.hidden = sessWindowEl.value !== "month";
  };
  sessWindowEl.addEventListener("change", () => { syncSessionWindowControls(); loadSessions(true); });
  sessFromEl.addEventListener("change", () => loadSessions(true));
  sessToEl.addEventListener("change", () => loadSessions(true));
  syncSessionWindowControls();
  const sessModelEl = document.getElementById("sess-model");
  sessModelEl.addEventListener("change", () => loadSessions(true));
  const sessProviderEl = document.getElementById("sess-provider");
  sessProviderEl.addEventListener("change", () => loadSessions(true));
  const sessStatusEl = document.getElementById("sess-status");
  sessStatusEl.addEventListener("change", () => {
    sessStatusFilter = sessStatusEl.value;
    renderSessions();
  });
  document.getElementById("sess-back").addEventListener("click", () => {
    document.getElementById("sess-detail-view").hidden = true;
    document.getElementById("sess-list-view").hidden = false;
  });
  document.getElementById("find-reload").addEventListener("click", () => loadFindings(true));
  document.getElementById("find-more").addEventListener("click", loadMoreFindings);
  document.getElementById("find-sev").addEventListener("change", (ev) => {
    findState.sev = ev.target.value;
    renderFindingsDetail();
  });
  document.getElementById("find-rule").addEventListener("change", (ev) => {
    findState.rule = ev.target.value;
    renderFindingsDetail();
  });
  // 日历默认月跟随统计时区今天；本月输入框受 input[type=month] 约束天然合法。
  if (!calMonth) calMonth = statisticsMonth();
  renderOverview();
  // 启动 pull：冷启动时（webview 先加载、focus-tab/focus-target emit 早于 listen）
  // 菜单点击的目标在这里命中。apply 后 clear，此后 focus/事件两条路都不会重复应用。
  pullNavTarget();
  pullFocusTarget();
}

document.addEventListener("DOMContentLoaded", init);
