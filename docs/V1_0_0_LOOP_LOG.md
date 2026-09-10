# v1.0.0 开发迭代日志

目标范围：完整 PRD（含所有表格、正文、验收、签名公证及试用门槛）。清单位于 PRD 第20节。部分测试通过不代表整个需求完成。

## 前置动作

- `git status`：main 上16个新增文件待保存，无已跟踪代码修改。
- 已提交 `88ae4a7 chore: save state before v1.0.0 loop`，包含原型、PRD及用户要求统一保存的现有文件。
- 从该 main 提交建立并切换到 `feat/v1.0.0-auto`。
- 根目录 PRD 入口指向 docs 中的唯一正文，保留原图片相对路径。
- 原文无 checklist；新增149个正文条款、28项AC、5项发布总验收，初始全部未勾选。表格和非列表要求仍强制有效。

## Loop 1 · 来源同步失败隔离

- 开始：2026-09-10 13:19 UTC 左右；30分钟熔断截止不晚于13:49 UTC。
- 分析：桌面 sync_tick 要求 DSH 成功再执行 Claude，Claude 成功再执行 sync-facts，违反单个来源失败不得阻止健康来源导入的要求。
- 执行：后续阶段各自执行；保留各阶段错误并报告 partial；DSH fold或facts同步成功可刷新工作台。
- 限制：尚未完成扫描权限错误传播、专用数据源状态接口；sync-facts暂未返回变化数量，因此成功扫描会触发刷新。这一补丁不证明完整FR-02或AC15通过。
- 测试：独立desktop单测3/3通过；根workspace `cargo test --release` 基线退出0；desktop `cargo clippy --lib -- -D warnings`退出0。
- Python基线：1129 tests，201 skipped，1 error（`test_codex_session_template`调用`verify-workbench-traces.mjs`）。独立复现显示旧验证器仍要求已移除的Traces tab及按钮handler。此次补丁只修改Rust同步控制流；需后续核对实际会话详情轨迹入口并修复过时验证器，不能删除断言来冒充通过。
- 修改后连续测试失败次数：0。
- 独立验收：Hubble agent `01a08b7a-d95b-7772-96b9-2b6b51a24006`明确通过本轮控制流补丁，无阻断项。其提出清单缺少表格追踪，已补TABLE与DETAIL条目；未勾选完整FR/AC。
- 结束：2026-09-10 13:26 UTC 左右，约7分钟；未触发30分钟熔断。修改相关测试连续失败0次；独立基线失败1次，针对性复现1次，待后续修复。
- 原始日志：`/tmp/agent-vitals-v1-desktop-loop1.log`、`/tmp/agent-vitals-v1-rust-baseline.log`、`/tmp/agent-vitals-v1-python-baseline.log`、`/tmp/agent-vitals-v1-desktop-clippy-loop1.log`。

## 后续优先缺口（独立agent静态核查）

1. 数据源页读取 sessions_list 中不存在的 source_statuses，缺字段降为空且只遍历两个宿主；需专用状态契约。
2. Codex/Claude目录扫描吞掉读取错误，无法区分无数据与权限失败。
3. 公共assets含个人订阅，运行时将其纳入快照与费用；需公共价目和个人声明隔离及迁移。
4. 无预算行仍产生默认启用预算；desktop另有默认金额，需未设置语义一致。
5. 继续完成全部首次体验、计费编辑、持久化声明、历史重算、账单、预算、价格、隐私、发布及试用条款。

任何单次修改连续测试失败超过5次，或任何单次Loop超过30分钟，立即暂停并记录；不得以拆分日志规避熔断。
