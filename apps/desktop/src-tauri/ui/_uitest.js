// 本地 UI 视觉自检 shim（不进 bundle）：伪造 Tauri invoke + 错误捕获。
window.__TAURI__ = {
  core: { invoke: async (cmd) => {
    if (cmd === "probe_routes_list") return [
      { route_id: "r1", label: "官方直连", model_requested: "claude-sonnet-5", consent_granted_at_ms: 1700000000000 },
      { route_id: "r2", label: "胜算云", model_requested: "deepseek/deepseek-v4-pro-0813", consent_granted_at_ms: null },
    ];
    if (cmd === "routes_quality") return {
      since_ms: 1, now_ms: 2, families_vocabulary: [],
      hosts: [{
        host: "claude-code", has_baseline: true, native_families: ["anthropic"],
        totals: { requests: 47249, sessions: 282 },
        families: [
          { family: "anthropic", flag: "native", requests: 23443, sessions: 131, tokens_total: 9192132340, last_event_ms: Date.now()-3600e3, request_share: 49.6, models: [{ model: "claude-sonnet-5", provider_raw: "anthropic", provider_id: "anthropic", requests: 16188, tokens_total: 5e9, last_event_ms: 1 }] },
          { family: "deepseek", flag: "non_native", requests: 17372, sessions: 108, tokens_total: 2942169772, last_event_ms: Date.now()-7200e3, request_share: 36.8, models: [{ model: "deepseek-v4-flash", provider_raw: "", provider_id: "", requests: 11895, tokens_total: 2e9, last_event_ms: 1 }] },
          { family: "glm", flag: "non_native", requests: 2549, sessions: 28, tokens_total: 652162875, last_event_ms: 1, request_share: 5.4, models: [{ model: "glm-5.3-flash[1M]", provider_raw: "", provider_id: "", requests: 1455, tokens_total: 3e8, last_event_ms: 1 }] },
          { family: "minimax", flag: "non_native", requests: 3642, sessions: 26, tokens_total: 758016115, last_event_ms: 1, request_share: 7.7, models: [{ model: "MiniMax-M3", provider_raw: "", provider_id: "", requests: 3087, tokens_total: 6e8, last_event_ms: 1 }] },
          { family: "synthetic", flag: "api_error", requests: 238, sessions: 78, tokens_total: 0, last_event_ms: Date.now(), request_share: 0.5, models: [{ model: "<synthetic>", provider_raw: "", provider_id: "", requests: 238, tokens_total: 0, last_event_ms: 1 }] },
        ],
      }],
    };
    return null;
  } },
  event: { listen: async () => () => {} },
};
window.__errors__ = [];
window.addEventListener("error", (e) => { window.__errors__.push(String(e.message).slice(0,150)); });
import("./workbench.js").catch((e) => window.__errors__.push("import:" + String(e).slice(0,150)));
document.addEventListener("DOMContentLoaded", () => {
  const draw = () => {
    const d = document.createElement("pre");
    d.style.cssText = "position:fixed;z-index:99999;left:4px;bottom:4px;background:#fff;color:#f00;font-size:11px;max-width:95vw;margin:0;padding:4px;border:1px solid #f00";
    d.textContent = "ERR[" + window.__errors__.join(" | ") + "] HOSTS=" + document.getElementById("test-quality-hosts").children.length;
    document.body.appendChild(d);
  };
  // workbench.js 是动态 import：模块求值可能晚于 DOMContentLoaded——点不到
  // 就用微任务重试（headless screenshot 不推进 timer，不能用 setTimeout）。
  let tries = 0;
  const tryClick = () => {
    try { document.querySelector('button.tab[data-tab="test"]').click(); } catch (e) { window.__errors__.push("click:" + e.message); }
    const active = document.getElementById("tab-test").classList.contains("active");
    if (active) { Promise.resolve().then(draw); }
    else if (++tries < 1000) { Promise.resolve().then(tryClick); }
    else { Promise.resolve().then(draw); }
  };
  Promise.resolve().then(tryClick);
});
