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

  count.textContent = sessState.total != null ? "共 " + sessState.total + " 个会话" : "";
  if (sessState.items.length === 0) {
    // error 时隐藏空态：横幅已经说明了数据源问题，不要再摆「暂无会话」冒充真空。
    empty.hidden = sessState.error;
    more.hidden = true;
    return;
  }
  empty.hidden = true;
  for (const s of sessState.items) {
    const tr = document.createElement("tr");
    tr.appendChild(td(titleText(s)));
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
  cards.appendChild(detailCard("宿主 / 日期",
    s.host_kind + " · " + (s.date_span && s.date_span.first ? s.date_span.first : "—")));
  cards.appendChild(detailCard("成本(USD)", fmtUSD(s.cost_usd)));
  cards.appendChild(detailCard("Tokens", fmtTokens(s.tokens_total)));
  cards.appendChild(detailCard("Findings", s.findings_total != null ? String(s.findings_total) : "—"));
  body.appendChild(cards);

  const raw = el("div", "detail-section");
  const title = el("div", "panel-title");
  title.textContent = "完整审计报告";
  raw.appendChild(title);
  const pre = el("pre", "detail-raw");
  pre.textContent = "读取中…";
  raw.appendChild(pre);
  body.appendChild(raw);
  body.querySelector(".detail-raw").id = "sess-detail-raw";
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

function renderDetailEnvelope(env) {
  const body = document.getElementById("sess-detail-body");
  // 头部 summary 卡片已由 renderDetailSummary 画好，这里替换最后那个 raw 区块 + 加 meta。
  const rawPre = document.getElementById("sess-detail-raw");
  if (!rawPre) return;

  const meta = el("div", "detail-section");
  const mt = el("div", "panel-title");
  mt.textContent = "版本元数据";
  meta.appendChild(mt);
  const mm = el("div", "detail-meta");
  mm.textContent = [
    "schema " + (env.schema_version || "—"),
    "engine " + (env.engine_version || "—"),
    "pricing " + (env.pricing_version || "—"),
    "生成于 " + (env.generated_at || "—"),
    "revision " + (env.session_revision || "—"),
  ].join(" · ");
  meta.appendChild(mm);
  body.insertBefore(meta, rawPre.parentNode);

  // session payload：防御性点取常见键（Codex/DSH 形状不同），其余整块进 raw JSON。
  // findings 字段位：DSH = session.findings，Codex = session.audit.findings（宿主
  // findings_for 是权威谓词，这里是同一张表的展示端）。Codex 的 finding 是
  // {rule,severity,evidence,…}，无 where/title 键——fallback 到 JSON 不炸。
  const session = env.session || {};
  const codexAudit = session.audit && Array.isArray(session.audit.findings) ? session.audit.findings : null;
  const findings = Array.isArray(session.findings) ? session.findings : codexAudit;
  if (findings && findings.length > 0) {
    const sec = el("div", "detail-section");
    const st = el("div", "panel-title");
    st.textContent = "findings（" + findings.length + "）";
    sec.appendChild(st);
    for (const f of findings) {
      const row = el("div", "detail-finding");
      const sev = el("span", "sev " + (f.severity || "info"));
      sev.textContent = f.severity || "info";
      row.appendChild(sev);
      const txt = el("span");
      txt.textContent = f.rule || (f.title ? f.title : JSON.stringify(f));
      txt.title = f.where || "";
      row.appendChild(txt);
      sec.appendChild(row);
    }
    body.insertBefore(sec, rawPre.parentNode);
  }

  rawPre.textContent = JSON.stringify(env, null, 2);
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
    frag.appendChild(tr);
  }
  body.appendChild(frag);
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
