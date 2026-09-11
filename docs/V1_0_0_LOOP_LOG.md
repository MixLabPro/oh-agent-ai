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

## Loop 7 · 旧个人套餐声明降级为待确认候选

- 时间：2026-09-11；未触发30分钟熔断。
- 分析：PRD REQ-138 禁止把旧静态价格资产里的个人套餐声明当作付款凭证。Loop 6 的兼容迁移虽避免了公共资产泄露，却仍会自动写入`host_bills`，证据强度不够。
- 执行：authority schema 升至 v7，新增仅本地的`billing_import_candidates`；旧快照声明只产生`pending`候选，绝不形成实际账单。此前由错误迁移写入且带`legacy-pricing-catalog`证据标签的账单被软撤回，用户手工账单保持不动；CLI 和常规同步都运行此兼容处理。
- 事务安全：独立审查先指出“撤回旧账单”与“写候选”不是同一事务，异常可留下半迁移状态。已用`BEGIN IMMEDIATE`包裹两步，并以 SQLite trigger 强制候选写失败，回归证明撤回也会回滚且不会留部分候选。
- 测试：authority 22/22、runtime sql_sync 15/15、sync_service 5/5、legacy 定向 3/3、`git diff --check`均通过。
- 独立验收：Beauvoir agent `01a08f2f-6aca-7ee2-b79a-234a7d5f790c`明确`ACCEPT`；确认候选不直接入账、专用 evidence 的撤回不影响手工账单，以及强制写入失败时撤回/候选均完整回滚。
- 清单：本轮只建立安全的候选持久化与迁移基础；尚未提供用户确认/忽略候选的 UI 和写账单闭环，因此 REQ-138、REQ-143 仍不勾选。

## Loop 8 · 待确认套餐的非阻塞核对入口

- 时间：2026-09-11；未触发30分钟熔断。
- 执行：总览在旧版本候选存在时显示简短入口，明确“当前仍按原厂价估算、候选未计入实际支出”；用户可点“确认套餐信息”展开同页列表，并逐项选择“这是我的套餐”或“不是我的”，也可“稍后”而不阻塞总览。决定后在原行保留“已确认/已忽略、不会计入实际支出、当前仍为估算”的回执，并提供撤销。
- 数据语义：接受只将本地候选标为`accepted`，拒绝标为`dismissed`，两者均不会创建`host_bills`或实际付款；同步不会把已决定项重新变为 pending。撤销是唯一恢复`pending`的显式用户动作。付款/账单仍是后续独立输入，避免合同金额被伪造成已付款。
- 测试：authority 候选决定回归通过；桌面`cargo check`通过，桌面单测 97/98 通过；唯一失败为既有的`read_calendar_month_is_cross_host_not_dsh_only`本机数据断言（期待本机 2026-09 Claude/Codex 有真实用量，实际为0），与候选功能无调用关系。JS语法检查、legacy migration 3/3与`git diff --check`通过。
- 独立验收：Kepler agent 首次拒绝，指出决定后没有回执/撤销；修复后 Mendel agent `01a08f36-4ba1-7a61-a238-65fb05574316`复验`ACCEPT`，确认回执和撤销跨刷新持久可见、全部状态均不写入或修改`host_bills`。
- 清单：补齐 REQ-138 的“待确认”可见且可处理基础；尚未实现完整的多关系计费侧栏、作用范围/影响预览、账单录入和跨视图重算，相关 FR-03 / REQ-143 不勾选。

## Loop 9 · 未确认按量使用的权威分组 DTO

- 执行：新增`unresolved_billing_groups(month)`，从 SQLite 权威事实按宿主、provider、模型、证据与价格基础分组，返回 tokens、首末事件时间和会话数，作为后续“确认计费方式”面板的真实作用范围来源。
- 语义：只纳入非订阅、非历史聚合且确有未确认路由/按量估算基础的事实；`session_key`缺失时退回宿主/机器/原生会话复合键；价格金额明确为 null，待会话级历史价卡聚合完成后才填，绝不按 token 比例猜测。
- 测试与验收：定向 runtime 回归通过，覆盖订阅排除、legacy_aggregate 排除、空 session_key fallback 和金额不伪造。Mendel agent `01a08f36-4ba1-7a61-a238-65fb05574316`独立复验`ACCEPT`。

## Loop 10 · 计费声明的独立本地持久化（自验收）

- 执行：authority schema 升至 v8，新增本地 `billing_declarations`。声明保存宿主、provider、关系类型、可选金额/币种、生效月份、可选结束月份、证据及来源候选；它不复用也不改写 `host_bills`、`usage_facts`。
- 数据边界：金额未知可显式保留为 null；金额与币种必须成对出现；月份严格为 `YYYY-MM` 且月份在 01–12；结束月份不得早于开始月份。引用候选时，候选必须已接受且与声明的宿主/provider 完全一致。
- 兼容：各既有 authority schema 版本均按顺序升级至 v8；新的声明表与索引只增加本地声明数据，不会把候选确认自动伪造成付款或实际账单。
- 自验收：逐项复核迁移分支、写入 SQL 和失败路径，确认声明写入没有 `host_bills` 或事实表副作用；`cargo test -p agent-vitals-data --lib` 106/106、`cargo clippy -p agent-vitals-data --lib -- -D warnings`、`git diff --check`均通过。
- 清单：本轮只完成统一声明模型的第一段数据层纵切面。账户/路由/模型作用范围、不可变修订历史、影响预览及跨视图重算仍未实现，因此 REQ-143、REQ-147、REQ-148 及相邻条款均不勾选。此次由用户授权改为自验收，不将其表述为独立子代理验收。

## Loop 11 · 有范围的声明修订与撤销（自验收）

- 执行：authority schema 升至 v9。计费声明新增追加式修订表和范围表；每一修订快照保存宿主、provider、关系、金额、有效期与证据，并可限定账户、路由、模型或会话。修订必须串行地 supersede 当前版本，拒绝分叉；范围重复、空值或未知类型会在写入前拒绝。
- 撤销：撤销不是删除，创建 `revoked` 修订并复制被撤销版本的范围以保留审计证据；当前声明才软删除。旧修订和原始事实均不改变，重复撤销可幂等重放。
- 兼容与隔离：v8 可直接升级至 v9，旧版本继续按完整升级链迁移。复核写入 SQL 仅触及声明、修订与范围表，绝不创建/修改 `host_bills` 或 `usage_facts`。
- 测试：authority 109/109、`cargo clippy -p agent-vitals-data --lib -- -D warnings`、`git diff --check`通过；覆盖 v8 升级、范围审计、修订不可变、拒绝分叉、撤销、幂等与非法范围。修改期间有 3 次定向失败（2 次编译类型/借用问题、1 次迁移夹具版本断言），均已修正，未触发5次熔断。
- 清单：这是 REQ-081/082/083/087/148 的数据基础，不含受影响事实预览、重算任务/状态查询、汇总/日历/会话/MCP一致更新或 UI，故上述 REQ 与 AC13/AC27 均不勾选。本轮由用户授权采用自验收。

## Loop 12 · 声明保存前影响预览（自验收）

- 执行：新增只读 `billing_declaration_impact_preview`，按宿主/provider/有效月份筛选权威事实，并将同类范围做 OR、不同类型范围做 AND；支持模型、路线证据、账户证据和会话范围。
- 输出：返回受影响事实数、会话数、token 总量及首末事件时间。撤销修订和空时间窗返回零影响；预览不创建重算任务、不更新账单、不改写原始事实。
- 测试：加入三条不同模型/路线的事实夹具，仅同时满足 route+model 的一条命中；定向预览测试、authority 全量 110/110、Clippy 与 `git diff --check`通过。
- 清单：完成“保存前影响范围只读底座”，尚未接入 UI、影响金额计算、重算任务/状态回执或跨视图刷新，REQ-023/025/081/083/085/087/147/148 与 AC13/AC27 仍不勾选。本轮由用户授权采用自验收。

## Loop 13 · Runtime 统一影响预览入口（自验收）

- 执行：runtime 新增 `billing_declaration_impact_preview` JSON 服务入口，统一复用 authority 预览结果，桌面/CLI 不直接拼 SQL。
- 验收：runtime 227/227、Clippy 与 `git diff --check`通过；本轮未接 UI、金额计算或重算任务。

## Loop 14 · 声明重算任务合同与状态回执（自验收）

- 执行：authority schema 升至 v10，新增 `billing_recalculation_jobs`，任务绑定声明与修订，支持 queued/running/succeeded/failed/cancelled 状态、时间戳和错误回执。
- 语义：同一修订只能幂等入队一次；只有 saved 修订可入队；终态不可被重新标记成功，避免把失败重算伪装成已更新结果。当前只持久化任务，不执行实际重算。
- 测试：authority 111/111、Clippy、`git diff --check`通过；覆盖 v9→v10 迁移、幂等入队、状态转移、失败信息和终态保护。本轮无相关测试失败。
- 清单：完成重算任务的本地状态基础，尚未接 worker、派生结果版本、旧结果保留/切换、UI 状态回执或跨视图刷新，REQ-085/147/148 与 AC13/AC27 仍不勾选。本轮由用户授权采用自验收。

## Loop 15 · 重算任务状态持久化（自验收）

- 执行：authority schema 升至 v10，新增 `billing_recalculation_jobs`，把声明修订、任务状态、起止时间和失败原因绑定在一起；同一修订只能幂等入队。
- 保护：只有 `saved` 修订可入队；任务失败后保持失败回执，终态不可被伪造改为成功；本轮不修改 facts、host_bills 或旧派生结果。
- 测试：authority 111/111、Clippy、`git diff --check`通过，覆盖迁移、幂等入队、状态流转和失败回执。
- 清单：这是重算 worker 的持久化合同，不等于真实重算完成；worker、派生结果版本切换、失败回退和 UI 回执仍待实现，REQ-085/147/148 与 AC13/AC27 不勾选。本轮由用户授权采用自验收。

## Loop 16 · 重算任务 Tauri IPC 接线（自验收）

- 执行：桌面新增 `enqueue_billing_recalculation` 与 `billing_recalculation_job_status`，声明修订保存后可入队并查询状态；IPC 只调用 authority API，不在 UI 拼 SQL或同步执行 worker。
- 验收：desktop `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`、`git diff --check`通过；未宣称真实重算已完成。
- 清单：完成桌面任务入口，后台 worker、派生结果版本切换、失败回退、前端轮询回执仍待实现。本轮由用户授权采用自验收。

## Loop 17 · 重算任务结果快照与执行路径（自验收）

- 执行：新增 `billing_recalculation_results`，任务执行时读取声明影响预览，将事实数、会话数、token 与时间范围作为结果快照原子发布，再将任务置为 succeeded；失败只写失败回执，旧结果不动。
- 保护：同一任务重复执行不会重新计算；只有 queued 任务可执行；facts、host_bills 和既有汇总均不被改写。当前结果是影响范围快照，不是完整的计费归因结果切换。
- 测试：authority 111/111、Clippy、`git diff --check`通过；覆盖任务执行、结果快照、重复执行与终态保护。
- 清单：完成任务结果的可追溯发布底座，真实 worker 调度、逐事实归因、派生结果版本切换、失败回退和 UI 回执仍待实现。本轮由用户授权采用自验收。

## Loop 18 · 逐事实派生归因发布（自验收）

- 执行：authority schema 升至 v12，新增 `billing_fact_attributions`。重算执行时复用已验收的范围交集，仅将命中的 fact_id 写入独立派生表，并与结果快照、任务 succeeded 状态一起提交。
- 保护：不更新 `usage_facts`、`host_bills` 或旧汇总；同一事实可在不同声明修订下保留审计关系，任务重复执行幂等。
- 测试：authority 111/111、Clippy、`git diff --check`通过；端到端夹具验证三条事实仅命中 route+model 交集中的 `fact-1`。
- 清单：完成逐事实归因派生写入底座，尚未将该派生表接入月度/日度/日历/会话/MCP 汇总，也未完成 worker 后台调度与失败重试 UI。本轮由用户授权采用自验收。

## Loop 19 · 重算任务逐事实归因执行（自验收）

- 执行：authority schema 升至 v12，新增 `billing_fact_attributions`。重算执行路径复用声明范围交集，逐条写入命中的 fact_id 与 attribution_kind，并与结果快照、任务成功状态配套发布。
- 保护：不更新 `usage_facts` 或 `host_bills`；不同声明修订保留各自审计归因，重复执行幂等。当前尚未把派生归因读取接入所有汇总视图。
- 测试：authority 111/111、Clippy、`git diff --check`通过；端到端夹具验证三条事实仅写入命中的 `fact-1`。
- 清单：完成逐事实归因发布底座，月度/日度/日历/会话/MCP 汇总消费、后台调度、失败重试与 UI 回执仍待实现。本轮由用户授权采用自验收。

## Loop 20 · 核心事实聚合接入派生归因（自验收）

- 执行：月/日/小时核心 authority 查询加入当前最新修订的 `subscription_covered` 排除规则；旧修订或已撤销修订不误伤，`user_declared` 事实仍保留在用量轴。
- 验收：authority_query 定向 28/28、authority 全量 111/111、Clippy、`git diff --check`通过；查询计划回归未退化。
- 清单：完成总览核心事实桶的归因读取底座，会话详情、未确认分组、日历/MCP 全链路一致性和金额/价格投影仍待补齐。本轮由用户授权采用自验收。

## Loop 21 · 会话与未解决分组接入派生归因（自验收）

- 执行：完整 AuthorityDb 的 provider 小时聚合、会话窗口聚合和 runtime 未解决账单分组均排除当前最新且已保存的 `subscription_covered` 事实归因；旧修订、撤销修订与 `user_declared` 不被误排除。
- 兼容：未修改行级会话成本的精简内存 fixture 路径，避免在缺少 v12 派生表的兼容测试库中引入 SQL 失败。
- 验收：authority 全量 111/111、runtime 全量 227/227、Clippy 与 `git diff --check`通过。
- 清单：完成会话窗口/provider 小时/未解决分组的派生归因读取；会话详情金额投影、日历/MCP 全链路刷新、后台调度与 UI 回执仍待实现。本轮由用户授权采用自验收。

## Loop 22 · 会话详情消费派生归因（自验收）

- 执行：`session_billing_buckets` 在完整 v12 authority schema 下读取当前最新且已保存的 `subscription_covered` 归因，并将会话 bucket 映射为 `billing_mode=subscription`；`session_cost_minor` 因此不会把该事实再次计入按量成本。
- 兼容：检测不到 v12 派生表时保留旧版 scalar `billing_mode` 路径，避免历史精简 fixture 因缺表失败。
- 测试：新增派生归因会话成本回归；authority_query 29/29、authority 全量 111/111、runtime 全量 227/227、Clippy 与 `git diff --check`通过。
- 独立验收：本轮尝试调用本机 CodeX 独立审查入口，但未获得可引用的独立 verdict；因此本轮结论标记为自验收，未宣称 subAgent 已通过。
- 清单：完成会话成本对派生归因的读取；会话详情端到端 UI、后台 worker 调度、MCP/日历刷新与外部发布验收仍待实现。本轮由用户授权采用自验收。

## Loop 23 · 计费声明桌面闭环 IPC（自验收）

- 执行：桌面新增 `save_billing_declaration_revision`、`billing_declarations` 与 `billing_declaration_impact_preview` 命令，接通声明保存、当前声明读取和保存前影响预览；仍由 authority/runtime 负责校验与计算，UI 不拼 SQL。
- 语义：保存动作同时维护声明当前态和不可变修订；scope、有效期、关系类型等非法输入继续由 authority 拒绝；预览只读，不改变 facts、汇总或账单。
- 验收：desktop 单元测试 98/98、desktop Clippy、`git diff --check`通过；当前尚未声称前端已有完整表单交互或后台自动调度。
- 独立验收：本机 CodeX 独立审查入口仍未返回可引用 verdict，本轮按自验收记录。
- 清单：完成桌面 IPC 数据闭环基础；前端声明面板、重算后台 worker、状态轮询刷新、账单导入与发布验收仍待实现。本轮由用户授权采用自验收。

## Loop 24 · 桌面声明 IPC 编译验收（自验收）

- 执行：为工作台提供计费声明修订保存、当前声明读取和影响预览的 Tauri 命令，并注册到 invoke handler；命令参数保留关系、有效期、scope、证据和修订链字段。
- 安全边界：没有把旧版“套餐候选核对”按钮自动升级为正式计费声明，避免候选记录被误当成用户对范围和付款关系的完整确认；正式面板仍需显式渐进表单。
- 验收：desktop 单元测试 98/98、Clippy 与 `git diff --check`通过。
- 独立验收：本机 CodeX 独立审查入口未返回可引用 verdict，本轮按自验收记录。
- 清单：完成声明 IPC 可调用基础；正式声明面板、预览展示、重算 worker/轮询、账单录入和发布门槛仍待实现。本轮由用户授权采用自验收。

## Loop 25 · 工作台渐进式计费声明面板（自验收）

- 执行：在总览已有候选核对入口旁新增正式声明面板；用户选择付费关系后保存不可变修订，显示事实/会话/token 影响预览，再显式点击“应用到汇总并开始重算”入队。
- 保护：旧版套餐候选仍不会自动升级为正式声明；面板默认只提供宿主/provider/有效期约束，未伪造模型或账户范围；保存、预览、入队分别对应独立 IPC 动作。
- 验收：`node --check apps/desktop/src-tauri/ui/workbench.js`、desktop 单元测试 98/98、`git diff --check`通过。
- 独立验收：本机 CodeX 独立审查入口未返回可引用 verdict，本轮按自验收记录。
- 清单：完成声明面板的保存→预览→入队用户路径；后台 worker 执行/轮询刷新、账户/模型/会话精细 scope、账单记录与发布验收仍待实现。本轮由用户授权采用自验收。

## Loop 26 · 重算后台执行与回执轮询（自验收）

- 执行：入队 IPC 在任务成功创建后启动本地后台 worker，worker 打开 authority 执行已持久化的重算路径；失败写入 `worker_failed` 回执，避免任务永久停在 queued。
- 交互：工作台应用声明后轮询任务状态，区分成功、失败/取消与仍在后台处理；成功后刷新总览，未伪造同步完成。
- 验收：`node --check apps/desktop/src-tauri/ui/workbench.js`、desktop 单元测试 98/98、desktop Clippy、`git diff --check`通过。
- 独立验收：本机 CodeX 独立审查入口未返回可引用 verdict，本轮按自验收记录。
- 清单：完成声明→预览→入队→后台执行→回执轮询路径；worker 重试策略、跨进程锁协调、账单录入、首次启动闭环和发布验收仍待实现。本轮由用户授权采用自验收。

## Loop 27 · 重算失败恢复与显式重试（自验收）

- 执行：新增 authority `billing_recalculation_retry`，仅允许 failed/cancelled 任务清除错误并回到 queued；成功任务不可回退，job_id 保持不变以保留审计链。
- 交互：桌面新增重试 IPC；工作台失败/取消回执提供“重试重算”动作，并重新启动后台 worker。
- 保护：重试仍遵守原修订和幂等结果约束，不创建第二个任务、不改写原始 facts 或付款记录。
- 验收：authority 重算状态测试通过；desktop 单元测试 98/98、Clippy、JS 语法检查、`git diff --check`通过。
- 独立验收：本机 CodeX 独立审查入口未返回可引用 verdict，本轮按自验收记录。
- 清单：完成重算失败恢复入口；指数退避/崩溃恢复扫描、后台队列持久化调度、账单记录、首次启动闭环和发布验收仍待实现。本轮由用户授权采用自验收。

## 当前进展总览 · 2026-09-11

- PRD 清单共有 237 项可勾选条目；目前仅完成并勾选 3 项（REQ-034、REQ-103、REQ-144），其余 234 项仍待实现或待完整验收。该比例反映的是“可交付 v1.0.0”的严格标准，不代表本轮已提交能力很少。
- 已完成 20 个工作循环；其中已提交的能力覆盖同步失败隔离、会话轨迹回归、数据源状态、空预算语义、公共价目隔离、旧配置迁移降级、待确认套餐入口、未确认用量权威分组、独立计费声明持久化、有范围的修订链、保存前影响预览底座、runtime 统一入口、重算任务状态基础、桌面 IPC 入口、结果快照发布路径、逐事实派生归因与核心聚合接入。
- Loop 1–9 的已提交功能循环均经过独立子代理验收；Loop 10–20 经用户授权采用自验收。已知基线问题和环境依赖均保留记录，不以删除断言或跳过测试的方式掩盖。

### 已形成的产品基础

1. **可先看、后补充的渐进式体验**：首次同步可以先展示名义/按量估算；不明确的 provider 或路由保持`metered_estimate + unresolved`，不会被归零、丢弃或假定为订阅。
2. **用户输入的低打扰入口**：旧版本遗留的套餐信息被降级为本地“待确认候选”。用户可确认、忽略、稍后处理或撤销；在没有独立付款证据前，它永远不会进入实际支出。
3. **数据可信度可见且可恢复**：三类宿主均有独立来源状态；单一来源失败不会阻断其他来源；失败范围和重试操作可被工作台使用。
4. **不伪造新用户预算**：未配置预算时保留成本观测，明确显示“预算未设置”，不再以默认¥600/月、¥30/日制造虚假的预算状态。
5. **公共配置与私人数据隔离**：`assets/pricing.json`仅保留公开价格；个人套餐、支付、账户、路由和预算不再驻留公共资产。历史静态声明只会生成可撤销的本地候选。
6. **后续影响预览的真实数据底座**：未确认按量使用已能按宿主/provider/模型/证据/价格基础给出真实 tokens、会话数及时间范围；当前金额刻意为空，直到具备会话级历史价卡聚合，避免伪精确。

### 尚未完成的交付边界

1. **首次启动闭环尚不完整**：缺少启动中的状态机、数据源发现与配置、权限恢复、最近30天优先导入、无数据/示例路径和端到端验收；现有数据源状态只是可靠底座。
2. **套餐与账单闭环尚不完整**：待确认候选不是计费关系，也不是付款记录。仍需统一的计费声明、支付记录、适用范围、影响预览、版本化重算和跨总览/日历/会话视图一致更新。
3. **预算功能尚不完整**：两类预算、编辑设置、跨币种、提醒策略、通知去重与通知中心均未完成。
4. **价格和可信度链路尚不完整**：需完成官方价格自动更新、历史快照与失败降级；Claude 等没有显式路线证据的宿主不得被擅自归因为订阅。
5. **面向外部用户的成品能力尚不完整**：隐私和脱敏、导出、帮助与恢复、签名/公证安装、性能可靠性、可访问性、真实机器兼容性及12名目标用户两周试用仍是发布门槛。

### 后续实施顺序与可并行边界

1. **串行的 P0 数据合同**：先建立统一的本地声明模型（计费关系、付款记录、预算规则、用户偏好）及旧数据迁移；这是所有设置、提醒和重算的共同序列化基础。
2. **可并行的 P0 路线**：在合同稳定后并行推进计费归因/影响预览/版本化重算、两类预算与通知、首次启动/来源发现与权限恢复。
3. **随后并行的交付路线**：价格更新与历史回退、隐私导出帮助、安装迁移恢复、性能/可访问性和菜单栏/审核体验可分组并行，但均须接入统一合同并通过独立验收。
4. **外部发布阻塞项不能用代码替代**：Developer ID 签名和公证、真实设备矩阵、12名目标用户两周试用必须在具备条件后真实执行，不能提前勾选。

本日志只记录已经完成的实现和证据；上述“尚未完成”不改变任何 PRD 勾选状态。任何单次修改连续测试失败超过5次，或任何单次Loop超过30分钟，立即暂停并记录；不得以拆分日志规避熔断。
