// 面板前端：纯 HTML/CSS/JS，无打包器 —— `withGlobalTauri: true` 让全局
// `window.__TAURI__` 可用（ADR-010 定的前端栈）。数据只来自 `read_overview`
// 命令，任何金额都不在本文件计算（core 算好、这里格式化展示）。
"use strict";

const { invoke } = window.__TAURI__.core;

// 金额 → ¥600 / ¥774.7 / ¥6.73。与 core format_money / 托盘 fmt_money 同 spec：
// ≥100 一位小数、否则两位、去尾零。
function fmtMoney(x) {
  const s = x >= 100 ? x.toFixed(1) : x.toFixed(2);
  return "¥" + s.replace(/0+$/, "").replace(/\.$/, "");
}

function fmtPct(x) {
  return Math.round(x * 100) + "%";
}

async function render() {
  let ov;
  try {
    ov = await invoke("read_overview");
  } catch (err) {
    document.getElementById("today-amount").textContent = "读取失败";
    document.getElementById("note").textContent = String(err);
    return;
  }

  // 今日
  const todayAmount = document.getElementById("today-amount");
  const todaySub = document.getElementById("today-sub");
  if (ov.today) {
    todayAmount.textContent = fmtMoney(ov.today.total || 0);
    todaySub.textContent =
      (ov.today.peak_total || 0) > 0 ? "其中高峰 " + fmtMoney(ov.today.peak_total) : "";
  } else {
    todayAmount.textContent = "—";
    todaySub.textContent = "今天还没有数据";
  }

  // 本月
  const monthTotal = ov.month.total || 0;
  document.getElementById("month-amount").textContent = fmtMoney(monthTotal);
  const monthPeak = ov.month.peak_total || 0;
  document.getElementById("month-sub").textContent =
    monthPeak > 0 ? "其中高峰 " + fmtMoney(monthPeak) : "";

  // 预算 —— 只读 alert.json 权威（level/ratio/日预算/snooze/reasons），不在这里
  // 重算百分比。那是迁移要修的 D2 缺口：面板自算 remaining% 与 budget.py 规则无关。
  const b = ov.budget || { source: "missing" };
  const fill = document.getElementById("budget-fill");
  const budgetSub = document.getElementById("budget-sub");
  const denom = b.monthly_cny || ov.budget_monthly_cny || 0;
  if (b.source !== "alert" || !b.level) {
    // alert 缺场：不臆造状态，直说数据链路还没产出。
    fill.style.width = "0%";
    fill.className = "fill";
    budgetSub.textContent = "等预算数据（跑一次 oneline）";
  } else {
    // 百分比唯一来源：alert.json 的 month_ratio（今日 ratio 可能为 null）。用
    // `??` 而不是 `||`——合法的月占比 0 不能被 `||` 错回退成日占比（review fix 6）。
    const ratio = Math.min(1, b.month_ratio ?? b.ratio ?? 0);
    const daily =
      b.effective_daily_budget != null ? " · 日预算 " + fmtMoney(b.effective_daily_budget) : "";
    fill.style.width = fmtPct(ratio);
    const levelCls =
      b.level === "over" ? " danger" : b.level === "warn" ? " warn" : "";
    fill.className = "fill" + levelCls;
    // 状态行：over/warn/snoozed/disabled/ok 各自的权威文案，百分比来自 alert.json。
    if (b.level === "over") {
      budgetSub.textContent =
        "超支 " + fmtMoney(b.month_cost || 0) + "（月 " + fmtMoney(denom) + "）" + daily;
    } else if (b.level === "snoozed") {
      budgetSub.textContent =
        "已静默" + (b.snoozed_until ? "至 " + b.snoozed_until : "") + daily;
    } else if (b.level === "disabled") {
      // 预算被显式禁用：不落入「已用 xx%」的通用文案（review fix 6）。
      budgetSub.textContent = "预算已禁用" + daily;
    } else {
      budgetSub.textContent =
        "已用 " + fmtPct(b.month_ratio ?? 0) + "（" + fmtMoney(b.month_cost || 0) +
        " / " + fmtMoney(denom) + "）" + daily;
    }
    // reasons 悬停可见：为什么是这个 level（预算规则的人话）。
    budgetSub.title = (b.reasons || []).join("\n");
  }

  // 新鲜度：alert.json 的 generated_at 是 budget.evaluate() 的落盘时刻。stale
  // （>5 分钟）要明说「数据过期」，不能假装「正常」——规格 R1 的健康≠新鲜度正交。
  const note = document.getElementById("note");
  let freshness = "";
  if (b.generated_at) {
    const t = new Date(b.generated_at);
    const hhmm = t.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
    const stale = Date.now() - t.getTime() > 5 * 60 * 1000;
    freshness = (stale ? "⚠ 数据过期（更新于 " : "数据更新于 ") + hhmm + "）";
  } else {
    freshness = "预算数据尚未产出";
  }

  // 同步状态（review fix 4）：tick 每轮把结果落盘到 state/last-sync.json，这里
  // 只读展示。失败要可见、要可行动——状态行 + 「立即同步」按钮（trigger_sync =
  // 与托盘「立即同步」同一条受控 tick 路径）。
  const sync = ov.sync || { ok: false, stage: "never", message: "尚未同步" };
  const syncStatus = document.getElementById("sync-status");
  const syncNow = document.getElementById("sync-now");
  if (sync.ok) {
    syncStatus.textContent =
      "上次同步：成功" + (sync.at ? " " + sync.at.slice(11, 16) : "");
    syncStatus.title = sync.message + (sync.at ? "（" + sync.at + "）" : "");
    syncNow.hidden = true;
  } else if (sync.stage === "never") {
    // 首次启动、还没跑过 tick：诚实说「尚未同步」，给入口。
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
      // 受控 tick 在后台线程跑（discover→oneline→refresh），轮询等 last-sync.json
      // 的 at 变化（成功/失败都会落盘）。oneline 一般 <1s，10s 是上界。
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const o = await invoke("read_overview");
        if (o.sync && (o.sync.at || "") !== before) {
          render();
          return;
        }
      }
      render();
    } catch (e) {
      syncStatus.textContent = "同步请求失败：" + String(e);
      syncNow.disabled = false;
    }
  };

  // 逐日
  const list = document.getElementById("days-list");
  const empty = document.getElementById("days-empty");
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

  document.getElementById("note").textContent =
    freshness + " · " + ov.estimate_note + " · " + ov.data_home;
}

document.getElementById("close").addEventListener("click", () => invoke("hide_window"));
// 每次窗口重新获得焦点都重拉 —— 面板常驻（hide 不是 close），数据要新鲜。
window.addEventListener("focus", render);
window.addEventListener("DOMContentLoaded", render);
