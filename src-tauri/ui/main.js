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

  // 预算
  const budget = ov.budget_monthly_cny || 0;
  const fill = document.getElementById("budget-fill");
  const budgetSub = document.getElementById("budget-sub");
  if (budget > 0) {
    const ratio = Math.min(1, monthTotal / budget);
    fill.style.width = fmtPct(ratio);
    fill.className = "fill" + (ratio >= 0.9 ? " danger" : ratio >= 0.7 ? " warn" : "");
    const remaining = budget - monthTotal;
    budgetSub.textContent =
      remaining >= 0
        ? "剩余 " + fmtMoney(remaining) + "（" + Math.round((remaining / budget) * 100) + "%）"
        : "超支 " + fmtMoney(-remaining);
  } else {
    fill.style.width = "0%";
    fill.className = "fill";
    budgetSub.textContent = "未配置预算";
  }

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
    ov.estimate_note + " · " + ov.data_home;
}

document.getElementById("close").addEventListener("click", () => invoke("hide_window"));
// 每次窗口重新获得焦点都重拉 —— 面板常驻（hide 不是 close），数据要新鲜。
window.addEventListener("focus", render);
window.addEventListener("DOMContentLoaded", render);
