# Workbench React 迁移盘点

状态：Phase 0 基线（2026-09-21）

本文记录旧 Workbench 的可见入口、IPC 边界和 React 迁移状态。它是迁移清单，不改变旧页面的生产行为；在 Phase 4 之前，`apps/desktop/src-tauri/ui/` 仍是生产回退面。

## 页面归属

| 旧 tab | 旧入口 | React 目标 | 当前状态 | 下一步 |
|---|---|---|---|---|
| 总览 | `tab-overview` | `features/overview/OverviewPage.tsx` | 已迁移总览聚合切片：安全 DTO、费用/预算/新鲜度/宿主覆盖、月度/今日 summary、tokens_by_host、按 basis 支出、最近观测日；仍需真实 Tauri/旧页截图对照 | Phase 3：完成旧页数字对照与真实 `.app` 验收 |
| 用量 | `tab-calendar` | `features/usage/UsagePage.tsx` | 已迁移首个日历切片：安全月份/日历/小时 DTO、按币种成本、来源新鲜度与覆盖状态；完整旧页对照仍待完成 | Phase 3：补齐旧页数字对照与统计时区设置联动 |
| 会话 | `tab-sessions` | `features/sessions/SessionsPage.tsx` + `features/sessions/SessionDetail.tsx` | 已迁移安全列表和只读详情：筛选、keyset 分页、摘要、计费桶、usage/workflow 脱敏时间线；完整轨迹图和原始报告仍不迁移 | Phase 3：真实 Tauri 对拍与轨迹图安全投影评估 |
| 待处理/发现 | `tab-findings` | `features/findings/FindingsPage.tsx` | 已迁移首个垂直切片：安全 Finding 投影、待办、证据明细、决策矩阵和新鲜度 | Phase 2：补事件 smoke test 与旧页数值对照 |
| 测试 | `tab-test` | `features/test/TestPage.tsx` | 已迁移只读路线质量面：宿主 × 实际模型族、非官方族/API 错误/无基准状态与安全 DTO；刷新失败保留旧报告并显示原始报告窗口；主动 probe mutation 仍保留旧页 | Phase 3 后半：补真实 Tauri 对拍，再评估显式 mutation |
| Skill | `tab-skills` | `features/skills/SkillsPage.tsx` | 已迁移首个安全扫描切片：用户触发扫描、宿主筛选、取消、预算摘要、启发式命中与未评估项；快照/对比/脱敏导出及扫描高级设置仍保留旧页 | Phase 3 后半：真实 CLI 对拍并单独审查快照/导出脱敏 |
| 设置 | `tab-sources` | `features/settings/SettingsPage.tsx` | 已迁移数据源健康、安全同步控制、其他本机位置、预算估算表单、计费只读面、计费候选“不是我的/重新打开”可逆处置、计费声明的影响预览→确认保存（官方 API/中转第三方/组织承担）与重算入队回执、失败/取消任务的安全重试回执、统计与数据、关于与诊断：动态来源列表、失败原因映射、同步回执轮询、路径显式展开、预算状态/80%固定阈值/本周期静默、待确认分组/声明/重算/已有账单、时区/保留期保存、价格目录只读、月度摘要 CSV、版本表/脱敏诊断包/手动更新检查、Claude Pro 额度窗口提醒（只读配置/保存回执/通知权限状态）；停止/恢复读取与删除已导入投影均迁移，能力由后端统一 `supported_hosts` 注册表门控，注册表包含内置宿主和校验通过的热插拔插件，删除回执包含 facts/sessions/source_files/Trust/路由/任务摘录并广播跨页失效事件；MCP 删除复用同一宿主租约和回执；停用预算、订阅金额/撤销声明、自动更新仍保留旧页 | Phase 3：剩余高风险写控制与真实 Tauri 对拍 |

## Phase 2 Trust / Findings 边界

| 能力 | Rust/Tauri command | React bridge | 状态 |
|---|---|---|---|
| 宿主覆盖发现 | `trust_discover` | `discoverTrust()` | 已有；只接收宿主标签、检测状态和覆盖状态 |
| 历史本地审计 | `trust_audit` | `auditTrust(host)` | 已有；原始路径/内容不进入 renderer |
| 运行时一次快照 | `trust_runtime_snapshot` | `runTrustRuntimeSnapshot()` | 已接入；Rust 只返回能力与有界计数 |
| 监控配置 | `trust_monitor_config` / `save_trust_monitor_config` | `readTrustMonitorConfig()` / `saveTrustMonitorConfig()` | 已接入；不可观察时 fail-closed |
| Finding 聚合 | `findings_groups_safe` | `readFindings()` | 已有 versioned safe DTO |
| 决策矩阵 | `decision_matrix_safe` | `readDecisionMatrix()` | 已有 versioned safe DTO |
| 事件刷新 | `sync-status-updated` / `usage-fold-updated` / `trust-monitor-updated` | Findings/Trust 挂载期间注册并在卸载时清理；payload 只作失效信号 | 已完成首轮 feature invalidation |

## 安全与可见性约束

- React 组件不得直接调用 `window.__TAURI__`；所有 command 只能经 `react/src/lib/tauri.ts`。
- Trust evidence 只允许安全引用（`tr_...`）、类别、等级、来源、时间、范围和聚合计数；路径、文件内容、JWT、上传凭证、原始网络请求、canary 和 native session id 不得进入 React state。
- `trust_runtime_snapshot` 的 capability 是覆盖状态，不是风险结论；`unavailable` 必须在 UI 中显示为不可观察，不能显示为“安全”。
- 旧页与 React 页并存期间只维护一个数据真相：Rust/runtime/authority；不得在 React mock 中复制真实 SQLite 或宿主日志。

## 迁移退出检查

- [x] Phase 0 页面、command、事件和目标归属已列出。
- [x] Phase 1 React shell、hash route、bridge、Error Boundary、离线 mock 已建立。
- [x] Phase 1 shadow bundle 已输出到 `src-tauri/ui-react-dist`，候选 Tauri 配置和相对资源预检已接入本地/发布构建链；生产入口仍保持旧页面。
- [x] Phase 2 Trust/Findings 的证据详情完成（监控控制、一次性快照、事件失效刷新和可展开的安全证据明细已完成；旧页数值对照与真实 `.app` 验收仍属于发布门槛）。
- [x] Phase 2 可信度硬化完成：刷新失败保留旧矩阵/路线质量报告并显示原始窗口；来源停止/恢复读取只对后端声明可控的宿主开放，失败时 fail-closed。
- [ ] Phase 3 其余四个 tab 完成并通过旧页对照。
- [ ] Phase 4 `.app` 真机验收、生产 `frontendDist` 切换和旧页面回退窗口关闭。
