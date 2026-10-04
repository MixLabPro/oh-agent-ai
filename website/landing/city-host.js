// 落地页 ↔ Agent City 插件的父侧宿主（apps/agent-city/ui 的 iframe 模式）。
// 协议：postMessage 信道 av-plugin-rpc v1（@agent-vitals/app-sdk ui-host 的
// 浏览器分支）——同源、instanceId 隔离；数据走 PluginRequestV1/ResponseV1，
// 投影契约 CityProjectionV1（source:"fixture"，页面示例数据）。
// 产物 city3d/ 由 tools/build-city3d.mjs 从 apps/agent-city/ui 构建灌入；
// 产物缺失时保持 canvas mock，不报错——landing 在任何情况下不缺画面。
(() => {
  const INSTANCE = 'av-landing-city';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const stage = document.querySelector('.city-stage');
  const canvas = document.getElementById('city-canvas');
  if (!stage || !canvas || !window.parent === window) {
    // 正常 standalone 打开时 window.parent === window：宿主逻辑无意义
  }
  const currentLocale = () => (document.documentElement.lang === 'zh-CN' ? 'zh-Hans' : 'en');

  // ── 示例投影：确定性种子，五宿主、幂律 tokens、三个 landmark 候选 ──
  function projection(windowDays, locale) {
    let seed = 20261002;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const HARNESS = ['claude_code', 'codex', 'deepseek_harness', 'workbuddy', 'zcode'];
    const now = Date.now();
    const from = now - windowDays * 86400_000;
    // 分布：多数小会话 + 少数 landmark 级（与应用内 tokensToHeight 的
    // landmark 语义对齐——大数真的立得起来）
    const sessions = [];
    const landmarks = [18_600_000, 42_300_000, 8_900_000];
    const count = windowDays <= 7 ? 26 : windowDays <= 30 ? 78 : windowDays <= 90 ? 160 : 380;
    for (let i = 0; i < count; i += 1) {
      const total = i < landmarks.length
        ? landmarks[i]
        : Math.floor(40_000 + Math.pow(rnd(), 3.2) * 6_000_000);
      const input = Math.floor(total * (0.6 + rnd() * 0.25));
      // 白天密、深夜疏：小时按双峰偏置
      const hour = Math.min(23, Math.floor(9 + Math.abs(rnd() + rnd() - 1) * 9));
      const day = Math.floor(rnd() * windowDays);
      const start = from + day * 86400_000 + hour * 3600_000 + Math.floor(rnd() * 3600_000);
      const span = 5 + Math.floor(rnd() * 90);
      sessions.push({
        id: `sample-${String(i + 1).padStart(3, '0')}`,
        harness: pick(HARNESS),
        first_event_at: new Date(start).toISOString(),
        last_event_at: new Date(start + span * 60_000).toISOString(),
        tokens: { input, output: total - input, total },
        event_count: 18 + Math.floor(rnd() * 380),
      });
    }
    return {
      protocol: 'city:v1',
      source: 'fixture',
      data_revision: 1,
      generated_at: new Date(now).toISOString(),
      window: {
        days: windowDays,
        label: locale === 'zh-Hans' ? `最近 ${windowDays} 天` : `Last ${windowDays} days`,
        from: new Date(from).toISOString(),
        to: new Date(now).toISOString(),
      },
      sessions,
      findings: [
        { harness: 'codex', severity: 'warning', count: 2 },
        { harness: 'claude_code', severity: 'info', count: 1 },
      ],
      coverage: { total: sessions.length, returned: sessions.length, truncated: false, unknown_time: 0, findings_state: 'partial' },
      status: 'ready',
    };
  }

  let frame = null;

  function respond(message, requestId, result) {
    frame?.contentWindow?.postMessage(
      { channel: 'av-plugin-rpc', version: 1, instanceId: INSTANCE, type: 'response', requestId, result },
      location.origin,
    );
  }

  function onMessage(event) {
    if (!frame || event.source !== frame.contentWindow || event.origin !== location.origin) return;
    const message = event.data;
    if (message?.channel !== 'av-plugin-rpc' || message.version !== 1 || message.instanceId !== INSTANCE) return;
    if (message.type !== 'request') return;
    const { requestId, command, args } = message;
    if (command === 'plugin_request') {
      const request = args?.request;
      const ok = request?.method === 'data.read'
        && request?.payload?.projection === 'city'
        && [7, 30, 90, 366].includes(request.payload.windowDays);
      respond(message, requestId, ok
        ? { version: 1, requestId: request.requestId, ok: true, result: projection(request.payload.windowDays, currentLocale()), error: null }
        : { version: 1, requestId: request?.requestId ?? '', ok: false, result: null, error: { code: 'invalid_request', retryable: false } });
      return;
    }
    if (command === 'plugin_message') {
      // heartbeat / toolbar.update / command.result：礼貌 ACK，发布端超时静默
      respond(message, requestId, { version: 1, requestId: '', ok: true, result: null, error: null });
    }
  }

  function post(type, extra = {}) {
    frame?.contentWindow?.postMessage(
      { channel: 'av-plugin-rpc', version: 1, instanceId: INSTANCE, type, ...extra },
      location.origin,
    );
  }

  function mount() {
    if (frame || reduced.matches) return;
    fetch('city3d/index.html', { method: 'HEAD' }).then((res) => {
      if (!res.ok) return; // 产物未灌入：保持 canvas mock
      frame = document.createElement('iframe');
      frame.id = 'city-frame';
      frame.title = document.getElementById('city')?.querySelector('figure')?.getAttribute('aria-label') || 'Agent City';
      frame.loading = 'eager';
      frame.src = `city3d/index.html?instanceId=${INSTANCE}&locale=${encodeURIComponent(currentLocale())}`;
      frame.addEventListener('load', () => {
        // 引擎自举（纹理/地形）需要一点时间；就绪后再切换，避免白屏闪
        setTimeout(() => stage.classList.add('city-3d-ready'), 900);
      }, { once: true });
      stage.appendChild(frame);
      window.addEventListener('message', onMessage);
      // 语言切换同步给插件
      new MutationObserver(() => post('locale', { locale: currentLocale() }))
        .observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
      // 不可见即挂起（省电；插件协议的 suspend/resume 语义）
      const suspend = () => post('suspend');
      const resume = () => post('resume');
      document.addEventListener('visibilitychange', () => (document.hidden ? suspend() : resume()));
      new IntersectionObserver((entries) => entries.forEach((e) => (e.isIntersecting ? resume() : suspend())), { threshold: 0.05 }).observe(frame);
    }).catch(() => { /* 离线/产物缺失：canvas mock 兜底 */ });
  }

  // 滚进视口才探测与加载（three 产物 ~几百 KB，不占首屏）
  const trigger = () => { if (!frame) mount(); };
  // 调试钩子：遮挡/无帧环境下 IO 可能不通知，验证与排障用
  window.__avCityHost = { mount: trigger, post };
  new IntersectionObserver((entries, observer) => {
    if (entries.some((e) => e.isIntersecting)) { observer.disconnect(); trigger(); }
  }, { threshold: 0.05 }).observe(stage);
  reduced.addEventListener('change', () => { if (!reduced.matches) trigger(); });
})();
