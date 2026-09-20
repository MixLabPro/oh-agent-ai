# Workbench React 迁移盘点

状态：Phase 0 基线（2026-09-21）

本文记录旧 Workbench 的可见入口、IPC 边界和 React 迁移状态。它是迁移清单，不改变旧页面的生产行为；在 Phase 4 之前，`apps/desktop/src-tauri/ui/` 仍是生产回退面。

## 页面归属

| 旧 tab | 旧入口 | React 目标 | 当前状态 | 下一步 |
|---|---|---|---|---|
| 总览 | `tab-overview` | `features/overview/OverviewPage.tsx` | 已迁移首个总览聚合切片：安全 DTO、费用/预算/新鲜度/宿主覆盖卡片；仍需完整月度/日历对照 | Phase 3：补齐月度/日历并通过旧页数字对照 |
| 用量 | `tab-calendar` | `features/usage/UsagePage.tsx` | 已迁移首个日历切片：安全月份/日历/小时 DTO、按币种成本、来源新鲜度与覆盖状态；完整旧页对照仍待完成 | Phase 3：补齐旧页数字对照与统计时区设置联动 |
| 会话 | `tab-sessions` | `features/sessions/SessionsPage.tsx` + `features/sessions/SessionDetail.tsx` | 已迁移安全列表和只读详情：筛选、keyset 分页、摘要、计费桶、usage/workflow 脱敏时间线；完整轨迹图和原始报告仍不迁移 | Phase 3：真实 Tauri 对拍与轨迹图安全投影评估 |
| 待处理/发现 | `tab-findings` | `features/findings/FindingsPage.tsx` | 已迁移首个垂直切片：安全 Finding 投影、待办、证据明细、决策矩阵和新鲜度 | Phase 2：补事件 smoke test 与旧页数值对照 |
| 测试 | `tab-test` | `features/test/TestPage.tsx` | 已迁移只读路线质量面：宿主 × 实际模型族、非官方族/API 错误/无基准状态与安全 DTO；主动 probe mutation 仍保留旧页 | Phase 3 后半：补真实 Tauri 对拍，再评估显式 mutation |
| Skill | `tab-skills` | `features/skills/SkillsPage.tsx` | 未迁移；涉及扫描、取消和导出 | Phase 3 后半：单独审查导出脱敏 |
| 设置 | `tab-sources` | `features/settings/SettingsPage.tsx` | 已迁移数据源健康与安全同步控制：动态来源列表、失败原因人话映射、立即/重新同步、暂停/恢复自动同步、authority 不可用态；排除/删除等高风险 mutation 仍保留旧页 | Phase 3：迁移数据源高风险控制，再拆预算、计费、统计与诊断 |

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
- [x] Phase 2 Trust/Findings 的证据详情完成（监控控制、一次性快照、事件失效刷新和可展开的安全证据明细已完成；旧页数值对照与真实 `.app` 验收仍属于发布门槛）。
- [ ] Phase 3 其余四个 tab 完成并通过旧页对照。
- [ ] Phase 4 `.app` 真机验收、生产 `frontendDist` 切换和旧页面回退窗口关闭。
