// Default English is readable without JavaScript. Locale preference stays local.
(() => {
  const params = new URLSearchParams(location.search);
  let saved;
  try { saved = localStorage.getItem('av-landing-lang'); } catch {}
  const requested = params.get('lang');
  const lang = ['en', 'zh'].includes(requested) ? requested : saved === 'zh' ? 'zh' : 'en';
  const zh = {
    'play.heroLink': '不止看数据，走进你的世界 ↓',
    'play.flight.badge': '桌面 City', 'play.drive.badge': '桌面 City',
    'play.kicker': '不止于仪表盘', 'play.title': 'Agent 建起城市，<br><em>换你来探索。</em>',
    'play.body': '驾机俯瞰来时的路，驾车穿过会话留下的街区。这不是一座与你无关的城市：每栋数据建筑，都来自一段你的历史。',
    'play.visualLabel': '探索方式 · 概念展示', 'play.selector': '切换探索方式预览',
    'play.flight': '驾机，换个高度', 'play.flight.short': '从天际线，重新认识你的历史',
    'play.drive': '驾车，深入街巷', 'play.drive.short': '让每一次转弯，都经过自己的故事',
    'play.flight.status': '飞行 · City 前端已有入口', 'play.flight.title': '飞过一座，因你而生的城。',
    'play.flight.body': '暂时离开图表，去天上看看。自由飞行练习与穿环挑战，让探索多一点乐趣；从桌面 City 设置进入。',
    'play.drive.status': '驾车 · 桌面版已开放自由驾驶', 'play.drive.title': '复古敞篷飞车，驰骋于你的城市。',
    'play.drive.body': '驾驶一辆带喷气助推的复古敞篷飞车，沿街道探索由 Agent 会话生成的城市；按空格切换喷升与地面行驶。当前版本会检查本地出生点安全，道路仍在逐步完成全城验证。',
    'play.cta': '先去演示城市逛逛 ↗',
    'play.disclosure': '视觉为探索概念：真实 City 模拟数据画面叠加示意路线，并非游戏实录。桌面 City 已提供飞行与驾车玩法；网页演示仍只支持建筑探索和活动回放。',
    'insights.usage.label': '01 / 用量', 'insights.cost.label': '02 / 费用口径', 'insights.session.label': '03 / 会话证据',
    'skip': '跳到内容', 'brand.home': "Oh Agent 首页", 'brand.tag': "看见 Agent 的另一面",
    'nav.aria': '主导航', 'nav.city': '城市体验', 'nav.insights': '数据洞察', 'nav.privacy': '隐私', 'nav.download': "公测进度",
    'hero.kicker': "让 AGENT 的使用历史，鲜活起来。",
    'hero.line1': "Agent 在工作，", 'hero.line2': "你的世界在生长。",
    'hero.lede': "一款在 Mac 本机分析 Claude Code、Codex 使用历史的应用。把会话变成城市，回放工作节奏，看清 Token 去向。不上传会话。",
    'cta.explore': "探索演示城市 ↗", 'cta.release': "查看 Mac 公测进度 →",
    'trust.local': '本机分析', 'trust.key': '无需 API Key', 'trust.license': 'MIT 许可',
    'hero.workspace': '产品实景 · 演示工作区', 'hero.image': 'Agent City 真实产品界面，展示由演示会话生成的海滨城市',
    'hero.caption': '换一个角度，回看你的 AI 工作。', 'sample': '演示数据',
    'sources.lead': "你照常使用 Agent，故事已经在发生。", 'sources.note': "读取受支持工具已有的本地记录。可用字段因来源与版本而异。",
    'city.kicker': '01 / 走进你的数据世界', 'city.title': "让 Agent 历史，变成眼前的世界。",
    'city.body': "先逛逛演示城市，再想象你的历史会长成什么样。",
    'city.sample': "Mock 会话 · 可交互城市", 'city.range': '样例时间范围', 'city.week': '7 天', 'city.month': '30 天', 'city.quarter': '90 天', 'city.year': '366 天',
    'city.reset': '重置视角', 'city.settings': '城市设置', 'city.stop': '关闭演示', 'city.poster': 'Agent City 应用预览，画面使用演示数据',
    'city.launch.title': "欢迎来到 Agent City。", 'city.launch.body': "这座城市由 mock 会话生成。点选建筑、回放一天，亲手体验。网页不会读取你的本机记录。",
    'city.launch.button': "走进这座城市", 'city.static': '了解城市如何形成 →',
    'city.hint': "点一栋数据建筑，看看它的来历；展开时间线，回放活动。", 'city.local': "Mac 应用会从你的本地历史生成专属城市。",
    'city.loading': "正在生成演示城市…", 'city.retry': '重试城市演示',
    'city.error': '暂时无法启动三维演示。你仍可查看产品实景与下方的城市说明。',
    'city.timeout': '三维演示启动时间较长。可以重试，或先查看下方的产品说明。',
    'city.updating': '正在更新样例时间范围…',
    'how.kicker': "01 / 每栋楼，都有来历", 'how.title': "原来，我的 Agent<br>留下了这些故事。",
    'how.body': "每次会话、每段活动都有迹可循。Oh Agent 把这些记录组织成一个可以慢慢探索的世界。",
    'how.image': '点选演示建筑后，查看会话来源、Token、时间和事件数量的真实产品界面',
    'how.caption': '真实产品界面 · 演示工作区',
    'how.session': "每次会话，都有自己的位置。", 'how.session.body': "点选一栋数据建筑，看看是哪个 Agent、什么时候留下的活动，用了多少 Token。",
    'how.scale': "熟悉的 Agent，成为熟悉的街区。", 'how.scale.body': "不同工具组成城区，Token 规模影响楼高。属于你的数据与装饰风景分开展示。",
    'how.time': "回放一次，认出自己的节奏。", 'how.time.body': "沿时间线回看已载入的活动，发现哪些时候最忙，哪些 Agent 经常一起出现。",
    'how.note': '楼高体现 Token 规模，不评价生产力。施工与生长是视觉隐喻，不代表任务完成度。应用会说明已载入的数据覆盖范围。',
    'insights.kicker': "02 / 好奇心，再往前一步", 'insights.title': "逛过城市，<br>也看懂你的使用习惯。",
    'insights.body': "城市让历史变得好逛，分析视图让记录更容易理解。用量、费用依据和会话线索，都能继续查看。",
    'insights.usage': "哪个 Agent，你用得最多？", 'insights.usage.body': '按来源和时间查看 Token 用量，再深入了解忙碌那一天的会话。',
    'insights.chart': '使用模拟数据绘制的 Token 趋势示意图', 'insights.example': '概念示意 · 模拟数据',
    'insights.cost': "你的钱，花在了哪里？", 'insights.cost.body': '订阅费、按量估算与有依据支出分别呈现。缺失价格，明确保留为未知。',
    'cost.subscription': '订阅月费', 'cost.estimate': 'API 等价名义估算', 'cost.actual': '真实 API 账单', 'cost.unknown': '未知',
    'cost.note': '示例金额。估算不是账单，也不代表已省下的钱。费用位于独立分析视图，尚未显示在城市中。',
    'insights.session': "哪段会话，值得再看一眼？", 'insights.session.body': '探索可用轨迹，以及连续工具失败等受支持信号。结合上下文核对证据。',
    'insights.trace.note': '事件序列为示意。重试是检查线索，不足以证明工作被浪费。',
    'privacy.kicker': "03 / 属于你的，也由你掌握", 'privacy.title': "工作有隐私。<br><em>你的世界，留在本机。</em>",
    'privacy.body': "会话里有你的想法、工作和上下文。Oh Agent 在 Mac 上分析受支持的本地记录，不把会话交给云端处理。",
    'privacy.license': '代码采用 MIT 许可。<br>本机分析，计算有据可查。', 'privacy.boundary': '全部在你的 MAC 内',
    'privacy.records': '本地会话记录', 'privacy.records.body': '来自受支持的 Agent 工具',
    'privacy.analysis': '本机分析', 'privacy.analysis.body': '活动、用量与可用证据',
    'privacy.world': '你的城市与数据洞察', 'privacy.world.body': '在自己的设备上探索',
    'privacy.network': '公开价卡更新、版本检查和你明确选择的官方资源下载可能联网。这些请求不携带会话数据。',
    'faq.kicker': '出发之前', 'faq.title': '你可能还想<br>了解这些。',
    'faq.1.q': '样例城市使用了我的数据吗？', 'faq.1.a': '没有。本网站只使用合成的示例会话，不会读取本机 Agent 记录。你的专属城市由安装后的 macOS 应用，基于受支持的本地记录生成。',
    'faq.2.q': '支持哪些 Agent 和电脑？', 'faq.2.a': '桌面应用面向 Apple Silicon Mac。数据来源包括 Claude Code、Codex、DeepSeek Harness 和 WorkBuddy；用量、轨迹与费用证据的覆盖因来源与版本而异。目前不声明支持 Intel、Windows 或 Linux 桌面版。安装前请核对发行说明。',
    'faq.3.q': '城市里的一栋楼代表什么？', 'faq.3.a': '数据建筑对应已载入的会话，楼高体现 Token 规模，来源组成城区。装饰建筑构成风景。建筑生长是视觉隐喻，不衡量任务完成度或产出质量。',
    'faq.4.q': '能看到完整的使用历史吗？', 'faq.4.a': '当前城市视图载入所选时间范围内最多 500 条近期会话，并说明覆盖情况。可用历史取决于 Agent 工具保留了哪些记录。缺失记录不会用虚构活动补齐。',
    'faq.5.q': '第一次打开没有数据怎么办？', 'faq.5.a': '先使用受支持的 Agent，产生本地记录。然后在桌面应用中检查来源状态、读取权限和同步情况。无记录、无权限和读取失败需要分别处理；你也可以先探索网站中的样例城市。',
    'faq.6.q': '费用就是实际扣款或省下的钱吗？', 'faq.6.a': '按量金额可能是估算，不是扣款。订阅费与有依据支出各自标明口径，不跨币种直接相加。订阅费与 API 等价估算的比较，不能证明已经省钱。城市本身目前尚未接入费用数据。',
    'faq.7.q': '需要 API Key 或账号吗？', 'faq.7.a': '本机分析无需 API Key 或云端账号。应用读取受支持工具已经保留在 Mac 上的记录；macOS 可能要求你允许读取相关位置。',
    'faq.8.q': '在哪里下载和查看源码？', 'faq.8.before': '项目代码采用 MIT 许可。公开源码仓库位于 ', 'faq.8.after': '。桌面安装包尚未发布；完成发布验证后会在此提供下载链接。',
    'download.kicker': "OH，原来我的 AGENT 做了这些。", 'download.title': "换个角度，<br><em>重新认识你的 Agent。</em>",
    'download.body': "你做过的工作里，藏着一个世界。用 Oh Agent，从一段会话开始，慢慢把它看清。",
    'download.step1': '在 Mac 上安装', 'download.step2': '读取受支持的本地记录', 'download.step3': '探索你的专属城市',
    'download.status': '公开下载正在准备中。', 'download.note': '现在就能体验完整的模拟城市，无需账号或 API Key。Mac 应用尚未在此开放下载；安装信息和公开访问核实后，再提供下载与源码链接。',
    'download.explore': "先去演示城市逛逛 ↗", 'download.requirements': 'macOS · 面向 Apple Silicon · 需要受支持 Agent 的本地记录。最终系统要求与安装说明随发行版提供。',
    'footer.tag': "Agent 留下历史，你发现故事。",
  };
  const dynamicEn = {
    'city.loading': 'Preparing the sample city…', 'city.retry': 'Retry city demo',
    'city.error': 'The 3D sample could not start. You can still explore the product previews and the explanation below.',
    'city.timeout': 'The 3D sample is taking a while to start. Retry, or explore the product explanation below.',
    'city.updating': 'Updating the sample time range…',
  };
  const en = { ...dynamicEn };
  for (const [attribute, property] of [['data-i18n', 'innerHTML'], ['data-i18n-aria', 'aria-label'], ['data-i18n-alt', 'alt']]) {
    document.querySelectorAll(`[${attribute}]`).forEach((el) => {
      const key = el.getAttribute(attribute);
      en[key] = property === 'innerHTML' ? el.innerHTML : el.getAttribute(property);
      if (lang === 'zh' && zh[key] !== undefined) {
        if (property === 'innerHTML') el.innerHTML = zh[key];
        else el.setAttribute(property, zh[key]);
      }
    });
  }
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  document.documentElement.dataset.avLang = lang;
  document.querySelectorAll('[data-lang-switch]').forEach((link) => {
    const next = lang === 'zh' ? 'en' : 'zh';
    link.href = `${location.pathname}?lang=${next}${location.hash}`;
    link.textContent = next === 'zh' ? '中文' : 'EN';
    link.lang = next;
  });
  if (lang === 'zh') {
    document.title = 'Oh Agent — 让 Agent 历史鲜活起来';
    const title = 'Oh Agent — Agent 在工作，你的世界在生长。';
    const description = '用 Oh Agent，把桌面 Agent 的历史变成可探索、可回放的城市。看懂使用记录，工作数据留在你的 Mac。';
    for (const selector of ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]']) document.querySelector(selector)?.setAttribute('content', description);
    for (const selector of ['meta[property="og:title"]', 'meta[name="twitter:title"]']) document.querySelector(selector)?.setAttribute('content', title);
  }
  try { if (['en', 'zh'].includes(requested)) localStorage.setItem('av-landing-lang', lang); } catch {}
  window.__avLandingLang = { lang, t: (key) => (lang === 'zh' ? zh[key] : en[key]) ?? en[key] ?? key };
})();
