// 工作台主窗口前端：三页 总览 / Token 日历 / 会话（列表+详情）。
// 纯 HTML/CSS/JS，无打包器 —— `withGlobalTauri: true` 让全局 `window.__TAURI__`
// 可用。数据只来自后端命令（read_overview / read_month / sessions_list /
// sessions_read），任何金额/覆盖率都不在本文件计算——core 算好、这里格式化展示
// （CLAUDE.md 的 cost 教训：前端不许长第二份定价）。
"use strict";

const { invoke } = window.__TAURI__.core;

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

// token 缩写：≥1M "1.4M"、≥1K "8.2K"（<10K 一位小数）、<1K 原样 —— 镜像 lib.rs::fmt_tokens。
function fmtTokens(n) {
  if (n == null) return "—";
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

// 北京时间（UTC+8 无夏令时）今天 → "YYYY-MM-DD"。镜像 overview.rs 的北京日期键。
function beijingToday() {
  const b = new Date(Date.now() + 8 * 3600 * 1000);
  const m = String(b.getUTCMonth() + 1).padStart(2, "0");
  const d = String(b.getUTCDate()).padStart(2, "0");
  return b.getUTCFullYear() + "-" + m + "-" + d;
}

function beijingMonth() {
  return beijingToday().slice(0, 7);
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

// ---------- tab 切换 ----------

let activeTab = "overview";
let calMonth = beijingMonth();
let calData = null;
let sessState = { items: [], nextCursor: null, total: null, loaded: false, error: false };
// Findings/数据源页同款懒加载：CLI 汇总较重（sessions_findings / sessions_list 都
// spawn 二进制），首进一次、之后「重载」按钮刷新——与 sessions 页同一套理由。
let findState = { loaded: false, error: false, data: null, sev: "all", rule: "all" };
let srcState = { loaded: false, error: false, sources: null, sync: null };

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
  if (activeTab === "overview") await renderOverview();
  else if (activeTab === "calendar") await renderCalendar();
  // 会话页懒加载：首进一次，之后只在「重载列表 / 加载更多」时拉。切 tab 不重拉
  // 也不追加——反复 overview↔sessions 切着看，分页游标不能被一次切换吞掉一页。
  else if (activeTab === "sessions") { if (!sessState.loaded) loadSessions(); }
  // Findings / 数据源同款懒加载（CLI 汇总较重，见 state 注释）。
  else if (activeTab === "findings") { if (!findState.loaded) loadFindings(); }
  else if (activeTab === "sources") { if (!srcState.loaded) loadSources(); }
}

// 聚焦刷新：与弹窗同款 —— 窗口每次重新获得焦点都重拉（hide 不是 close，数据要新鲜）。
// 会话页例外：CLI 列表较重，首进加载一次、之后用「重载列表」按钮；焦点只刷新
// 总览与日历两个便宜页。
window.addEventListener("focus", () => {
  if (activeTab === "overview") renderOverview();
  else if (activeTab === "calendar") renderCalendar();
});

// ---------- 总览 ----------

async function renderOverview() {
  let ov;
  try {
    ov = await invoke("read_overview");
  } catch (e) {
    document.getElementById("ov-today-amount").textContent = "读取失败";
    document.getElementById("ov-note").textContent = errText(e);
    return;
  }
  syncDot(ov.sync);

  // 今日
  const todayAmt = document.getElementById("ov-today-amount");
  const todaySub = document.getElementById("ov-today-sub");
  if (ov.today) {
    todayAmt.textContent = fmtMoney(ov.today.total || 0);
    todaySub.textContent =
      (ov.today.peak_total || 0) > 0 ? "其中高峰 " + fmtMoney(ov.today.peak_total) : "";
  } else {
    todayAmt.textContent = "—";
    todaySub.textContent = "今天还没有数据";
  }

  // 本月
  const monthTotal = ov.month.total || 0;
  document.getElementById("ov-month-amount").textContent = fmtMoney(monthTotal);
  const monthPeak = ov.month.peak_total || 0;
  document.getElementById("ov-month-sub").textContent =
    monthPeak > 0 ? "其中高峰 " + fmtMoney(monthPeak) : "";

  // 预算 —— 只读 alert.json 权威（level/ratio/snooze/reasons），不重算百分比。
  const b = ov.budget || { source: "missing" };
  const fill = document.getElementById("ov-budget-fill");
  const budgetSub = document.getElementById("ov-budget-sub");
  const budgetAmt = document.getElementById("ov-budget-amount");
  const denom = b.monthly_cny || ov.budget_monthly_cny || 0;
  // 新鲜度先算好——预算卡片自己也要用，不能只靠页面最下面那行 note。真实事故
  // （2026-09-01）：alert.json 停在 8 月最后一次 oneline（两天前），总览把它的
  // 292% 超支当"本月"现状展示，旁边的"本月"卡片同一时刻已经因为按当月过滤
  // 显示 ¥0——两个数字自相矛盾却都没有任何过期标记，用户没法从卡片本身判断
  // "这是不是真的"。5 分钟阈值与 `stale_from`（`lib.rs`，托盘文案用的同一个
  // 判据）保持一致，不新发明一套。
  let stale = false;
  let freshHHMM = "";
  if (b.generated_at) {
    const t = new Date(b.generated_at);
    freshHHMM = t.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
    stale = Date.now() - t.getTime() > 5 * 60 * 1000;
  }
  if (b.source !== "alert" || !b.level) {
    fill.style.width = "0%";
    fill.className = "fill";
    budgetAmt.textContent = "—";
    budgetSub.textContent = "等预算数据（跑一次 oneline）";
  } else {
    const ratio = Math.min(1, b.month_ratio ?? b.ratio ?? 0);
    const daily =
      b.effective_daily_budget != null ? " · 日预算 " + fmtMoney(b.effective_daily_budget) : "";
    fill.style.width = fmtPct(ratio);
    const levelCls =
      b.level === "over" ? " danger" : b.level === "warn" ? " warn" : "";
    fill.className = "fill" + levelCls;
    budgetAmt.textContent = fmtPct(b.month_ratio ?? 0);
    if (b.level === "over") {
      budgetSub.textContent =
        "超支 " + fmtMoney(b.month_cost || 0) + "（月 " + fmtMoney(denom) + "）" + daily;
    } else if (b.level === "snoozed") {
      budgetSub.textContent =
        "已静默" + (b.snoozed_until ? "至 " + b.snoozed_until : "") + daily;
    } else if (b.level === "disabled") {
      budgetSub.textContent = "预算已禁用" + daily;
    } else {
      budgetSub.textContent =
        "已用 " + fmtPct(b.month_ratio ?? 0) + "（" + fmtMoney(b.month_cost || 0) +
        " / " + fmtMoney(denom) + "）" + daily;
    }
    // 过期时把警告直接贴在数字旁边，不指望用户往下翻到页尾的 note 才看到——
    // 这条数字本身可能是几天前的旧账（比如日历月翻了页但当天还没有新会话
    // 触发过重新评估），过期提示必须跟数字长在一起。
    if (stale) {
      budgetSub.textContent = "⚠ 数据截至 " + freshHHMM + "（可能是上一次评估，非本月最新）· " + budgetSub.textContent;
    }
    budgetSub.title = (b.reasons || []).join("\n");
  }

  // 新鲜度 + 同步状态 + 立即同步（与弹窗同一套 poll-at-change 回路）。
  let freshness = "";
  if (b.generated_at) {
    freshness = (stale ? "⚠ 数据过期（更新于 " : "数据更新于 ") + freshHHMM + "）";
  } else {
    freshness = "预算数据尚未产出";
  }
  const sync = ov.sync || { ok: false, stage: "never", message: "尚未同步" };
  const syncStatus = document.getElementById("ov-sync-status");
  const syncNow = document.getElementById("ov-sync-now");
  if (sync.ok) {
    syncStatus.textContent =
      "上次同步：成功" + (sync.at ? " " + sync.at.slice(11, 16) : "");
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
  syncNow.onclick = async () => {
    syncNow.disabled = true;
    syncStatus.textContent = "同步中…";
    const before = sync.at || "";
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
    }
  };

  // 本月逐日
  const list = document.getElementById("ov-days-list");
  const empty = document.getElementById("ov-days-empty");
  list.innerHTML = "";
  if (ov.days && ov.days.length > 0) {
    empty.hidden = true;
    for (const d of ov.days) {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.className = "day";
      name.textContent = d.date;
      li.appendChild(name);
      if (d.basis === "partial") {
        const tag = document.createElement("span");
        tag.className = "tag";
        tag.title = "该日 by_model 未覆盖全部 token，按 fallback 价补齐（覆盖率 " + fmtPct(d.coverage || 0) + "）";
        tag.textContent = "部分覆盖";
        li.appendChild(tag);
      }
      const amt = document.createElement("span");
      amt.className = "amt";
      amt.textContent = fmtMoney(d.total);
      li.appendChild(amt);
      list.appendChild(li);
    }
  } else {
    empty.hidden = false;
  }

  document.getElementById("ov-note").textContent =
    freshness + " · " + ov.estimate_note + " · " + ov.data_home;
  document.getElementById("wb-foot").textContent = ov.data_home + " · " + ov.estimate_note;
}

function syncDot(sync) {
  const dot = document.getElementById("wb-sync-dot");
  if (!sync) return;
  dot.className = "sync-dot" + (sync.ok ? " ok" : sync.stage === "never" ? "" : " fail");
  dot.title = sync.message || (sync.ok ? "同步正常" : "同步状态未知");
}

// ---------- Token 日历 ----------

async function renderCalendar() {
  const grid = document.getElementById("cal-grid");
  const empty = document.getElementById("cal-empty");
  const total = document.getElementById("cal-total");
  const monthInput = document.getElementById("cal-month");
  monthInput.value = calMonth;

  let resp;
  try {
    resp = await invoke("read_month", { month: calMonth });
  } catch (e) {
    empty.hidden = false;
    empty.textContent = "读取失败：" + errText(e);
    grid.innerHTML = "";
    total.textContent = "";
    return;
  }
  calData = resp;
  grid.innerHTML = "";

  if (!resp.has_data) {
    empty.hidden = false;
    empty.textContent = "该月暂无数据";
    total.textContent = "";
    document.getElementById("cal-note").textContent =
      "历史月数据在 state/month-archive.json；当月无数据 = 还没折进账。";
    return;
  }
  empty.hidden = true;
  total.textContent = fmtMoney(resp.total) +
    ((resp.peak_total || 0) > 0 ? " · 高峰 " + fmtMoney(resp.peak_total) : "");

  const dows = ["日", "一", "二", "三", "四", "五", "六"];
  for (const d of dows) {
    const h = document.createElement("div");
    h.className = "cal-dow";
    h.textContent = d;
    grid.appendChild(h);
  }

  const [y, m] = calMonth.split("-").map(Number);
  const lead = new Date(y, m - 1, 1).getDay();
  const dim = new Date(y, m, 0).getDate();
  const today = beijingToday();
  const byDate = {};
  for (const row of resp.days) byDate[row.date] = row;

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
    if (row) {
      cell.classList.add("has-data");
      if (row.basis === "partial") {
        cell.classList.add("partial");
        cell.title = "覆盖率 " + fmtPct(row.coverage || 0) + "（by_model 未覆盖全部 token，按 fallback 价补齐）";
      } else {
        cell.title = row.coverage != null ? "覆盖率 " + fmtPct(row.coverage) : "";
      }
      const day = document.createElement("div");
      day.className = "d";
      day.textContent = String(d);
      const amt = document.createElement("div");
      amt.className = "amt";
      amt.textContent = fmtMoney(row.total);
      cell.appendChild(day);
      cell.appendChild(amt);
    } else {
      const day = document.createElement("div");
      day.className = "d";
      day.textContent = String(d);
      cell.appendChild(day);
    }
    if (date === today) cell.classList.add("today");
    grid.appendChild(cell);
  }
  document.getElementById("cal-note").textContent =
    "方格金额为该日总成本；「部分覆盖」= by_model 未覆盖全部 token，按 fallback 价补齐。";
}

function shiftMonth(delta) {
  const [y, m] = calMonth.split("-").map(Number);
  const t = new Date(y, m - 1 + delta, 1);
  calMonth = t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0");
  renderCalendar();
}

// ---------- 会话（列表 + 详情） ----------

async function loadSessions(reset) {
  if (reset) {
    sessState = { items: [], nextCursor: null, total: null, loaded: true, error: false };
    document.getElementById("sess-banner").hidden = true;
  }
  sessState.loaded = true;

  const args = { pageSize: 50 };
  if (sessState.nextCursor) args.cursor = JSON.stringify(sessState.nextCursor);
  // `sessions_list` spawn 二进制、首次（冷 cache）可能要几十秒才回——真机实
  // 测过 631MB/115 个会话文件冷启动要 30+ 秒。这段等待期间之前完全没有任何
  // 视觉反馈（tab 面板就是空的），跟窗口真的假死在观感上没有区别，这是用户
  // 报告"点 tab 卡到假死"的直接原因之一，不只是 IPC 本身慢。加一条"加载
  // 中…"，至少让等待是可见、可解释的等待，不是看起来卡死的等待。
  const loadingEl = document.getElementById("sess-loading");
  loadingEl.hidden = false;
  try {
    const resp = await invoke("sessions_list", args);
    // DTO 把分页嵌在顶层 `page` 下（r2a list DTO §2.5），`resp` 本身是 envelope
    // 容器。读错层会恒显「暂无会话」的假空——这是真机实证的缺陷，不是风格问题。
    const page = resp.page || {};
    sessState.items = sessState.items.concat(page.items || []);
    sessState.nextCursor = page.next_cursor || null;
    sessState.total = page.total != null ? page.total : sessState.items.length;
    sessState.error = false;
    renderSessions();
  } catch (e) {
    sessState.error = true;
    // 报错不摆「暂无会话」的假空——错误横幅就是错误横幅，跟空态二选一。
    showBanner("sess-banner", e, true);
    renderSessions();
  } finally {
    loadingEl.hidden = true;
  }
}

function renderSessions() {
  const body = document.getElementById("sess-body");
  const count = document.getElementById("sess-count");
  const empty = document.getElementById("sess-empty");
  const more = document.getElementById("sess-more");
  body.innerHTML = "";

  count.textContent = sessState.total != null ? "共 " + sessState.total + " 个会话 · 点任意行看报告" : "";
  if (sessState.items.length === 0) {
    // error 时隐藏空态：横幅已经说明了数据源问题，不要再摆「暂无会话」冒充真空。
    empty.hidden = sessState.error;
    more.hidden = true;
    return;
  }
  empty.hidden = true;
  for (const s of sessState.items) {
    const tr = document.createElement("tr");
    const titleCell = document.createElement("td");
    titleCell.textContent = titleText(s);
    // 行尾 chevron：把「这行能点」写进视觉，不用悬停才发现（原来没有任何提示）。
    const chev = el("span", "row-chevron");
    chev.textContent = "›";
    titleCell.appendChild(chev);
    tr.appendChild(titleCell);
    tr.appendChild(td(s.host_kind || "—"));
    tr.appendChild(td(s.model || "—"));
    const span = s.date_span;
    tr.appendChild(td(span && span.first ? span.first + (span.last && span.last !== span.first ? " … " + span.last : "") : "—"));
    tr.appendChild(tdNum(fmtTokens(s.tokens_total)));
    tr.appendChild(tdNum(fmtUSD(s.cost_usd)));
    tr.appendChild(tdNum(s.findings_total != null ? String(s.findings_total) : "—"));
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
  // 无标题（Codex 标题命中 87% 不是 100%）→ 用 native_id 兜底，诚实不臆造标题。
  const id = s.session_key && s.session_key.native_id;
  if (id) return String(id);
  return "（无标题）";
}

async function showSession(s) {
  document.getElementById("sess-list-view").hidden = true;
  document.getElementById("sess-detail-view").hidden = false;
  document.getElementById("sess-detail-banner").hidden = true;
  renderDetailSummary(s);
  try {
    const env = await invoke("sessions_read", { sessionKey: s.session_key });
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
  cards.appendChild(detailCard("模型", s.model || "—"));
  // 从 findings 跳过来时 s 只有 session_key/title/model/host_kind，date_span 等
  // 字段缺场——逐个判空，不拿 undefined 当字符串拼。成本/Token/Findings 同理。
  cards.appendChild(detailCard("宿主 / 日期",
    (s.host_kind || "—") + " · " + (s.date_span && s.date_span.first ? s.date_span.first.slice(0, 10) : "—")));
  cards.appendChild(detailCard("成本(USD)", fmtUSD(s.cost_usd)));
  cards.appendChild(detailCard("Tokens", fmtTokens(s.tokens_total)));
  cards.appendChild(detailCard("Findings", s.findings_total != null ? String(s.findings_total) : "—"));
  body.appendChild(cards);

  const loading = el("div", "detail-section");
  loading.id = "sess-detail-loading";
  const lt = el("div", "panel-title");
  lt.textContent = "完整审计报告";
  loading.appendChild(lt);
  const p = el("div", "muted");
  p.textContent = "读取中…";
  loading.appendChild(p);
  body.appendChild(loading);
}

function detailCard(label, value) {
  const card = el("div", "detail-card");
  const l = el("div", "label");
  l.textContent = label;
  const v = el("div", "value");
  v.textContent = value;
  card.appendChild(l);
  card.appendChild(v);
  return card;
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
  const t = el("div", "panel-title");
  t.textContent = title;
  sec.appendChild(t);
  return sec;
}

// 会话时间线：把宿主 envelope 里的用量序列 + 事件投影到通用几何
// （src-tauri/ui/timeline.js 的 TimelineGeometry.buildTimeline，spec §4 契约）。
// 纯数据准备 + 渲染壳——比例尺/缺口/事件保真都在 timeline.js 的纯函数里，这里只
// 负责把 DSH `requests` / Codex `cost_report.hours` 映射成 points/events。
function timelineSection(session, host) {
  const geo = window.TimelineGeometry && window.TimelineGeometry.buildTimeline;
  if (!geo) return null; // timeline.js 没加载 → 不渲染这一节，不是报错

  let points = null, events = [], series = null, title = "会话时间线";

  if (host === "codex") {
    // Codex：逐小时 token 桶（cost_report.hours 已是北京时间的逐小时 delta）。
    const hours = session.cost_report && Array.isArray(session.cost_report.hours) ? session.cost_report.hours : null;
    if (!hours || hours.length === 0) return null;
    points = hours.map((h, i) => ({ ordinal: i, values: { tokens: h.tokens } }));
    series = [{ name: "tokens", label: "token", cumulative: false }];
    title = "逐小时 token 用量（" + hours.length + " 小时）";
    // turn_timeline 的 source_order 是原始事件序号（千级），对不上小时桶（十级），
    // 事件叠加留到「按 source_order 画逐事件时间线」那一档再做——这里只画用量形状。
  } else {
    // DSH：逐请求累计 token（uncached_input + output + cache_read 累加）。
    const reqs = Array.isArray(session.requests) ? session.requests : null;
    if (!reqs || reqs.length === 0) return null;
    points = reqs.map((r) => ({
      ordinal: r.seq,           // 用 DSH seq 当 ordinal，findings 的 seq 才能对上
      task_id: r.turn != null ? r.turn : null,
      values: {
        tokens: (r.uncached_input_tokens || 0) + (r.output_tokens || 0) + (r.cache_read_tokens || 0),
      },
    }));
    series = [{ name: "tokens", label: "累计 token", cumulative: true }];
    title = "逐请求累计 token（" + reqs.length + " 个请求）";
    // findings 当事件标记。finding 的 seq 是 DSH **事件流**的 seq（9807 条），而
    // requests 只是其中 284 个 request 事件的稀疏子集——finding.seq 直接对不上
    // request.seq（实测 440338/445285 都不在任何 request 里）。改按 turn 定位：
    // finding.turn → 该 turn 的第一个 request 的 seq，找不到才退回 seq 精确匹配。
    const turnToSeq = {};
    for (const r of reqs) if (r.turn != null && !(r.turn in turnToSeq)) turnToSeq[r.turn] = r.seq;
    const findings = Array.isArray(session.findings) ? session.findings : [];
    for (const f of findings) {
      let ord = null;
      if (f.turn != null && turnToSeq[f.turn] != null) ord = turnToSeq[f.turn];
      else if (f.seq != null) ord = f.seq;
      if (ord == null) continue;
      events.push({
        ordinal: ord, kind: "risk",
        label: (f.rule || "?") + " " + (f.evidence || ""),
        severity: f.severity || "info",
      });
    }
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
  for (const f of findings) {
    const row = el("div", "detail-finding");
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
  for (const [model, m] of Object.entries(s.cost.per_model)) {
    const label = m.short_name || model;
    const sub = m.provider ? " · " + m.provider : "";
    sec.appendChild(kvRow(label + sub, fmtMoney(m.total || 0), model));
  }
  return sec;
}

function dshContextSection(s) {
  if (!s.context) return null;
  const c = s.context;
  const sec = detailSection("上下文构成");
  sec.appendChild(kvRow("system", fmtTokens(c.system_tokens)));
  sec.appendChild(kvRow("tools", fmtTokens(c.tools_tokens)));
  sec.appendChild(kvRow("catalog", fmtTokens(c.catalog_tokens) + "（" + (c.catalog_entries || 0) + " 条目）"));
  if (Array.isArray(c.catalog_names) && c.catalog_names.length) {
    // 每个 skill 目录条目各占多少 token——这个仓库的核心命题，别埋在 JSON 里。
    const sorted = c.catalog_names.slice().sort((a, b) => (b.tokens || 0) - (a.tokens || 0));
    for (const n of sorted) {
      sec.appendChild(kvRow(n.name || "—", fmtTokens(n.tokens)));
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
  for (const t of top) {
    sec.appendChild(kvRow(
      t.n + "（" + t.count + " 次，峰值 " + Math.round(t.max) + "ms）",
      (t.sum / 1000).toFixed(1) + "s"
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

function dshRuleOutcomesSection(s) {
  if (!s.rule_outcomes) return null;
  const sec = detailSection("规则三态");
  // findings / measured_zero / unavailable 三种结局，一次会话里每条 SV 规则落在哪
  // 一格——诚实的三态不折叠成「没发现」。
  for (const [rule, o] of Object.entries(s.rule_outcomes)) {
    const status = o && o.status ? o.status : "?";
    const suffix = status === "findings" && o.count ? "（" + o.count + "）" : "";
    sec.appendChild(kvRow(rule, status + suffix));
  }
  return sec;
}

function dshCoverageSection(s) {
  const fields = ["usage_coverage", "duration_coverage", "skill_coverage",
    "subagents_coverage", "compaction_coverage", "waste_coverage"];
  const present = fields.filter((k) => s[k]);
  if (present.length === 0) return null;
  const sec = detailSection("覆盖率");
  for (const k of present) {
    const c = s[k];
    const v = c.status || "?";
    const extra = c.count != null ? " · " + c.count : (c.sample_count != null ? " · " + c.sample_count : "");
    sec.appendChild(kvRow(k.replace("_coverage", ""), v + extra));
  }
  return sec;
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
    for (const [model, m] of Object.entries(r.per_model)) {
      sec.appendChild(kvRow(m.short_name || model, fmtUSD(m.cost_usd), model));
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

  const session = env.session || {};
  const host = (env.session_key && env.session_key.host_kind) || session.host_kind || null;

  const meta = detailSection("版本元数据");
  const mm = el("div", "detail-meta");
  mm.textContent = [
    "schema " + (env.schema_version || "—"),
    "engine " + (env.engine_version || "—"),
    "pricing " + (env.pricing_version || "—"),
    "生成于 " + (env.generated_at || "—"),
    "revision " + (env.session_revision || "—"),
  ].join(" · ");
  meta.appendChild(mm);
  body.appendChild(meta);

  const fsec = findingsSection(session);
  if (fsec) body.appendChild(fsec);

  if (host === "codex") {
    renderCodexSections(body, session);
  } else {
    renderDshSections(body, session);
  }

  body.appendChild(rawSection(env));
}

// ---------- Findings（跨会话汇总） ----------

// finding.time 是 epoch ms（DSH 有、Codex 恒 null）。null → —，诚实不臆造。
function fmtFindingTime(ms) {
  if (ms == null) return "—";
  const d = new Date(ms);
  return d.toLocaleString("zh-CN", {
    month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

// 会话标签：title 优先，否则 native_id 兜底（Codex 标题命中非 100%，DSH 仅 17/59
// 有 workspace.json 标题）。不进 source_profile——那串太长，明细只够放标签。
function findingSessionLabel(f) {
  if (f.title) return f.title;
  const id = f.session_key && f.session_key.native_id;
  return id ? String(id) : "（无标题）";
}

async function loadFindings(reset) {
  if (reset) {
    findState = { loaded: true, error: false, data: null, sev: "all", rule: "all" };
    document.getElementById("find-banner").hidden = true;
  }
  findState.loaded = true;
  // 同 loadSessions：`sessions_findings` 无分页、必须扫全部会话，冷 cache 时
  // 是这三个 tab 里最重的一个，没有任何等待反馈时最容易被当成假死。
  const loadingEl = document.getElementById("find-loading");
  loadingEl.hidden = false;
  try {
    const data = await invoke("sessions_findings");
    findState.data = data;
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
    empty.hidden = true;
    return;
  }
  banner.hidden = true;
  const t = findState.data.totals || {};
  const total = t.findings || 0;

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

  // 源贡献 chips：按 host_kind 数明细，DSH/Codex 各几条。
  const chips = document.getElementById("find-chips");
  chips.innerHTML = "";
  const bySrc = {};
  for (const f of findState.data.findings || []) {
    const k = f.host_kind || "?";
    bySrc[k] = (bySrc[k] || 0) + 1;
  }
  for (const k of ["dsh", "codex"]) {
    if (bySrc[k] == null) continue;
    const c = el("span", "chip" + (k === "dsh" ? " dsh" : " codex"));
    c.textContent = k + " · " + bySrc[k];
    chips.appendChild(c);
  }

  // 规则表。
  const rules = findState.data.rules || [];
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
  foot.textContent = total > 500
    ? "共 " + total + " 条，仅显示前 500（可用「严重度 / 规则」筛选收窄，筛选后再按需展示）。"
    : "";
}

// 只重画明细表：筛选下拉 change 时调，不碰卡片/规则表。
function renderFindingsDetail() {
  const rows = findState.data ? (findState.data.findings || []) : [];
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
    tr.appendChild(td(findingSessionLabel(f)));
    const sevCell = document.createElement("td");
    const badge = el("span", "sev " + (f.severity || "info"));
    badge.textContent = f.severity || "info";
    sevCell.appendChild(badge);
    tr.appendChild(sevCell);
    tr.appendChild(td(f.rule || "—"));
    const tool = document.createElement("td");
    tool.textContent = f.tool_name || "—";
    tool.title = f.tool_name || "";
    tr.appendChild(tool);
    const ev = document.createElement("td");
    const txt = f.evidence || "—";
    ev.textContent = txt.length > 60 ? txt.slice(0, 60) + "…" : txt;
    ev.title = txt;
    tr.appendChild(ev);
    // 每条 finding 都带着完整的 session_key（DSH/Codex 都是）——点到那条会话的
    // 完整报告，别再让 critical 发现悬在半空无处可去。
    if (f.session_key) {
      tr.addEventListener("click", () => openSessionFromFinding(f));
    }
    frag.appendChild(tr);
  }
  body.appendChild(frag);
}

// 从 Findings 明细跳转到该会话详情：切到会话 tab 的详情视图，用 finding 里能
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
    srcState = { loaded: true, error: false, sources: null, sync: null };
    document.getElementById("src-banner").hidden = true;
  }
  srcState.loaded = true;
  // `sessions_list` 即便 pageSize:1，也要先跑完 cache 命中判定（扫全部会话
  // 文件的指纹）才能回——不是"只要 1 条就一定快"，见 loadSessions 的同款
  // 注释。
  const loadingEl = document.getElementById("src-loading");
  loadingEl.hidden = false;
  // 两个数据源独立拉：一个失败不吞另一个（partial 照样渲染，横幅明说缺哪个）。
  let err = null;
  try {
    const r = await invoke("sessions_list", { pageSize: 1 });
    srcState.sources = (r && r.source_statuses) || {};
  } catch (e) { err = e; }
  try {
    const ov = await invoke("read_overview");
    srcState.sync = (ov && ov.sync) || null;
  } catch (e) { if (!err) err = e; }
  loadingEl.hidden = true;
  if (err) { srcState.error = true; showBanner("src-banner", err, false); }
  else { srcState.error = false; }
  renderSources();
}

function renderSources() {
  const foot = document.getElementById("src-foot");
  const syncEl = document.getElementById("src-sync");
  const sync = srcState.sync;
  if (sync) {
    if (sync.ok) {
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
  cards.innerHTML = "";
  if (srcState.error && !srcState.sources) {
    foot.textContent = "数据源状态读取失败，见上方错误横幅。";
    return;
  }
  const s = srcState.sources || {};
  let any = false;
  for (const key of ["codex", "dsh"]) {
    if (!s[key]) continue;
    any = true;
    cards.appendChild(renderSourceCard(key, s[key]));
  }
  if (!any) {
    foot.textContent = "没有可用的数据源状态。";
    return;
  }
  const n = Object.keys(s).length;
  foot.textContent = "共 " + n + " 个数据源 · 状态由宿主扫描时落盘（sessions list / findings 同源）。";
}

function renderSourceCard(key, src) {
  const card = el("div", "src-card " + key);
  const head = el("div", "src-head");
  const name = el("span", "src-name");
  name.textContent = key === "dsh" ? "DeepSeek Harness（DSH）" : "Codex Sessions";
  head.appendChild(name);

  const status = src.status || "unknown";
  const badge = el("span", "src-badge " + status);
  const degraded = Array.isArray(src.degraded) ? src.degraded : [];
  if (status === "ok" && degraded.length === 0) {
    badge.textContent = "正常";
    badge.classList.add("ok");
  } else if (status === "unavailable") {
    badge.textContent = "不可用";
    badge.classList.add("fail");
  } else {
    badge.textContent = degraded.length > 0 ? "部分降级" : "状态未知";
    badge.classList.add("warn");
  }
  head.appendChild(badge);

  const sessions = el("div", "src-meta");
  sessions.textContent = "会话数 " + (src.sessions != null ? src.sessions : "—");
  card.appendChild(head);
  card.appendChild(sessions);

  const roots = Array.isArray(src.roots) ? src.roots : [];
  if (roots.length > 0) {
    const rtitle = el("div", "panel-title");
    rtitle.textContent = "扫描根";
    card.appendChild(rtitle);
    const wrap = el("div", "table-wrap");
    const table = document.createElement("table");
    table.className = "sess-table root-table";
    const thead = document.createElement("thead");
    thead.innerHTML = "<tr><th>kind</th><th>path</th><th>存在</th>" +
      "<th class='num'>文件</th><th class='num'>字节</th></tr>";
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    for (const r of roots) {
      const tr = document.createElement("tr");
      if (r.exists === false) tr.className = "root-missing";
      tr.appendChild(td(r.kind || "—"));
      const p = td(r.path || "—");
      p.title = r.path || "";
      tr.appendChild(p);
      tr.appendChild(td(r.exists === false ? "否" : "是"));
      tr.appendChild(tdNum(r.file_count != null ? String(r.file_count) : "—"));
      tr.appendChild(tdNum(r.total_bytes != null ? String(r.total_bytes) : "—"));
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    card.appendChild(wrap);
  }

  if (degraded.length > 0) {
    const dtitle = el("div", "panel-title");
    dtitle.textContent = "降级项（" + degraded.length + "）";
    card.appendChild(dtitle);
    for (const d of degraded) {
      const row = el("div", "degraded-row");
      const p = el("span", "degraded-path");
      p.textContent = d.path || "?";
      p.title = d.path || "";
      row.appendChild(p);
      const why = el("span", "degraded-reason");
      why.textContent = "：" + (d.reason || "未知原因");
      row.appendChild(why);
      card.appendChild(row);
    }
  }
  return card;
}

// ---------- 初始化 ----------

function init() {
  document.querySelectorAll(".tab").forEach((t) => {
    t.addEventListener("click", () => switchTab(t.dataset.tab));
  });
  document.getElementById("wb-refresh").addEventListener("click", loadActiveTab);
  document.getElementById("cal-prev").addEventListener("click", () => shiftMonth(-1));
  document.getElementById("cal-next").addEventListener("click", () => shiftMonth(1));
  document.getElementById("cal-month").addEventListener("change", (ev) => {
    if (ev.target.value) { calMonth = ev.target.value; renderCalendar(); }
  });
  document.getElementById("sess-more").addEventListener("click", () => loadSessions(false));
  document.getElementById("sess-reload").addEventListener("click", () => loadSessions(true));
  document.getElementById("sess-back").addEventListener("click", () => {
    document.getElementById("sess-detail-view").hidden = true;
    document.getElementById("sess-list-view").hidden = false;
  });
  document.getElementById("find-reload").addEventListener("click", () => loadFindings(true));
  document.getElementById("find-sev").addEventListener("change", (ev) => {
    findState.sev = ev.target.value;
    renderFindingsDetail();
  });
  document.getElementById("find-rule").addEventListener("change", (ev) => {
    findState.rule = ev.target.value;
    renderFindingsDetail();
  });
  document.getElementById("src-reload").addEventListener("click", () => loadSources(true));
  // 日历默认月跟随北京今天；本月输入框受 input[type=month] 约束天然合法。
  if (!calMonth) calMonth = beijingMonth();
  renderOverview();
}

document.addEventListener("DOMContentLoaded", init);
