// Sidebar draft. Slugs are relative to the content root; Starlight adds /docs (base) and /zh for the zh locale.
export const sidebar = [
  {
    label: 'Get started',
    translations: { 'zh-CN': '开始' },
    items: [
      { label: 'Overview', translations: { 'zh-CN': '概览' }, slug: '' }, // Homepage (index.md)
      { label: 'Install', translations: { 'zh-CN': '安装' }, slug: 'install' },
    ],
  },
  {
    label: 'Agent City',
    translations: { 'zh-CN': 'Agent City' },
    items: [
      { label: 'What each building means', translations: { 'zh-CN': '每栋楼代表什么' }, slug: 'city-guide' },
    ],
  },
  {
    label: 'Data sources',
    translations: { 'zh-CN': '数据来源' },
    items: [
      { label: 'Claude Code', slug: 'data-sources/claude-code' },
      { label: 'Codex', slug: 'data-sources/codex' },
      { label: 'DeepSeek Harness (DSH)', slug: 'data-sources/deepseek-harness' },
      { label: 'WorkBuddy', slug: 'data-sources/workbuddy' },
    ],
  },
  {
    label: 'Agent Vitals engine',
    translations: { 'zh-CN': 'Agent Vitals 引擎' },
    items: [
      { label: 'Engine overview', translations: { 'zh-CN': '引擎总览' }, slug: 'vitals/overview' },
      { label: 'CLI', translations: { 'zh-CN': '命令行' }, slug: 'vitals/cli' },
      { label: 'Data MCP tools', translations: { 'zh-CN': 'Data MCP 工具' }, slug: 'vitals/mcp-tools' },
      { label: 'App SDK', slug: 'vitals/app-sdk' },
      { label: 'Python twin', translations: { 'zh-CN': 'Python 对等实现' }, slug: 'vitals/python' },
    ],
  },
  {
    label: 'Architecture',
    translations: { 'zh-CN': '架构' },
    items: [
      { label: 'Overview', translations: { 'zh-CN': '架构总览' }, slug: 'architecture/overview' },
      { label: 'Data pipeline', translations: { 'zh-CN': '数据管线' }, slug: 'architecture/data-pipeline' },
      { label: 'City model', translations: { 'zh-CN': '城市模型' }, slug: 'architecture/city-model' },
    ],
  },
  {
    label: 'Integrations',
    translations: { 'zh-CN': '集成' },
    items: [
      { label: 'Integrations overview', translations: { 'zh-CN': '集成总览' }, slug: 'integrations' },
      { label: 'Extra folders & manifests', translations: { 'zh-CN': '其他目录与 manifest' }, slug: 'integrations/custom-sources-and-manifests' },
      { label: 'Skill auditor', translations: { 'zh-CN': 'Skill 体检' }, slug: 'integrations/skill-auditor' },
    ],
  },
  {
    label: 'Contributing',
    translations: { 'zh-CN': '参与贡献' },
    items: [
      { label: 'Add a data source', translations: { 'zh-CN': '添加数据源' }, slug: 'contributing/adding-a-data-source' },
    ],
  },
  {
    label: 'Privacy',
    translations: { 'zh-CN': '隐私' },
    items: [
      { label: 'Data & privacy', translations: { 'zh-CN': '数据与隐私' }, slug: 'privacy-and-data' },
    ],
  },
  {
    label: 'More',
    translations: { 'zh-CN': '更多' },
    items: [
      // External links to landing pages (P0 in the sitemap plan; currently 404 until built).
      { label: 'FAQ', translations: { 'zh-CN': '常见问题' }, link: 'https://ohagent.ai/faq', attrs: { target: '_self' } },
      { label: 'GitHub', link: 'https://github.com/MixLabPro/oh-agent-ai' },
    ],
  },
];
