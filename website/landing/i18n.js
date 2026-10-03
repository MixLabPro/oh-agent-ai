// 落地页双语：默认英文，?lang=zh 或已保存偏好切中文。零追踪——语言偏好存
// localStorage（浏览器本地，不上传），无 Cookie、无分析。
// 静态降级：即使禁用 JS，页面仍显示默认英文全文（data-i18n 是替换而非渲染源）。
(() => {
  const params = new URLSearchParams(window.location.search);
  const stored = (() => { try { return window.localStorage.getItem("av-landing-lang"); } catch { return null; } })();
  const lang = params.get("lang") === "zh" || params.get("lang") === "en" ? params.get("lang") : (stored === "zh" || stored === "en" ? stored : "en");

  const M = {
    en: {
      "skip": "Skip to content",
      "brand.tag": "Agent Monitoring",
      "nav.demo": "Demo", "nav.how": "How it works", "nav.privacy": "Local privacy", "nav.faq": "FAQ",
      "nav.download": "Get for macOS",
      "kicker": "A checkup for your AI tools · macOS beta",
      "hero.l1": "Is your AI actually working,", "hero.l2": "or just burning money?",
      "hero.lede": "Audit your AI tools' session logs offline. Find where they got stuck and what it cost — nothing leaves your Mac.",
      "cta.download": "Get the macOS beta", "cta.demo": "See the demo",
      "assure.1": "Sessions analyzed on-device only", "assure.2": "MIT open source", "assure.3": "No API key required",
      "scope.aria": "Concept animation: a woodpecker inspects a session log line by line, flagging failed calls. Sample data.",
      "motion.pause": "Pause motion", "motion.resume": "Resume motion",
      "scope.scanned": "Scanned", "scope.lines": "lines", "scope.flagged": "flagged failures", "scope.sample": "Sample data",
      "harnesses.lede": "Reads the local records you already have — no workflow change",
      "harnesses.fine": "Coverage depends on source and version; not every tool provides complete cost and trace evidence.",
      "demo.eyebrow": "Demo",
      "demo.title": "See usage at a glance, <br>reach evidence in one step.",
      "demo.sub": "Interactive concept demo — all numbers are simulated, not real screenshots.",
      "demo.local": "On-device only",
      "demo.pages": "Demo pages", "demo.workspace": "My workspace",
      "demo.nav.overview": "Overview", "demo.nav.usage": "Usage", "demo.nav.sessions": "Sessions", "demo.nav.sources": "Sources",
      "demo.foot": "Local data · synced",
      "demo.head.eyebrow": "Local agent work records",
      "demo.head.title": "Who worked, what it cost, where it got stuck",
      "demo.range": "Demo time range", "demo.week": "This week", "demo.month": "This month",
      "demo.tokens": "Tokens observed", "demo.cost": "Estimated cost", "demo.cost.note": "An estimate, not a bill",
      "demo.cache": "Cache hit rate", "demo.cache.note": "Cache reads / input tokens",
      "demo.trend": "Usage trend", "demo.legend.flag": "consecutive failures",
      "demo.chart.aria": "Simulated usage trend",
      "demo.insight.title": "Start with the sessions that keep failing",
      "demo.insight.note": "Sample session used 18.6M tokens; the same call failed 3 times in a row.",
      "demo.inspect": "View trace →",
      "how.eyebrow": "From delivered results to a checkable process",
      "how.title": "Logs tell you what happened.<br>Agent Vitals tells you where to look.",
      "how.sub": "Research, docs, spreadsheets, code — all can go to an agent. But the process, cost, and failures should not stay in a black box.",
      "how.1.no": "01 · Record", "how.1.title": "Turn every run into a work record.",
      "how.1.body": "Browse events and traces your agents left, by date, source, and session. Fields a source never recorded are marked unavailable — never invented.",
      "how.1.ledger": "Work record", "how.1.ledger.sub": "sessions · events · traces",
      "how.2.no": "02 · Cost", "how.2.title": "Know what it cost — and how solid the number is.",
      "how.2.body": "Subscription, metered estimate, and evidenced spend sit in separate columns and are never summed. Missing price or attribution stays“unknown”— guesses never pose as bills.",
      "how.2.metered": "Pay-per-use estimate", "how.2.sub": "Subscription", "how.2.unpriced": "Unpriced usage", "how.2.unknown": "Unknown", "how.2.tag.est": "estimate", "how.2.tag.fixed": "fixed", "how.2.tag.warn": "not counted as 0",
      "how.3.no": "03 · Check", "how.3.title": "Look at failures, repeats, and outlier sessions first.",
      "how.3.body": "It points out ranges worth checking, then walks you back to the session trace to verify evidence. Clues, not verdicts — it never judges whether the work was right.",
      "how.3.fail": "Consecutive failures", "how.3.infl": "Input inflation", "how.3.miss": "Cache misses", "how.3.times": "times",
      "privacy.eyebrow": "Your computer is the data boundary",
      "privacy.title": "See your agents clearly,<br>without surrendering sessions.",
      "privacy.body": "Session logs never need to leave for a third-party cloud. Agent Vitals reads and analyzes supported local records directly on your Mac; code, prompts, and work context stay where they are.",
      "privacy.link": "Read the source on GitHub ↗",
      "privacy.flow.aria": "Data flow: local session logs, analyzed on-device, become your work ledger — entirely on your Mac",
      "privacy.flow.1": "Session logs", "privacy.flow.1s": "stay in the source",
      "privacy.flow.2": "Local analysis", "privacy.flow.2s": "usage · cost · traces",
      "privacy.flow.3": "Work ledger", "privacy.flow.3s": "you review and verify",
      "privacy.p1": "Sessions analyzed entirely on-device", "privacy.p1b": "Session logs, code, prompts, or usage records are never uploaded.",
      "privacy.p2": "MIT open source, inspectable", "privacy.p2b": "What is read and how it is computed — all in the code.",
      "privacy.p3": "Unknowns are stated, not hidden", "privacy.p3b": "Unknown ≠ zero; estimates never pose as real bills.",
      "privacy.fine": "Session analysis needs no network. Public price-catalog updates and version checks may use the network but carry no session data.",
      "faq.eyebrow": "Before you download",
      "faq.title": "Straight answers.", "faq.sub": "Less guessing, more certainty.",
      "faq.1.q": "Do I need an API key or to upload logs?", "faq.1.a": "No API key, no uploads. The desktop app reads usage records your supported tools already keep locally; if the system restricts access you may need to grant read permission.",
      "faq.2.q": "Which computers and agents are supported?", "faq.2.a": "A macOS beta is available. Runtime sessions and usage focus on Claude Code, Codex, DeepSeek Harness, and WorkBuddy; statistics, cost, and trace coverage differs by harness, version, and field. OpenClaw and Hermes currently get install- and skill-level checks only — not the same runtime coverage.",
      "faq.3.q": "What if the first launch shows no data?", "faq.3.a": "Confirm your supported agents have local usage records, then check data-source status and read permissions in the app. No logs, no permission, and not-yet-synced are different states — none is ever filled with made-up data.",
      "faq.4.q": "Is the displayed amount what I actually pay?", "faq.4.a": "Not necessarily. Metered estimates come from available usage and pricing and are not charges. Subscription, estimate, and evidenced known spend are separate; missing price, route, or bill data stays unknown.",
      "faq.5.q": "Will it actually save me money?", "faq.5.a": "Agent Vitals shows you usage and cost, and pinpoints high-spend or repeatedly failing sessions so you can act. Whether that saves money depends on your billing and what you change. On a fixed subscription, fewer tokens don't always mean a smaller bill; we promise no automatic savings or fixed ratios.",
      "faq.6.q": "Can it tell whether the agent did the job right?", "faq.6.a": "No. It records the usage, events, failures, and trace evidence your sources leave, and helps you find sessions worth checking. It never treats“low spend”as“correct output”, and it does not accept deliverables for you.",
      "faq.7.q": "Is it open source?", "faq.7.a": "Yes, MIT licensed. Browse the code, license, and releases on GitHub, and file issues. Numbers on this page are demo data — not user statistics or savings claims.",
      "dl.eyebrow": "Every agent run leaves a receipt",
      "dl.title": "Your agent has logs.<br>Now give it vitals.",
      "dl.1": "Install the app", "dl.2": "Check local data sources", "dl.3": "Read your first usage and session report",
      "dl.cta": "Download the macOS beta ↗",
      "dl.fine": "Requires local records from a supported agent. The package is Developer ID–signed; the beta is un-notarized — right-click → Open on first launch. System requirements and install notes are on the GitHub release page.",
      "dl.receipt.aria": "Concept animation: an agent work receipt printing line by line. Sample data.",
      "footer.tag": "Offline single-machine analysis · sessions never leave your Mac",
      "footer.feedback": "Feedback ↗",
      "dialog.sample": "Interactive demo · sample data", "dialog.close": "Close sample",
      "dialog.title": "Why is this session worth checking?",
      "dialog.lede": "Fictional research task: the same tool call fails three times in a row, then recovers. Click a node to check the record; retries are not automatically waste.",
      "dialog.trace": "Sample session event trace",
      "dialog.cache": "Cache reads", "dialog.input": "Uncached input", "dialog.output": "Output",
      "dialog.note.title": "High consumption doesn't always mean a high bill.",
      "dialog.note.body": "Caching and billing shape the amount. Read the composition and pricing basis first; this demo never computes“amounts saved”.",
      "dialog.done": "Got it",
    },
    zh: {
      "skip": "跳到内容",
      "brand.tag": "智能体监测",
      "nav.demo": "产品演示", "nav.how": "工作方式", "nav.privacy": "本地隐私", "nav.faq": "常见问题",
      "nav.download": "获取 macOS 版",
      "kicker": "给你的 AI 工具做个体检 · macOS 测试版",
      "hero.l1": "你的 AI，是真的在干活，", "hero.l2": "还是在白白烧钱？",
      "hero.lede": "离线审计 AI 工具的会话日志，找出它卡在哪、花了多少钱——数据不出你的 Mac。",
      "cta.download": "获取 macOS 测试版", "cta.demo": "看产品演示",
      "assure.1": "Sessions 仅在本机分析", "assure.2": "MIT 开源", "assure.3": "无需 API Key",
      "scope.aria": "概念动画：啄木鸟沿着会话日志逐行检查，把失败的调用标记出来。示例数据。",
      "motion.pause": "暂停动效",
      "scope.scanned": "已扫描", "scope.lines": "行", "scope.flagged": "已标记", "scope.sample": "示例数据",
      "harnesses.lede": "读取已有的本地记录，不改变你的工作方式",
      "harnesses.fine": "覆盖以来源和版本为准，并非所有工具都提供完整的成本与轨迹证据。",
      "demo.eyebrow": "产品演示",
      "demo.title": "一眼看到用量，<br>一步回到证据。",
      "demo.sub": "可交互的概念演示，数字全部为模拟数据，不是真实界面截图。",
      "demo.local": "仅在本机",
      "demo.workspace": "我的工作空间",
      "demo.nav.overview": "总览", "demo.nav.usage": "用量", "demo.nav.sessions": "会话", "demo.nav.sources": "来源",
      "demo.foot": "本地数据 · 已同步",
      "demo.head.eyebrow": "本地 Agent 工作记录",
      "demo.head.title": "谁在工作，花了多少，哪里卡住",
      "demo.week": "本周", "demo.month": "本月",
      "demo.tokens": "已观测 Token", "demo.cost": "按量成本估算", "demo.cost.note": "估算金额，非实际账单",
      "demo.cache": "缓存命中率", "demo.cache.note": "缓存读取 / 输入 Token",
      "demo.trend": "用量趋势", "demo.legend.flag": "有连续失败",
      "demo.insight.title": "从反复失败的会话开始检查",
      "demo.inspect": "查看轨迹 →",
      "how.eyebrow": "从交付结果，到可核对的过程",
      "how.title": "日志告诉你发生了什么。<br>Agent Vitals 告诉你该看哪里。",
      "how.sub": "研究、文档、表格、代码都可以交给 Agent。但过程、成本与失败，不该留在黑箱里。",
      "how.1.no": "01 · 留痕", "how.1.title": "把每次运行，变成一份工作记录。",
      "how.1.body": "按日期、来源和会话查看 Agent 留下的事件与轨迹。来源没有记录的字段，明确标为不可用。",
      "how.1.ledger": "工作记录", "how.1.ledger.sub": "会话 · 事件 · 轨迹",
      "how.2.no": "02 · 对账", "how.2.title": "知道花了多少，也知道数字准不准。",
      "how.2.body": "订阅、按量估算与有依据的支出分栏显示，从不相加。缺价格或缺归属时保留「未知」，不把猜测当账单。",
      "how.2.metered": "按量估算", "how.2.sub": "订阅月费", "how.2.unpriced": "无价卡用量", "how.2.unknown": "未知", "how.2.tag.est": "估算", "how.2.tag.fixed": "固定", "how.2.tag.warn": "不计为 0",
      "how.3.no": "03 · 检查", "how.3.title": "先看失败、重复与异常会话。",
      "how.3.body": "指出值得检查的区间，再带你回到会话轨迹核对证据。它提供线索，不替你判断成果对不对。",
      "how.3.fail": "连续失败", "how.3.infl": "输入膨胀", "how.3.miss": "缓存未命中",
      "privacy.eyebrow": "你的电脑，就是数据的边界",
      "privacy.title": "看清 Agent，<br>不交出 Sessions。",
      "privacy.body": "Session 日志不必复制到第三方云端。Agent Vitals 直接在你的 Mac 上读取和分析受支持的本地记录，代码、提示词与工作上下文都留在原地。",
      "privacy.link": "在 GitHub 查看源码 ↗",
      "privacy.flow.1": "会话日志", "privacy.flow.1s": "留在来源中",
      "privacy.flow.2": "本地分析", "privacy.flow.2s": "用量 · 成本 · 轨迹",
      "privacy.flow.3": "工作账本", "privacy.flow.3s": "由你查看核对",
      "privacy.p1": "Sessions 全程本机分析", "privacy.p1b": "不上传 Session 日志、代码、提示词或使用记录。",
      "privacy.p2": "MIT 开源，实现可检查", "privacy.p2b": "读取什么、怎样计算，都有代码可循。",
      "privacy.p3": "不知道的，明确告诉你", "privacy.p3b": "未知不等于零，估算不冒充真实账单。",
      "privacy.fine": "会话分析无需联网。公共价卡更新与版本检查可能访问网络，但不携带任何 Session 数据。",
      "faq.eyebrow": "下载前，你可能想知道",
      "faq.title": "把疑问说清楚。", "faq.sub": "少一点猜测，多一点确定。",
      "faq.1.q": "需要提供 API Key 或上传日志吗？", "faq.1.a": "不需要提供 API Key，也不需要上传日志。桌面应用在本机读取受支持工具已有的使用记录；遇到系统权限限制时，可能需要你授权读取对应位置。",
      "faq.2.q": "支持哪些电脑和 Agent？", "faq.2.a": "当前提供 macOS 测试版。运行时会话与用量重点覆盖 Claude Code、Codex、DeepSeek Harness 和 WorkBuddy；不同执行环境、版本与字段的统计、成本和轨迹能力并不完全相同。OpenClaw、Hermes 当前主要是安装与 Skill 层检查，不属于同等的运行时覆盖。",
      "faq.3.q": "第一次打开没有数据怎么办？", "faq.3.a": "请先确认受支持的 Agent 已有本地使用记录，再检查应用中的数据源状态和读取权限。没有日志、没有权限和暂未同步是不同状态，不会用虚构数据代替你的结果。",
      "faq.4.q": "显示的金额就是我实际付的钱吗？", "faq.4.a": "不一定。按量估算来自可用的用量和价格信息，不能直接视为扣款。订阅、估算与有依据的已知支出需要分别理解；价格、路由或账单缺失时会保留未知状态。",
      "faq.5.q": "它真的能帮我省钱吗？", "faq.5.a": "Agent Vitals 帮你看清用量与成本、定位高消耗或反复失败的会话，为调整提供依据。实际能否省钱取决于你的计费方式与后续行动。固定订阅下，减少 Token 不一定减少账单；我们不承诺自动省钱或固定节省比例。",
      "faq.6.q": "它能判断 Agent 把工作做对了吗？", "faq.6.a": "不能。Agent Vitals 记录受支持来源留下的用量、事件、失败和轨迹证据，帮助你定位值得检查的会话；它不会把「消耗低」当成「结果正确」，也不会替你验收最终交付。",
      "faq.7.q": "软件是否开源？", "faq.7.a": "是的，源代码采用 MIT 许可证。你可以在 GitHub 查看代码、许可证和发行说明，也可以提交问题与反馈。网页中的数字为演示数据，不是用户统计或节省承诺。",
      "dl.eyebrow": "每一次 Agent 工作，都留一张收据",
      "dl.title": "你的 Agent 有日志了。<br>现在，给它一份体检。",
      "dl.1": "安装应用", "dl.2": "检查本地数据源", "dl.3": "查看第一份用量与会话记录",
      "dl.cta": "前往下载 macOS 测试版 ↗",
      "dl.fine": "需要受支持 Agent 的本地记录。安装包已 Developer ID 签名；测试版未经公证，首次打开请右键 → 打开。系统要求与安装说明见 GitHub 发布页。",
      "footer.tag": "单机离线分析 · Sessions 不上传云端",
      "footer.feedback": "反馈 ↗",
      "demo.insight.note": "示例会话消耗 18.6M Token，同一调用连续失败 3 次。",
      "dl.receipt.aria": "概念动画：一张 Agent 工作收据逐行打印出来。示例数据。",
      "privacy.flow.aria": "数据流向：本机会话日志，经本地分析，形成你的工作账本，全程在你的 Mac 上",
      "dialog.sample": "交互示意 · 示例数据", "dialog.close": "关闭示例", "dialog.trace": "示例会话事件轨迹",
      "dialog.title": "这次会话，为什么值得检查？",
      "dialog.lede": "虚构研究任务：同一工具调用连续失败三次，随后恢复。点击节点核对记录；重试不一定代表浪费。",
      "dialog.cache": "缓存读取", "dialog.input": "未缓存输入", "dialog.output": "输出",
      "dialog.note.title": "消耗高，未必意味着费用高。",
      "dialog.note.body": "缓存和计费方式会影响金额。先看组成与价格依据，再判断是否需要调整；这里不计算「已节省金额」。",
      "dialog.done": "明白了",
    },
  };

  const dict = () => M[lang] || M.en;

  function apply() {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const value = dict()[el.getAttribute("data-i18n")];
      if (value != null) el.innerHTML = value;
    });
    document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
      const value = dict()[el.getAttribute("data-i18n-aria")];
      if (value != null) el.setAttribute("aria-label", value);
    });
    // 语言切换链接（默认英文面上唯一的「中文」入口；切换后由对方语言回切）
    document.querySelectorAll("[data-lang-switch]").forEach((a) => {
      a.href = `${window.location.pathname}?lang=${a.getAttribute("data-lang-switch")}`;
      if (a.getAttribute("data-lang-switch") === lang) a.style.display = "none";
      else a.style.display = "";
    });
    // 动效开关按钮文案
    const motion = document.getElementById("motion-toggle");
    if (motion) motion.textContent = motion.getAttribute("aria-pressed") === "true" ? dict()["motion.resume"] : dict()["motion.pause"];
  }

  // 首选语言持久化（URL 参数 > localStorage（仅用户显式切换过）> 默认英文）
  try { if (params.get("lang") === "en" || params.get("lang") === "zh") window.localStorage.setItem("av-landing-lang", lang); } catch {}

  // 供 app.js 等后续脚本使用的轻量 API
  window.__avLandingLang = {
    t: (key) => dict()[key] ?? "",
    lang,
    demoSessions: (n, tools) => (lang === "zh" ? `${n} 个会话 · ${tools} 个工具` : `${n} sessions · ${tools} tools`),
    chartAria: (label) => (lang === "zh"
      ? `${label}示例用量趋势，柱状图中亮绿色为 Claude Code、深绿色为 Codex，琥珀色标记有连续失败的一天`
      : `Simulated usage trend for ${label === "This month" || label === "本月" ? (lang === "zh" ? "本月" : "the month") : (lang === "zh" ? "本周" : "the week")}: bright green = Claude Code, dark green = Codex, amber marks a day with consecutive failures`),
  };

  apply();
  document.documentElement.setAttribute("data-av-lang", lang);
})();
