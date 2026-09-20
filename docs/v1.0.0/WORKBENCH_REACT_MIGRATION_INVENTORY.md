# Workbench React 迁移盘点

状态：Phase 0 基线（2026-09-21）

本文记录旧 Workbench 的可见入口、IPC 边界和 React 迁移状态。它是迁移清单，不改变旧页面的生产行为；在 Phase 4 之前，`apps/desktop/src-tauri/ui/` 仍是生产回退面。

## 页面归属

| 旧 tab | 旧入口 | React 目标 | 当前状态 | 下一步 |
|---|---|---|---|---|
| 总览 | `tab-overview` | `features/overview/OverviewPage.tsx` | React 壳有安全占位 DTO；尚未复刻完整月度/宿主/同步卡片 | Phase 3：先迁新鲜度和总览聚合 |
| 用量 | `tab-calendar` | `features/usage/UsagePage.tsx` | 未迁移，旧页继续提供完整表格 | Phase 3：复用 authority 月/日查询 |
| 会话 | `tab-sessions` | `features/sessions/SessionsPage.tsx` | 未迁移，旧页继续提供分页和轨迹入口 | Phase 3：轻量列表先行，轨迹按需展开 |
| 待处理/发现 | `tab-findings` | `features/findings/FindingsPage.tsx` | 已迁移首个垂直切片：安全 Finding 投影、待办、证据明细、决策矩阵和新鲜度 | Phase 2：继续补证据详情/筛选交互 |
| 测试 | `tab-test` | `features/test/TestPage.tsx` | 未迁移；涉及 probe mutation，保持旧页 | Phase 3 后半：先只读状态，再做显式 mutation |
| Skill | `tab-skills` | `features/skills/SkillsPage.tsx` | 未迁移；涉及扫描、取消和导出 | Phase 3 后半：单独审查导出脱敏 |
| 设置 | `tab-sources` | `features/settings/SettingsPage.tsx` | 未迁移；包含来源、预算、价卡、保留策略和 Trust 设置 | Phase 3：按表单域拆分，逐项保留回执/撤销语义 |

## Phase 2 Trust / Findings 边界

| 能力 | Rust/Tauri command | React bridge | 状态 |
|---|---|---|---|
| 宿主覆盖发现 | `trust_discover` | `discoverTrust()` | 已有；只接收宿主标签、检测状态和覆盖状态 |
| 历史本地审计 | `trust_audit` | `auditTrust(host)` | 已有；原始路径/内容不进入 renderer |
| 运行时一次快照 | `trust_runtime_snapshot` | `runTrustRuntimeSnapshot()` | 已接入；Rust 只返回能力与有界计数 |
| 监控配置 | `trust_monitor_config` / `save_trust_monitor_config` | `readTrustMonitorConfig()` / `saveTrustMonitorConfig()` | 已接入；不可观察时 fail-closed |
| Finding 聚合 | `findings_groups_safe` | `readFindings()` | 已有 versioned safe DTO |
| 决策矩阵 | `decision_matrix_safe` | `readDecisionMatrix()` | 已有 versioned safe DTO |
| 事件刷新 | `sync-status-updated` / `usage-fold-updated` | 当前 App 壳只刷新总览 | 待统一为 feature query invalidation |

## 安全与可见性约束

- React 组件不得直接调用 `window.__TAURI__`；所有 command 只能经 `react/src/lib/tauri.ts`。
- Trust evidence 只允许安全引用（`tr_...`）、类别、等级、来源、时间、范围和聚合计数；路径、文件内容、JWT、上传凭证、原始网络请求、canary 和 native session id 不得进入 React state。
- `trust_runtime_snapshot` 的 capability 是覆盖状态，不是风险结论；`unavailable` 必须在 UI 中显示为不可观察，不能显示为“安全”。
- 旧页与 React 页并存期间只维护一个数据真相：Rust/runtime/authority；不得在 React mock 中复制真实 SQLite 或宿主日志。

## 迁移退出检查

- [x] Phase 0 页面、command、事件和目标归属已列出。
- [x] Phase 1 React shell、hash route、bridge、Error Boundary、离线 mock 已建立。
- [ ] Phase 2 Trust/Findings 的证据详情和事件失效刷新完成（监控控制与一次性快照已完成）。
- [ ] Phase 3 其余五个 tab 完成并通过旧页对照。
- [ ] Phase 4 `.app` 真机验收、生产 `frontendDist` 切换和旧页面回退窗口关闭。
