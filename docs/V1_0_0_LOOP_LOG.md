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

## Loop 2 · 会话详情轨迹回归验证

- 开始：2026-09-10 13:26 UTC；30分钟熔断截止13:56 UTC。
- 上轮分类：progress，已有代码/清单提交及独立验收证据。
- 分析：轨迹已嵌入会话详情，旧验证器依赖已移除的独立Traces tab。
- 执行：从真实`renderDetailEnvelope`入口验证详情容器创建和`loadDetailTrace`调用，保留真实CLI fixture DTO与真实TimelineGeometry；精确验证`timeline_series`与`graph`两种请求，并覆盖安全引用、缺引用不发IPC、错误响应、Promise拒绝、无样本和过期响应。
- 首次运行发现测试定位写成sess-detail（实际sess-detail-view），纠正后Node验证和Python模板测试通过。修改连续失败最大1次，当前0次。
- 完整Python回归：1129 tests通过，201 skipped；日志`/tmp/agent-vitals-v1-loop2-python.log`。
- 首次独立审查指出旧DOM桩让过期响应测试可能假通过、未动态验证详情入口、未精确区分两种输出。已用互斥`textContent`/`innerHTML`语义修正DOM桩，并增加入口、输出类型和Promise拒绝断言。
- 独立验收：Zeno agent `01a08b80-7a79-7691-a8f4-cf4e5ebd574b`复验后明确`ACCEPTED`；其运行Node语法检查、完整脚本和diff检查均通过，确认四个阻断项全部关闭且未删除有效覆盖。
- 本轮仅修复既有轨迹契约的回归验证，不足以证明FR-08整项完成，因此未勾选完整PRD条款。

## Loop 3 · 独立数据源状态与可恢复链路

- 时间：2026-09-10 21:38–21:47 UTC；未触发30分钟熔断。
- 分析：数据源页仍从已迁移的`sessions_list.source_statuses`取值，当前SQL/MCP会话契约不含该字段，导致空页；前端还硬编码Codex与DSH，遗漏Claude Code。
- 执行：新增独立`data_source_status` IPC与runtime共享投影，按`FACT_HOSTS`注册表输出三宿主的source_id、授权/连接、扫描、日志、导入范围、失败范围和恢复动作；SQL错误显式返回unavailable，不伪装成零数据，也不输出路径/path_hash。
- 生产失败接入：将最近一轮真实同步失败按宿主标记合并到failed_scope；无法明确归属的facts失败影响全部宿主，避免权限或扫描失败被显示成“已连接”。
- 恢复闭环：`trigger_sync`返回单调request ID，后台用`SyncRequests`记录完成；前端按本次ID轮询，完成后才重读状态，超时明确提示。未检测宿主提供“扫描并接入”，失败宿主提供“重新同步”。
- 测试：runtime源状态2项、desktop失败合并2项、Python JS包装1项均通过；动态Node verifier执行真实workbench.js，覆盖三卡渲染、失败范围、延迟完成、请求ID、超时和错误横幅。
- 回归：desktop clippy零警告。根`cargo test --release`除既有lease并发测试`drop_releases_the_lock_as_a_safety_net`一次抖动外全部通过；该失败单测立即单独通过，runtime 221项串行复跑全部通过，判定为并行共享锁抖动而非本轮回归。
- 独立验收：Mendel agent `01a08d42-6086-7c53-9c34-830dd5340736`先后两次BLOCKED，指出假空、生产失败未接入、完成时序和静态验证假通过；全部修正后最终`ACCEPTED`，并确认desktop clippy零警告。
- 清单：REQ-144已由实现、动态前端测试、错误测试和独立验收完整覆盖，勾选完成；没有扩大勾选相邻条款。
- 修改相关测试连续失败次数：0。

## Loop 4 · 新安装预算保持未设置

- 时间：2026-09-10 21:49–21:59 UTC；未触发30分钟熔断。
- 分析：SQL`budget_status`已有no_budget语义，但`evaluate_alert_from_sql`和desktop overview仍回落domain默认¥600/月、¥30/日，导致新用户被显示成已启用预算。
- 执行：无SQL/旧配置声明时保留已观测成本，但清空预算金额、日预算、比例与阈值派生值，统一level=no_budget；数据库打不开同样不得回落默认预算。desktop字段改为Option，工作台与托盘明确显示“预算未设置”。
- 兼容：旧config只在严格`[budget]`节同时存在monthly/daily键时迁移；SQL已有配置和合法旧配置保持原值，不重置用户预算。
- 测试：runtime预算19项、desktop预算16项、empty overview、Python JS包装均通过；真实`renderOverview`验证不显示0%、¥600或¥30，并验证“成本统计不受影响”；desktop clippy all-targets零警告。
- 独立验收：Franklin agent `01a08d4e-fe23-7393-99c4-beb15a8117e9`先后指出DB失败默认、跨section误迁移、缺少正成本场景和UI/托盘覆盖，修正后最终`ACCEPTED`。
- 清单：REQ-034有完整实现与验收证据，单独勾选；双预算类型、设置编辑和AC11仍未完成。
- 修改相关连续失败：3次（一次cargo参数误用、一次错误工作目录、一次clippy测试lint），均已修正，未超过5次熔断。

## 后续优先缺口（继续）

## Loop 6 · 公共价目隔离的本地消费与升级读取

- 时间：2026-09-11 06:07–06:20 UTC；未触发30分钟熔断。修改相关连续失败3次：一次Rust查询迭代器生命周期、一次根workspace误指定独立桌面包名、一次Codex无套餐时文案仍为裸`total cost`；均已修正。
- 执行：菜单栏订阅行改为只读本地`host_bills`的`fixed_subscription + CNY`，不再读取公共价格资产；正常`sync-facts`和`data-migrate`均扫描旧价格快照并幂等写入本地账单，已存在的同月同provider手工固定订阅不覆盖；Codex缺套餐证据文案明确为“按量估算，待确认”。
- 测试：sql_sync 14/14、desktop overview 30/30、CLI Codex SQL 2/2；迁移幂等/手工账单保护、正常同步自动迁移、桌面本地订阅读取、无套餐文案均有定向回归。
- 独立验收：Ohm agent `01a08f1d-2730-7c42-a2db-360e2ded67c8`最终`ACCEPT`，确认公共价目不再参与订阅展示、同步/CLI迁移都触发、迁移不会覆盖手工账单、无套餐Codex明确待确认。
- 清单：REQ-103由公共资产清理、静态断言、干净安装估算及独立验收覆盖，勾选。REQ-138/143不勾选：旧嵌入声明的证据强度仍需升级为本地“待确认候选”，不能仅凭旧快照最终认定为已付款。

## Loop 5 · 公共价格目录与未确认按量估算（已触发时间熔断，暂停）

- 开始：2026-09-10 约22:00 UTC；在模型切换与独立验收后于2026-09-11 06:07 UTC复核，已超过30分钟单轮上限。
- 已完成但未提交：从公共`assets/pricing.json`移除个人订阅、付款、账户与路由身份；干净安装的 Claude/Codex 已知价卡用量改为`MeteredEstimate + unresolved`，不再为零/丢失，也不进入已确认实际账单；SQL 聚合不再虚构 Codex Plus 身份。
- 测试证据：`tests.test_catalog_pricing` 18/18、domain billing 8/8、runtime summary 23/23、`tests.test_v07_views` 11/11（2 skip）已通过。一次桌面测试命令包名写错，未实际执行；随后独立验收发现真实阻断项。
- 独立验收：Pauli agent `01a08f11-19cd-7272-9e25-4d08602a785e`判定REJECT。阻断：桌面`monthly_cny_subscriptions`仍从已移除的公共subscriptions读取；旧版个人订阅只会保存在旧价表，`data-migrate`尚未幂等迁移到本地`host_bills`，升级用户可能丢失固定支出。
- 熔断：本轮超过30分钟，立即暂停；不得提交或勾选REQ-103/REQ-143。下一轮从“本地账单声明读取 + 旧价表至host_bills幂等迁移 + UI/升级回归”继续。

1. Codex/Claude目录扫描的更底层读取错误仍需完整传播；本轮已接入同步阶段失败，但尚未证明所有目录遍历分支都能产出错误证据。
2. 公共assets含个人订阅，运行时将其纳入快照与费用；需公共价目和个人声明隔离及迁移。
3. 继续完成双预算类型、预算编辑/通知，以及全部首次体验、计费编辑、持久化声明、历史重算、账单、价格、隐私、发布及试用条款。

任何单次修改连续测试失败超过5次，或任何单次Loop超过30分钟，立即暂停并记录；不得以拆分日志规避熔断。
