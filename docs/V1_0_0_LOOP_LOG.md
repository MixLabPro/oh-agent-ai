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

## Loop 28 · 应用重启后的重算队列恢复（自验收）

- 执行：authority 新增重算恢复 API；启动时将上次中断的 running 任务标为 failed 并保留 `interrupted` 证据，同时返回 queued 任务供桌面 worker 重新调度。
- 保护：恢复只改任务状态，不改写 facts、结果快照或归因；成功任务不会被回退，queued 任务按请求时间稳定调度。
- 验收：authority 重算幂等/中断恢复定向测试通过；desktop 单元测试 98/98、Clippy、`git diff --check`通过。
- 独立验收：本机 CodeX 独立审查入口未返回可引用 verdict，本轮按自验收记录。
- 清单：完成应用启动时的队列恢复基础；多进程锁协调、指数退避、可观测 worker 日志、账单记录、首次启动闭环和发布验收仍待实现。本轮由用户授权采用自验收。

## Loop 29 · 重算 worker 跨进程串行协调（自验收）

- 执行：重算 worker 复用 runtime 文件 lease，在 authority 数据目录建立 `.billing-recalculation.lock`；多个 queued/retry worker 按租约串行，避免并发发布结果快照。
- 失败语义：租约等待超时写入 `worker_busy`，启动恢复仍可识别并由用户重试；worker 不伪造成功或修改原始事实。
- 验收：authority 重算幂等/恢复定向测试通过；desktop 单元测试 98/98、Clippy、`git diff --check`通过。
- 独立验收：本机 CodeX 独立审查入口未返回可引用 verdict，本轮按自验收记录。
- 清单：完成重算 worker 的跨进程串行基础；统一后台队列、指数退避、崩溃后自动重试、账单记录、首次启动闭环和发布验收仍待实现。本轮由用户授权采用自验收。

## Loop 30 · worker 有限指数退避（自验收）

- 执行：重算 worker 在单次任务内最多执行 3 次，失败后按 250ms、500ms 退避并复用同一 job_id 重入队；最终失败才写入 `worker_failed`。
- 保护：不无限重试、不改变声明修订和结果审计链；成功任务不会被重复执行，跨进程 lease 仍覆盖整个 worker 生命周期。
- 验收：authority 重算幂等状态测试通过；desktop 单元测试 98/98、Clippy 与 `git diff --check`通过。
- 独立验收：本机 CodeX 独立审查入口未返回可引用 verdict，本轮按自验收记录。
- 清单：完成 worker 的有限退避恢复；持久化尝试次数/下次执行时间、崩溃后自动重试策略、账单记录、首次启动闭环和发布验收仍待实现。本轮由用户授权采用自验收。

## Loop 31 · 实际账单录入面板与 IPC（自验收）

- 执行：总览新增“录入实际账单”面板，支持宿主、服务商、账期、费用类型、分币金额、币种和来源说明；桌面新增 `save_host_bill` 与 `host_bills_for_period` IPC。
- 语义：账单/付款记录独立写入 `host_bills`，不从订阅合同推断付款，不改变已观测 tokens；金额校验和重复 upsert 继续由 authority 执行。
- 验收：authority host-bill 校验测试通过；desktop 单元测试 98/98、Clippy、JS 语法检查、`git diff --check`通过。
- 独立验收：本机 CodeX 独立审查入口未返回可引用 verdict，本轮按自验收记录。
- 清单：完成最小 L2 账单录入/读取路径；账单删除/更正 UI、CSV 模板导入与预览、重复检测、预算提醒、首次启动闭环和发布验收仍待实现。本轮由用户授权采用自验收。

## Loop 32 · 账单明细更正与删除（自验收）

- 执行：新增带 `bill_id/evidence_ref` 的账单明细读取 API 与桌面 `delete_host_bill` IPC；总览账单面板展示当前账期记录并支持 soft-delete。
- 保护：删除不物理清除历史，保存仍由 authority 校验账期、basis、金额和币种；账单记录继续与订阅声明、usage facts 分离。
- 验收：authority host-bill 校验/幂等测试通过；desktop 单元测试 98/98、Clippy、JS 语法检查、`git diff --check`通过。
- 独立验收：本机 CodeX 独立审查入口未返回可引用 verdict，本轮按自验收记录。
- 清单：完成账单列表与 soft-delete 基础；编辑表单复用保存入口、CSV 模板导入/预览/重复检测、预算提醒、首次启动闭环和发布验收仍待实现。本轮由用户授权采用自验收。

## Loop 33 · CSV 账单预览与原子导入（自验收）

- 执行：账单面板新增固定表头 CSV 文本导入，逐行校验账期、basis、非负整数分币金额、币种、来源和字段数，并报告可导入/拒绝行。
- 保护：CSV 内重复业务键被拒绝；确认导入调用新的批量事务 IPC，任一行校验失败整体回滚，不留下半批账单；导入仍不影响 usage facts。
- 验收：authority host-bill 校验测试通过；desktop 单元测试 98/98、Clippy、JS 语法检查、`git diff --check`通过。
- 独立验收：本机 CodeX 独立审查入口未返回可引用 verdict，本轮按自验收记录。
- 清单：完成 CSV 预览与原子导入基础；跨已有数据库重复检测、导入错误逐行更正 UI、账单编辑表单、预算提醒、首次启动闭环和发布验收仍待实现。本轮由用户授权采用自验收。

## Loop 34 · 桌面预算配置与状态刷新（自验收）

- 分析：权威库与 CLI 已有预算配置读写和输入边界，但工作台只能展示预算状态，用户无法在同一产品内设置月预算、日预算或预警阈值。
- 执行：新增只读 `budget_config` 与受校验的 `save_budget_config` IPC；总览新增 CNY 最小货币单位的月/日预算及百分比预警表单。保存后重新读取总览，使 SQL 权威预算状态即时反映当前用量；空输入不会被悄悄转换成 0。
- 语义：金额为分，月预算为 0 可显式停用月度预算；范围保持为既有“跨宿主按量实付 CNY”，不把固定订阅或名义成本混入。后端拒绝负数和 0–100% 外的阈值。
- 修复：账单列表在总览第二次刷新后会重新读取当前账期，避免只在首次打开时显示记录。
- 验收：`node --check apps/desktop/src-tauri/ui/workbench.js`、desktop 单元测试 98/98、desktop Clippy（`-D warnings`）与 `git diff --check`通过。
- 独立验收：本机 CodeX 独立审查入口未返回可引用 verdict，本轮按自验收记录。
- 清单：补齐现有单币种预算的桌面设置路径；预算提醒/snooze UI、多币种预算、首次启动闭环和发布验收仍待实现。本轮不扩大 PRD 勾选范围。

## Loop 35 · 预算提醒暂时静默与恢复（自验收）

- 执行：工作台预算设置新增“静默提醒 24 小时”和“恢复预算提醒”；分别接入权威库既有的 snooze 写入/清除 API，动作完成后重读总览。
- 语义：静默只压制预算告警状态，不暂停同步、不隐藏 tokens 或成本，也不改写预算配置；后端拒绝过去时刻，恢复操作幂等。
- 验收：`budget_snooze_set_get_clear` 定向测试、desktop 单元测试 98/98、desktop Clippy（`-D warnings`）、`node --check`和 `git diff --check`通过。
- 独立验收：本机 CodeX 独立审查入口未返回可引用 verdict，本轮按自验收记录。
- 清单：完成预算静默的最小桌面闭环；阈值首次跨越通知、系统通知授权、整周期静默、多币种/双口径预算及 AC19 端到端验收仍待实现。本轮不扩大 PRD 勾选范围。

## Loop 36 · 首次启动工作台与同步生命周期（自验收）

- 分析：桌面启动时后台 tick 会立即同步，但首次安装没有自动打开工作台；而 `usage-fold-updated` 只在新增事实时广播，首次扫描无记录时页面会一直停留在“正在整理”。
- 执行：仅在尚无同步回执的首次启动自动显示工作台；总览显示“正在本机整理 AI 使用记录，不会上传会话内容”及数据源入口。新增独立同步状态事件，因此没有新增 facts 的扫描结束也会刷新首屏；后续启动维持菜单栏工具的安静行为。
- 验收：新增首次启动判定单测；desktop 单元测试 99/99、desktop Clippy（`-D warnings`）、`node --check`和 `git diff --check`通过。
- 独立验收：本机 CodeX 独立审查入口未返回可引用 verdict，本轮按自验收记录。
- 清单：建立 FR-01 首屏与同步状态基础；标准目录的近30天优先扫描、暂停/恢复、目录选择、无记录样例隔离及 AC01–AC04 端到端验收仍待实现。本轮不扩大 PRD 勾选范围。

## Loop 37 · 可持久化的自动解析暂停/恢复（自验收）

- 分析：同步 tick 没有控制状态，用户无法真正暂停本地日志读取；仅做按钮隐藏会让下一次五分钟 tick 继续扫描，违反暂停语义。
- 执行：新增独立的本地同步控制文件，首次加载和数据源页均可暂停/恢复。暂停时 tick 在任何宿主扫描前退出，已有导入记录仍可读；数据源卡与总览明确显示“已暂停”，恢复后才重新触发同步。
- 安全：控制文件以临时文件 rename 写入；缺文件默认未暂停，损坏文件使 tick 失败关闭，绝不在用户已暂停后静默恢复读取。
- 验收：新增暂停状态持久化与损坏 fail-closed 单测；desktop 单元测试 100/100、desktop Clippy（`-D warnings`）、`node --check`和 `git diff --check`通过。
- 独立验收：本机 CodeX 独立审查入口未返回可引用 verdict，本轮按自验收记录。
- 清单：完成全局自动解析的暂停/恢复基础；按宿主暂停、排除、自定义目录、删除连接/导入数据及 AC23 端到端验收仍待实现。本轮不扩大 PRD 勾选范围。

## Loop 38 · 旧预算来源标记与可修改性（自验收）

- 分析：旧 `config.toml` 会一次性 seed 到 SQL 预算表，但表中不带来源；工作台无法区分旧版迁移的 ¥1 与用户新设置，违背升级时可理解、可修改的要求。
- 执行：新增独立预算来源标记。新发生的旧版 seed 记录 `legacy_import`，工作台明确显示“从旧版本导入；可以直接修改”；用户保存后覆盖为 `user`。无历史证据的早期迁移值显示“来源未记录”，不猜测其来源。
- 语义：来源标记不参与金额、预算计算或账单归因；标记写入失败不回滚已成功保存的预算金额，避免把辅助说明变成配置写入故障。
- 验收：runtime 预算测试 20/20（含迁移标记与显式保存覆盖）、desktop 单元测试 100/100、desktop Clippy（`-D warnings`）、`node --check`和 `git diff --check`通过。
- 独立验收：本机 CodeX 独立审查入口未返回可引用 verdict，本轮按自验收记录。
- 清单：补齐 AC11 的旧预算来源可见性基础；双口径/多币种预算和完整端到端升级验收仍待实现。本轮不扩大 PRD 勾选范围。

## Loop 39 · 无记录状态的安全样例入口（自验收）

- 分析：月度 token 为零不能证明机器没有日志；把“本月未使用”显示成“未发现会话”会掩盖已有历史数据，数据源读取失败更不能伪装为空态。
- 执行：总览仅在一次成功扫描后、三宿主均无扫描源且无已导入会话时显示“尚未发现 AI 会话”。该状态提供数据源入口和可展开的演示样例；样例是前端内存文字，不写入权威库、不参与预算、提醒、通知或导出。
- 保护：同步中、暂停、数据源状态不可用、已有历史导入或仅当月无用量时均不显示无记录态，避免掩盖失败或误导用户。
- 验收：desktop 单元测试 100/100、desktop Clippy（`-D warnings`）、`node --check`和 `git diff --check`通过。
- 独立验收：本机 CodeX 独立审查入口未返回可引用 verdict，本轮按自验收记录。
- 清单：补齐 REQ-010/046 的无记录文案与隔离样例基础；自定义目录选择、实际接入和 AC01 端到端验收仍待实现。本轮不扩大 PRD 勾选范围。

## Loop 40 · 权威库 schema v12 升级闸修复（自验收）

- 分析：代码已依赖 v10–v12 的计费重算与逐事实归因表，但 `SCHEMA_VERSION` 仍为 9；干净安装会遗漏后续表，旧版本分支还可能将版本戳抬高而未安装全部表。
- 执行：版本闸正式升至 v12；v9→v12 迁移补齐且对已存在的 v10–v12 表幂等，v4→当前链补齐 v11/v12；全新安装表清单增加重算和归因表断言。
- 兼容：新增“版本戳为 v9、但后续表已存在”的升级回归，确保此前错误构建产生的数据库能够安全收敛，而不是因重复建表失败。
- 验收：authority 测试 30/30、data crate Clippy（`-D warnings`）、desktop 单元测试 100/100 与 `git diff --check`通过。
- 独立验收：本机 CodeX 独立审查入口未返回可引用 verdict，本轮按自验收记录。
- 清单：修复 v1.0 数据迁移安全的关键阻断项；发布前的真实升级备份/回滚演练、签名公证和 AC20 端到端验收仍待实现。本轮不扩大 PRD 勾选范围。

## Loop 41 · 计费声明撤销的桌面闭环（自验收）

- 分析：权威查询只认可每条声明的最新 `saved` 修订；若最新修订是 `revoked`，历史订阅归因会自动失效并恢复按量/未定归类。因此为撤销伪造一个仅接受 `saved` 修订的重算任务既不可执行，也会误导用户。
- 执行：总览新增“当前计费声明”列表及“撤销计费声明”动作。桌面命令要求前端提交当前修订 ID，权威库仍在事务内校验它确实是当前的 `saved` 修订，再追加不可变 `revoked` 修订、保留范围和证据、使当前物化状态失效。
- 保护：没有当前修订标识时前端拒绝猜测执行；撤销不删除原始事实、旧归因、证据或修订历史，也不把撤销冒充为重算完成。
- 验收：authority 全部测试 30/30（含不可变修订及撤销回归）、desktop 单元测试 100/100、desktop Clippy（`-D warnings`）、`node --check`和 `git diff --check`通过。
- 独立验收：本机 CodeX 独立审查入口未返回可引用 verdict，本轮按自验收记录。
- 清单：补齐 REQ-087/AC13 的撤销声明可操作基础；声明编辑、跨视图异步刷新提示、支付记录对账和完整端到端验收仍待实现。本轮不扩大 PRD 勾选范围。

## Loop 42 · 当前月摘要 CSV 导出与预览（自验收）

- 分析：导出不能临时重新计价或读取会话详情，否则用户预览的当前视图会与下载结果不一致，也会扩大路径、账户与正文的暴露面。
- 执行：总览新增“导出当前月摘要”。用户须先查看字段与行数预览，之后才出现下载 CSV 的动作。导出仅消费已渲染的 `monthly_summary` 权威 DTO，逐行保留宿主/服务商、token、原币金额、`basis`、证据与价格方法、新鲜度、覆盖分母版本和 `monthly_summary/v1` 契约标识；不会跨币相加。
- 安全：未定归因以空金额 + `unresolved` 行显式导出，绝不补零；不导出会话正文、路径、账户标识和原始日志；来自外部日志的公式前缀字段会以单引号转义，避免 CSV 被表格软件执行。
- 验收：`node --check`、带 `metered_estimate`/`unresolved`/公式前缀的 CSV 契约脚本、desktop 单元测试 100/100、desktop Clippy（`-D warnings`）及 `git diff --check`通过。
- 独立验收：已启动只读 Codex 审查，但运行结束时未返回可读取 verdict 或结果路径；本轮仍按自验收记录，不把该审查视为通过。
- 清单：补齐 REQ-126 当前视图 CSV 与导出前字段预览的基础；脱敏诊断包、导出范围选择、原始价格版本、保留期和完整隐私设置仍待实现。本轮不扩大 PRD 勾选范围。

## Loop 43 · 本地导入数据保留期设置（自验收）

- 分析：权威库已有每日维护清理，但固定为最近 13 个自然月，用户看不到也无法调整；仅在前端展示输入框而不接入 `sync_facts` 会形成虚假的隐私控制。
- 执行：新增原子持久化的保留期配置，缺省保持兼容的 13 个月，允许 1–60 个月。例行 `sync_facts` maintenance run 读取该值计算 SQL 权威事实清理下界；设置页明确说明保存不立即删除数据，下一次维护才生效，且不会触碰宿主原始日志。
- 保护：配置损坏或不可读时同步明确失败，不回退到默认值后静默清理；范围校验在桌面 IPC、运行时写入和读取三层生效。无日期事实仍遵循既有规则保留，不因设置窗口被悄悄删除。
- 验收：新增 retention 模块三项测试（默认兼容、保存/范围、损坏 fail-closed），并新增两项 `sync_facts` 集成回归（保存的窗口实际清理过期事实、损坏配置在维护前阻断同步）；runtime Clippy、desktop 单元测试 100/100、desktop Clippy、`node --check`及 `git diff --check`通过。
- 独立验收：已启动只读 Codex 审查，当前尚未返回可引用 verdict；本轮暂按自验收记录，不将其计为通过。
- 清单：补齐 REQ-127 保留期可见、可修改和应用到权威清理的基础；首次保留期说明、清理前统计/确认、删除连接/已导入数据分离及完整隐私设置仍待实现。本轮不扩大 PRD 勾选范围。

## Loop 44 · 自定义宿主根目录选择与正常同步接入（自验收）

- 分析：空记录状态只有“查看数据源”，标准扫描之外也没有受控的目录选择路径；仅添加按钮而不让选中的目录复用既有 adapter 同步，会形成无法导入的假入口。
- 执行：空记录页改为“选择其他位置”，跳转到数据源页。数据源页允许通过原生目录选择器按 Claude Code、Codex 或 DSH 添加宿主根目录；配置仅保存宿主和绝对根路径。同步时将自定义根由原有宿主 scanner 枚举、合并到同一宿主批次后排序去重，继续走原有解析、事实 ID 与权威生命周期，而非另写日志格式解释。
- 保护：添加时拒绝未知宿主、相对路径和不存在目录；读取时配置损坏或不可读会明确阻断同步，不会回退默认后静默部分导入。移除只移除读取配置，界面明确已导入数据保持不变。
- 验收：自定义配置 round-trip/非法输入 2 项、真实 Claude 自定义根同步 1 项、损坏配置 fail-closed 1 项、`node --check`、desktop 单元测试 100/100、desktop Clippy `-D warnings` 与 `git diff --check`均通过。
- 独立验收：已启动只读 Codex 审阅；运行未返回可读取 verdict 或结果路径，故不计为通过，本轮按自验收记录。
- 清单：补齐 REQ-010“选择其他位置”及 REQ-012“目录选择器添加”的基础链路；最近30天优先导入、按来源暂停/排除、删除本 App 已导入数据及完整端到端验收仍未完成，因此不勾选完整条款。

## Loop 45 · 单宿主读取排除与恢复（自验收）

- 分析：已有全局自动同步暂停，不能替代用户对单一来源的排除；排除与“删除本 App 已导入数据”可逆性不同，不能用同一个无确认操作混淆。
- 执行：新增原子持久化的单宿主排除配置，数据源卡可“停止读取此来源”，被排除卡明确显示“已排除”并提供“恢复读取”。同步在文件扫描前移除被排除宿主，恢复读取后才触发新同步；既有导入数据仍显示且不被删除，宿主原始日志从不修改。
- 保护：配置在取得机器身份、数据库打开、检查点迁移和保留期维护之前即验证；配置损坏/不可读会 fail-closed，避免先维护写入、再报读取范围不可信。排除状态优先于全局暂停和上次同步失败，避免状态误导。
- 验收：来源控制 round-trip/非法宿主、排除宿主不被同步、两类损坏配置均在维护前阻断同步的定向回归，以及 `node --check`、desktop Clippy `-D warnings`、`git diff --check`通过；此前同一桌面库回归 100/100 通过。
- 独立验收：已启动只读 Codex 审阅；运行窗口结束时未返回可读取 verdict 或结果路径，故不计为通过，本轮按自验收记录。
- 清单：补齐 REQ-012 的“按来源排除/恢复读取”基础；删除本 App 已导入数据（需独立确认和审计）、按来源暂停粒度、最近30天优先/范围控制及完整端到端验收仍待完成，不勾选完整条款。

## Loop 46 · 删除单宿主已导入数据（自验收）

- 分析：删除“读取配置”、停止未来读取和删除本 App 已导入数据是三种不同动作；直接物理删除事实会破坏计费归因外键，而只软删除事实又会被来源指纹阻止恢复后重新导入。
- 执行：数据源卡新增明确确认的“删除已导入数据”。确认后先排除该宿主，再在权威库单一 `BEGIN IMMEDIATE` 事务中软删除其事实和会话，删除其工作流事件、运行时快照、路由证据和来源指纹；删除来源指纹后，用户显式恢复读取才会重新导入。界面明确不删除宿主原始日志。
- 隔离：操作不触及手工账单、计费声明、价格快照或其他宿主；已软删除事实同步清除来源/路由引用，避免外键阻碍或悬挂引用。若数据库清理失败，事务回滚；来源保持排除，避免立即重新导入用户刚要求移除的数据。
- 验收：两宿主夹具回归验证只清除目标宿主、另一个宿主事实与手工账单保持可见、目标来源指纹清除；desktop 单元测试 100/100、desktop Clippy `-D warnings`、`node --check`及 `git diff --check`通过。
- 独立验收：已启动只读 Codex 审阅；运行窗口结束时未返回可读取 verdict 或结果路径，故不计为通过，本轮按自验收记录。
- 清单：补齐 REQ-012 的“删除本 App 导入数据”基础；按来源暂停、最近30天优先/范围控制、删除前统计与完整端到端验收仍待完成，不勾选完整条款。

## Loop 47 · Codex 归因重放冲突修复（自验收）

- 分析：真机 16,951 条 `attribution_conflict` 是同源 Codex 重放的派生归属变化被逐事实误记为开放冲突；版本字段也被错误放入证据差异集合，未来版本升级会把全库事实误判为冲突。
- 执行：writer 将 `normalization_version`/`attribution_version` 改为仅作重分类门控。incoming 同时携带两个明确版本且至少一个不同，才在白名单内覆写九个派生归属列，并关闭该事实旧的开放归因冲突；同版本仅比较七个独立证据字段，仍以现有 `COALESCE` 保留真冲突。Codex emitter 升至 `provider-v0.12`，现有 `data replay-provider-evidence` 强制重放即可作为幂等回填入口。
- 不变式：事实身份、事件时间、四桶 token、来源、ingest run 均不更新；无版本的旧/手工 incoming 不触发重分类，防止 `Some → None` 擦除已有归属。聚合读面未改动，仍不依赖存量归属列。
- 验收：新增“v0.11→v0.12 重分类：派生列收敛、token 不变、无开放 issue”与“同版本证据差异：旧证据保留、开放 issue 存在”测试；data crate 全量 116/116、data/hosts Clippy `-D warnings`、Codex host 测试 46/46 与 `git diff --check`通过。
- 独立验收：已启动只读 Codex 审阅；运行窗口结束时未返回可读取 verdict 或结果路径，故不计为通过，本轮按自验收记录。
- 清单：修复 REQ-083/092/093 的归因冲突数据层阻断；真机执行 replay 回填、质量队列按可行动范围归并、待处理 UI 与 UAT 复验尚待完成，不勾选完整条款。

## Loop 48 · 预算提醒投递去重账本（自验收）

- 执行：新增独立的本地预算提醒投递账本，以统计周期、日/月范围、warn/over 阈值和预算配置修订作为稳定身份；同键只会原子领取一次投递许可。日提醒与月提醒、warn 与 over 分开计数，用户更新预算后以新修订重新判断。
- 保护：账本读写受跨进程 lease 保护，定时同步与手动同步不会同时取得同一许可；账本损坏、锁失败和非法周期均 fail-closed，绝不冒险重复提醒。静默期间调用方不得领取许可，避免把静默结束后的首次提醒提前消耗。
- 验收：通知账本 4 项定向测试、runtime 全量 246/246、runtime Clippy（`-D warnings`）及 `git diff --check`通过。
- 独立验收：已启动只读 Codex 审阅，但运行窗口结束时未返回可读取 verdict 或结果路径；本轮按自验收记录，不将其计为通过。
- 清单：仅完成 AC19/REQ-110 的持久化去重底座；系统通知权限、原生发送、通知点击直达范围、整周期静默和真机 UAT 仍未完成，不勾选完整条款。

## 当前进展总览 · 2026-09-12

- PRD 清单共有 237 项可勾选条目；目前完成并勾选 4 项（REQ-034、REQ-103、REQ-144、AC15），其余 233 项仍待实现或待完整验收。该比例反映的是“可交付 v1.0.0”的严格标准，不代表本轮已提交能力很少。
- 已完成 58 个工作循环；其中已提交的能力覆盖同步失败隔离、首次启动与无记录状态、可暂停自动解析、会话轨迹回归、数据源状态、空预算语义与来源标记、公共价目隔离、旧配置迁移降级、schema 升级安全、待确认套餐入口、未确认用量权威分组、独立计费声明持久化/撤销、有范围的修订链、保存前影响预览、重算任务和归因、账单录入/更正/CSV 导入、当前月摘要导出、可配置本地保留期、自定义宿主根目录选择与同步、单宿主读取排除、恢复与已导入数据删除、Codex 归因重分类冲突修复，以及预算提醒的持久化去重、系统通知接线和权限提示、双预算权威模型基础、计算口径、桌面状态入口、CLI 状态/配置入口、MCP 状态入口、工作台双预算表单与实时状态反馈。
- Loop 1–9 的已提交功能循环均经过独立子代理验收；Loop 10–47 经用户授权采用自验收。已知基线问题和环境依赖均保留记录，不以删除断言或跳过测试的方式掩盖。

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

## Loop 49 · 单宿主读取失败隔离补强（自验收）

- 修复：`sync-facts` 对单宿主解析/读取错误保留宿主级 `errors`，仍继续处理其他宿主；CLI 对部分失败返回非零退出并在 stderr 保留宿主名与原因。桌面端据此将对应来源标记为“需要处理”，显示失败范围、非新鲜数据提示和“重新同步”入口。
- 保护：失败来源不会显示为“无使用”或“已连接”；健康来源仍可完成导入。失败恢复沿用带 request id 的同步轮询，超时不会伪报成功。
- 验收：runtime 单宿主隔离回归、desktop 单元测试、desktop Clippy、工作台来源脚本、JavaScript 语法检查及 `git diff --check`通过。
- UAT：`UAT: AC15 walked  ✘`（真实机器上的权限错误注入及 CLI/桌面/MCP 三面 UAT 尚未执行，因此日志已记录 UAT: AC15 walked ✘，没有提前勾选 AC15）

## Loop 50 · 预算提醒系统通知接线（自验收）

- 执行：桌面同步完成后读取权威 SQL 预算结果，按日/月和 warn/over 首次跨越判定，调用本地投递账本去重后发送系统通知；通知动作只允许聚焦预算页，不携带原始路径或敏感日志内容。
- 保护：预算未设置、数据非 SQL、静默期间、预算结果不可用或通知权限/发送失败均不制造成功投递记录；点击动作不可用时不影响同步和预算数据。
- 验收：desktop 单元测试 102/102、runtime 全量 247/247、两侧 Clippy `-D warnings`、工作台来源脚本、JS 语法检查和 `git diff --check`通过。
- UAT：`UAT: AC19 walked ✘`；真实系统通知权限、首穿/静默/点击回预算页仍待真机走查，因此不勾选 AC19。

## Loop 90 · AC15 目录级权限失败补强

- 发现：真机级隔离 HOME 注入证明 `chmod 000 ~/.claude/projects/<dir>` 会被 `WalkDir.into_iter().filter_map(Result::ok)` 静默丢弃，错误宿主曾呈现为 `seen=0/errors=[]/EXIT=0`；因此撤销 AC15 的提前勾选。
- 修复：Claude、Codex、DSH、WorkBuddy 扫描器新增目录遍历错误报告；`sync-facts` 将发现错误合并到对应 `HostSyncReport.errors`，不阻断其他宿主，CLI 继续非零退出并保留宿主名、路径和原因。
- 复验：隔离 HOME + `chmod 000` 目录实测 `EXIT=1`，stderr 为 `sync-facts partial failure [claude-code]`，JSON 仅 Claude 有 discovery error，Codex/DSH/WorkBuddy 仍可继续；hosts 107 项测试、runtime discovery 测试和全 workspace `cargo check --release --all-targets` 通过。
- 边界：代码修复已完成，但桌面 `.app` 与 MCP 三面 Computer Use/UAT 仍需重新走查；AC15 暂不勾选。

## Loop 91 · AC15 三面失败隔离闭环

- 修复：MCP `data_status` 读取桌面 `state/last-sync.json` 的失败回执，向只读数据状态投影宿主级 `source_failures`、错误码和 `retry_sync`；绝对路径不进入 MCP 响应。
- UAT：`UAT: AC15 walked ✔`；隔离 HOME + 目录级 `Permission denied` 已完成 CLI、桌面、MCP 三面走查。CLI 返回 `EXIT=1`；桌面显示 Claude Code `permission_denied` 与“重新同步”；MCP envelope 的 `data.health=warn`，Claude 为 `needs_attention`，Codex/DSH/WorkBuddy 未被连带标红。
- 对拍：MCP `data_status` 仍保持 `facts=0` 的诚实空库语义，同时明确报告同步故障，不把空库渲染成“无使用且健康”。
- 结论：AC15 重新勾选；其余 AC 仍按各自 UAT 边界处理。

## Loop 51 · 预算提醒权限提示（自验收）

- 执行：保存预算时请求系统通知权限，并把权限结果反馈到预算设置状态；设置文案明确提醒不会阻止 Agent 继续使用。
- 保护：预算保存不因通知权限不可用而失败；发送失败仍由投递账本保持可重试且不伪造成功记录。
- 验收：desktop 单元测试 102/102、desktop Clippy `-D warnings`、JS 语法检查及 `git diff --check`通过。
- UAT：`UAT: AC19 walked ✘`；仍待真实系统权限和通知交互走查。

## Loop 52 · 双预算/多币种权威模型基础（自验收）

- 执行：权威库 schema 13 新增 `budget_profiles`，固定支持 `estimate`（按量估算观察）与 `confirmed`（已确认按量支出）两个 profile；每个 profile 独立保存币种、月预算、可选日预算和告警阈值。旧单行 CNY `budget_config` 保留，供兼容迁移和现有消费面继续运行。
- 保护：profile id、三位 ASCII 币种、正月预算、正日预算和 0–100% 阈值在数据层校验；读取按 profile id 稳定排序，USD 与 CNY 不可能在同一 profile 内混存。
- 验收：data crate 全量 117/117、data Clippy `-D warnings`、schema 12→13 迁移回归及 `git diff --check`通过。
- 边界：本轮只完成权威模型与迁移；预算计算、CLI/MCP 输出和工作台双表单尚未接入，因此不勾选 REQ-035/036。

## Loop 53 · 双预算计算口径接入（自验收）

- 执行：新增公共 profile 预算金额聚合函数；`estimate` 只读取 `MeteredEstimate`，`confirmed` 只读取 `MeteredActual` 与 `HostBilled`，并要求条目的 currency 与 profile 完全一致。
- 保护：固定订阅、API 等价值、其他币种和未知 profile 均不进入计算；金额最终按最小货币单位整数舍入，避免跨币或跨口径相加。
- 验收：新增 CNY/USD 与 basis 隔离回归；runtime 定向测试通过，runtime Clippy `-D warnings`通过。
- 边界：profile 尚未接入 SQL 状态 DTO、CLI/MCP 和工作台设置表单，不勾选 REQ-035/036。

## Loop 54 · 双预算统一状态入口（自验收）

- 执行：新增 runtime `budget_profiles_status_sql_at`，从权威库读取两个 profile，输出独立币种、预算、已用金额、比例、阈值、level、coverage 和 freshness；桌面注册窄 IPC `budget_profiles_status`，不在前端拼 SQL 或重复计算。
- 保护：状态 DTO 复用同一月度摘要与 profile 计算函数；无库/坏库返回 unavailable，不生成零预算结果。
- 验收：runtime 定向 profile 测试、desktop 全量 102/102、runtime/desktop Clippy `-D warnings`通过。
- 边界：CLI/MCP 和工作台双表单尚未消费该 DTO，不勾选 REQ-035/036。

## Loop 55 · 双预算 CLI 查询与配置入口（自验收）

- 执行：`budget-sql profiles` 读取统一 profile 状态 DTO；`budget-sql profile-set` 支持明确选择 `estimate`/`confirmed`、币种、月预算、可选日预算和阈值。旧 `config-set` 路径继续兼容。
- 保护：profile 写入复用 authority 层的 profile id、币种、正数金额和阈值校验；CLI 不自行汇率折算或跨口径求和。
- 验收：CLI crate `cargo check`、`budget-sql --help` 可见新动作、runtime profile 计算测试和 `git diff --check`通过。
- 边界：MCP 工具和工作台双预算表单尚未接入，不勾选 REQ-035/036。

## Loop 56 · 双预算 MCP 只读状态入口（自验收）

- 执行：新增只读 MCP 工具 `budget_profiles`，复用 profile 计算函数和统一 envelope，输出月度 profile、币种、金额、比例、阈值、coverage 与 freshness。
- 保护：仅开放查询，不开放预算写入或任意 SQL；月份参数严格校验，权威库缺失/损坏沿用 typed error，不返回伪造空预算。
- 验收：MCP schema/月份校验、工具注册与分发回归通过；runtime Clippy `-D warnings`通过。
- 边界：工作台双预算表单及端到端跨面 UAT 尚未完成，不勾选 REQ-035/036。

## Loop 57 · 工作台双预算表单（自验收）

- 执行：预算设置页新增“按量估算观察预算”和“已确认按量支出预算”两组表单；各自支持 CNY/USD、月预算、可选日预算和 0–100% 阈值，保存走 authority profile CRUD。
- 保护：表单金额为最小货币单位；profile id、币种、正数金额和阈值由后端再次校验；旧 CNY 兼容表单保留，双预算表单不互相覆盖。
- 验收：desktop 单元测试 102/102、desktop Clippy `-D warnings`、JS 语法、工作台来源回归与 `git diff --check`通过。
- 边界：双 profile 的真实用量跨菜单栏/总览/CLI/MCP 对拍及真机 UAT 尚未完成，不勾选 REQ-035/036。

## Loop 58 · 双预算实时状态与权限反馈（自验收）

- 执行：工作台 profile 表单显示统一 DTO 的当前 level/已用金额；保存 profile 时请求系统通知权限，并反馈权限结果。估算与已确认 profile 的保存动作互不覆盖。
- 保护：显示值来自 authority 状态入口，不在前端重算；权限请求失败不回滚预算保存，也不宣称通知已发送。
- 验收：desktop 单元测试 102/102、desktop Clippy `-D warnings`、JS 语法检查、来源工作台回归及 `git diff --check`通过。
- 边界：跨菜单栏/总览/CLI/MCP 的真实 profile 结果对拍和真机 UAT 尚未完成，不勾选 REQ-035/036。

## Loop 59 · 双预算每日口径补齐（自验收）

- 执行：双预算状态 DTO 与 MCP 查询均按当前北京日计算 `daily_spent_minor`、`daily_ratio_bp`、`daily_level`；估算/已确认 profile 继续按各自计费口径和币种隔离。
- 保护：未配置每日预算返回 `disabled`；已配置但当天无事实返回 `no_data`，不渲染为绿色零支出；月度字段和旧 `budget_config` 兼容入口不受影响。
- 验收：runtime 单元测试 249/249、desktop 单元测试 102/102、desktop Clippy `-D warnings`、JS 语法检查及 `git diff --check`通过。
- 边界：跨菜单栏/总览/CLI/MCP 的真实 profile 结果对拍和真机 UAT 尚未完成，不勾选 REQ-035/036。

## Loop 60 · 未解决用量阻止预算伪绿色（自验收）

- 执行：双预算月度/每日状态检查对应币种是否存在未计价或冲突用量；存在时返回 `incomplete`，并隐藏确定性比例。桌面与 MCP 同步暴露 `has_unresolved` 和每日对应字段。
- 保护：未解决状态不被渲染成 `ok`，也不把不完整总额当作安全结论；无每日事实仍为 `no_data`，未配置日预算仍为 `disabled`。
- 验收：runtime 单元测试 249/249、desktop 单元测试 102/102、desktop Clippy `-D warnings`、工作台来源检查、JS 语法检查与 `git diff --check`通过。
- 边界：跨菜单栏/总览/CLI/MCP 的真实 profile 结果对拍和真机 UAT 尚未完成，不勾选 REQ-035/036。

## Loop 61 · 双预算 profile 原生提醒接线（自验收）

- 执行：系统通知优先读取双 profile 状态，按估算/已确认、币种、日/月周期分别判断阈值；同一 profile 的配置修订进入去重版本，通知点击仍直达预算工作台。
- 保护：profile 状态为空时回退旧 `budget_config`；存在未解决用量时不发确定性提醒；静默和投递失败继续由原子去重账本保护，不重复吞掉提醒。
- 验收：desktop 单元测试 102/102、runtime 单元测试 249/249、desktop Clippy `-D warnings`、JS 语法、来源契约检查与 `git diff --check`通过。
- 边界：真实 macOS 通知权限、首穿/静默/点击路径尚未真机走查，不勾选 AC19 或 REQ-035/036。

## Loop 62 · 菜单栏双预算分栏展示（自验收）

- 执行：`Overview` 携带统一双 profile 状态，菜单栏预算行按 profile、币种和月度口径并列展示；估算与已确认、CNY 与 USD 均不做跨口径/跨币求和。
- 保护：profile 状态存在时优先显示 profile 分栏，空 profile 时保留旧预算行；`incomplete`、`no_data`、`disabled` 使用明确文本，不以绿色安全结论替代缺失或不完整数据。
- 验收：desktop 单元测试 103/103（含菜单栏分栏回归）、Clippy `-D warnings`、runtime 249/249、JS 语法、来源契约检查与 `git diff --check`通过。
- 边界：真实 macOS 通知权限、首穿/静默/点击路径及跨入口真机 UAT 尚未完成，不勾选 AC19 或 REQ-035/036。

## Loop 63 · 未解决状态按 profile 口径隔离（自验收）

- 执行：`has_unresolved` 现在按 profile 对应的 billing basis 判断：估算只检查 `MeteredEstimate`，已确认只检查 `MeteredActual`/`HostBilled`，并继续按币种隔离。
- 保护：一个 profile 的未计价或冲突事实不会错误污染另一个 profile；相关 profile 仍降级为 `incomplete` 并隐藏确定性比例。
- 验收：runtime 专项测试通过、desktop 单元测试 103/103、desktop Clippy `-D warnings`、`git diff --check`通过。
- 边界：真实 macOS 通知权限、首穿/静默/点击路径及跨入口真机 UAT 尚未完成，不勾选 AC19 或 REQ-035/036。

## Loop 64 · 全仓验收回归修复（自验收）

- 执行：修复 DSH 集成价目表未与 `assets/pricing.json` 字节同步的问题；补齐工作台 KPI 验证器 mock 的 `dataset`、`sessionStorage` 与 `append` 能力，使其覆盖真实首启/预算渲染路径。
- 验收：价目表 lockstep 3/3、KPI/决策脚本通过；Python 全套 1130 项中除该两项外通过，原有 201 项因未配置 Rust 二进制而跳过；失败已不再复现。
- 保护：不改用户数据和未跟踪文档；集成价目表继续由共享资产作为唯一源，验证器仍执行真实 `workbench.js`。
- 边界：Python/Rust 双实现对拍需设置 `AGENT_VITALS_BIN`，真实 macOS 通知权限与真机 UAT 仍未完成，不勾选 AC19 或 REQ-035/036。

## Loop 65 · Release Q14 计费证据契约收口（自验收）

- 执行：Q14 验收夹具明确区分“provider_id=openai”与“官方订阅路由及适用 scope 证据”；缺少后者时 Codex 保持 `MeteredEstimate + unresolved`，同名模型仍按宿主/provider 分桶。
- 保护：不因模型名或单一 provider 标记推断实际订阅，不把 API 等价估算冒充真实账单；这与仓库 billing fallback 规则一致。
- 验收：Rust release workspace 全部通过；Q acceptance 8/8；Python 全套 1130/1130 通过（201 项按环境跳过）；此前价目表与工作台验证器回归均已通过。
- 边界：真实 macOS 通知权限、首穿/静默/点击路径及发布签名/公证、真机 UAT 仍未完成，不勾选 AC19 或 REQ-035/036。

## Loop 66 · Python/Rust 事实契约对拍收口（自验收）

- 执行：补齐 Python usage fact 的 `billing_template_id` 与 Codex `provider-v0.12` 版本；DSH 的 route evidence 只用于识别来源，不直接证明已结算，统一保守为 `metered_estimate`。同步修正 onboarding、summary 与 health 夹具对缺失官方订阅 scope 时 `unresolved/warn` 的预期。
- 保护：不放宽 `subscription` 归类，不将缺 route evidence 伪装成 `api_equivalent` 或健康绿色；跨语言字段顺序、版本和计费口径保持一致。
- 验收：带 release CLI 的 Python 全套 1130/1130 通过（8 项按环境跳过）；Rust release workspace、Q14、双实现专项对拍及工作台 KPI 验证器均已通过。
- 边界：真实 macOS 通知权限、真机 UAT、签名/公证仍未完成，不勾选 AC19 或 REQ-035/036。

## Loop 67 · 用户主动脱敏诊断包（自验收）

- 执行：工作台帮助区新增“保存脱敏诊断包”；用户通过原生保存对话框选择路径，后端仅组合数据状态、来源状态、同步、保留期、预算和 profile 元数据，不读取会话正文、绝对路径、账户标识，也不执行上传。
- 版本：诊断包同时记录 App、authority schema、查询 envelope 和当前价格目录版本，方便升级与问题定位，不把版本信息混入业务金额。
- 保护：取消保存不写文件；诊断包显式带隐私声明和固定契约版本，写入失败返回可见错误；原有 CSV 当前视图导出保持不变。
- 验收：桌面端 Rust 单元测试 103/103、Clippy `-D warnings`、JS 语法检查、工作台 KPI/决策验证器通过。
- 边界：真实 macOS 保存对话框与干净机安装仍需真机复验；诊断包不会自动提交，暂不勾选 REQ-142 或 AC20。

## Loop 68 · macOS RC bundle 构建与资源签名前置（自验收）

- 执行：运行 `cargo tauri build --bundles app` 生成 arm64 `agent-vitals.app`；验证 `Info.plist`、桌面可执行文件、随包 CLI、数据质量/Trace/价格状态 IPC 和静态资源均存在。
- 发现与处置：Tauri 默认 linker ad-hoc 签名未封入 app 资源，首次 `codesign --verify --deep --strict` 失败；对本次本地测试产物执行 ad-hoc 重签后复验通过，资源封签包含 `Resources/bin/agent-vitals` 与图标。
- 保护：仅修改 `target/` 下的忽略构建产物，不改仓库源文件；ad-hoc 签名不冒充 Developer ID，也不代表已完成公证。
- 边界：Developer ID/notarization、Intel 架构、干净机安装与升级演练仍待发布环境真实验收，不勾选 REQ-135 或 AC24。

## Loop 69 · 会话宿主筛选真机 UAT 回归（自验收）

- 发现：工作台点击“Codex”后仍显示 Claude Code；CLI 同条件 `--host-kind codex` 正确返回纯 Codex，定位为 Tauri IPC 对该参数使用 camelCase 后静默落入可选参数缺省。
- 修复：工作台 `sessions_list` 改传 `host_kind`，保持后端公开参数名一致；分页、月份窗口和其它筛选逻辑不变。
- 验收：缺陷已通过真实工作台复现；CLI 同条件返回 56 个纯 Codex 会话。修复后的 macOS `.app` 已重建，JS/桌面测试和参数静态回归通过；由于 accessory 应用在当前已有实例/无可见窗口时无法被 Computer Use 重新打开，修复后点击复验保留待下一次可见窗口启动。
- 边界：provider/model/计费状态筛选及修复后真机点击复验尚未完成，不勾选完整 REQ-067 或 DETAIL-01。

## Loop 70 · 会话模型筛选权威链路（自验收）

- 执行：会话查询新增精确 `model` 条件，从工作台输入框透传到 Tauri、CLI、MCP 与 authority SQL；缺失模型统一按 `<unknown>` 过滤，未在前端对已加载页面做假筛选。
- 保护：模型条件参与窗口聚合、窗口总量和会话数计算，分页 cursor 仍基于同一过滤窗口；宿主、月份和小时语义不变。
- 验收：authority model filter 回归、MCP sessions_search、CLI/desktop 编译检查、JS 语法和工作台来源断言通过。
- 边界：provider、计费状态、日期快捷范围/排序及修复后真机点击复验仍待完成，不勾选完整 REQ-067 或 DETAIL-01。

## Loop 71 · 会话 provider 筛选权威链路（自验收）

- 执行：会话查询新增精确 `provider` 条件，从工作台输入框透传到 Tauri、CLI、MCP 与 authority SQL；缺失 provider 证据统一按 `<unknown>` 处理。
- 保护：provider 条件参与事实聚合、窗口总量和会话数计算，不在已加载页面上做假筛选；模型、宿主、月份和分页语义保持不变。
- 验收：authority provider filter 回归、MCP/CLI/desktop 编译检查、JS 语法和工作台来源断言通过。
- 边界：计费状态、日期快捷范围/排序及修复后真机点击复验仍待完成，不勾选完整 REQ-067 或 DETAIL-01。

## Loop 72 · 会话日期快捷范围权威链路（自验收）

- 执行：会话页新增本月、今天、最近 7 天和自定义日期范围；日期范围从工作台透传至 Tauri、CLI、MCP，并由 authority SQL 使用同一 `[start, end)` 北京时间窗口聚合。
- 保护：自定义范围要求成对日期且禁止起始日晚于结束日；窗口总量、会话数和分页均在同一范围内计算，小时下钻仍只接受单日窗口。
- 验收：JS/桌面/CLI 编译检查、MCP 回归、工作台来源断言通过；release CLI 对真实库的 `2026-09-08..2026-09-10` 范围对拍返回 35 个 Codex 会话，当前页 5 个且无其它宿主。
- 边界：计费状态、排序、跨入口真机点击复验及完整 DETAIL-01 仍待完成。

## Loop 73 · 会话计费状态筛选（自验收）

- 执行：工作台新增按 `cost_status.state` 的计费状态筛选（按量估算、订阅、未计价、成本不可用）；筛选针对已加载的权威会话 DTO，不以金额是否为空推断状态。
- 保护：原始分页数据不被破坏，状态筛选显示匹配数与原始会话数；无匹配时使用明确空态，不伪造零成本或绿色状态。
- 验收：JS 语法、工作台来源断言通过；状态枚举与 MCP `sessions_search` 输出保持同源。
- 边界：服务端按状态分页筛选、按估算金额排序及修复后真机点击复验仍待完成；因此不勾选完整 REQ-067。

## Loop 74 · REQ-073 Issue L0 归并层（P1 自验收）

- 执行：data crate 新增纯函数 `normalize_issue_object` 与 `issue_groups` L0 投影；按 rule、host、归一化 object、evidence class、北京日桶分组，返回稳定 group id、状态汇总、时间范围、样本证据、remedy 和分页 cursor。
- 保护：原始 `issue_instances` 不被改写；跨 rule/宿主不合并；组列表不把原始命中数组整包返回；`closed/wontfix` 仅投影为 resolved/not_applicable，不把用户确认等同客观修复。
- 验收：归一化覆盖命令、路径、描述和权限族；4 条夹具命中归并为 3 组；L0 分页稳定；data crate 120/120、Clippy 和 `git diff --check`通过。
- 边界：P2 来源统一、L1/L2 明细读取、工作台接入、五态 IPC/动作和真机队列验收仍待完成，不勾选 REQ-073–080 或 AC18。

## Loop 75 · REQ-073 Issue L1/L2 按需展开契约（自验收）

- 执行：在同一 group key 之上新增 `issue_group_instances(group_id, page_size, cursor)` 与 `issue_instance(issue_id)`；L1 只返回指定组的原始命中分页，L2 返回单条权威详情及解析后的 metadata。
- 保护：调用方只能使用稳定 `group_id` 匹配组，不能提交原始拼接键；不存在的 group/issue 不返回伪造数据；原始 authority 行和状态不被修改。
- 验收：5 个 Issue 测试通过，覆盖组内两条命中分页、单条详情和不存在 ID；data crate 全量 120/120、Clippy、`git diff --check`通过。
- 边界：P2 来源统一、工作台 L0/L1/L2 接入、五态 IPC/动作和真机队列验收仍待完成，不勾选 REQ-073–080 或 AC18。

本日志只记录已经完成的实现和证据；上述“尚未完成”不改变任何 PRD 勾选状态。任何单次修改连续测试失败超过5次，或任何单次Loop超过30分钟，立即暂停并记录；不得以拆分日志规避熔断。

## Loop 76 · REQ-073 P2 来源统一投影（自验收）

- 执行：`issue_groups_with_sources` 将 `issue_instances`、未解决 `data_quality_issues`、待确认 `billing_import_candidates` 和源文件错误投影到同一分页组列表；每组保留 `source_kind`，行为规则与数据/计费来源不跨族合并。
- 保护：待确认候选明确标记 `is_bill=false`，不写入 `host_bills`；未知/缺失金额不转成零；数据层只读查询，不改变四张权威表。预算阈值仍由 runtime 预算计算负责，未在此层伪造。
- 接入：桌面 `sessions_issues` 改读统一组投影，UI 继续使用兼容字段，但 IPC 不再返回全部原始 `issue_instances` 数组；L1/L2 仍使用显式 group/issue 查询。
- 验收：data issues 6/6、data crate Clippy `-D warnings`、desktop `cargo check --lib`、`git diff --check`通过。
- 边界：桌面测试目标仍暴露既有 `list_args` 过时测试调用与 clippy 参数数量告警；未借本轮修改扩大范围。预算组、五态动作、真机 UAT 和完整 REQ-073–080 仍待完成，不勾选 AC18。

## Loop 77 · REQ-073 Issue 时间单位契约修复（自验收）

- 发现：旧行为 finding 的 `time` 按宿主出现秒/毫秒混用，直接写入 `opened_at_ms` 会造成 1970 日桶，并被毫秒时间窗静默排除。
- 修复：新增唯一边界函数 `to_epoch_ms`；新 Issue 写入和存量修复统一使用毫秒；`metadata_json.time` 与 `opened_at_ms` 同步，保留 DSH `date_span` 路径不变。
- 存量：`AuthorityDb::open` 执行幂等修复；仅修正 `<1e11` 的旧行，不删除 Issue、不改变 Issue 身份。重复执行第二次改动 0 行。
- 验收：毫秒/秒/边界值、日桶、存量同步与幂等测试通过；data issues 8/8、runtime 编译与 clippy、desktop `cargo check --lib`、`git diff --check`通过。
- 边界：真实用户库的修复前后数量与三条页面抽查仍需真机 UAT；不勾选 AC18 或完整 REQ-073。

## Loop 78 · REQ-077 五态迁移边界（自验收）

- 执行：补齐 `open ↔ later/acknowledged/closed/wontfix` 的合法迁移矩阵；新增桌面 `issue_transition` IPC，用户动作只写 Issue 生命周期和 `issue_status_transitions`。
- 保护：`acknowledged` 不等于 `closed`；命令限制目标状态和理由长度，固定 actor/evaluator 证据，不执行 shell、不修改宿主文件；非法迁移由事务回滚并返回错误。
- 验收：`later` 与 `acknowledged` 历史行回归通过；data issues 8/8、desktop 103/103、两 crate clippy 与差异检查通过。
- 边界：IPC 尚未接入 L0/L1 桌面按钮，自动关闭和声明成功后的完成回写仍待实现；因此不勾选 AC18 或 REQ-077/078/079。

## Loop 79 · REQ-073 L0/L1/L2 桌面待处理队列（自验收）

- 执行：桌面待处理页默认展示统一 Issue 组；新增 `issue_groups_list`、`issue_group_instances`、`issue_instance_read` IPC。点击展开才按组读取原始命中，避免恢复全量数组。
- 状态：实例行接入 `later / acknowledged / closed / wontfix` 用户动作；动作经 `issue_transition` 写入权威 `issue_status_transitions`，已确认不会变成已解决。
- 保护：组列表与实例读取均为只读；无效 group/issue 明确报错；动作不执行 shell、不改宿主文件；待确认计费候选仍保持非账单语义。
- 验收：workbench JS 语法、desktop 103/103、desktop clippy `-D warnings`、`git diff --check`通过。
- 边界：L1 当前首批 50 条，组内继续分页按钮、L2 独立详情面板、自动关闭、预算阈值/异常增长族和真机点击验收仍待完成；不勾选完整 REQ-073–080 或 AC18。

## Loop 80 · REQ-074 预算阈值族投影（自验收）

- 执行：待处理队列复用权威 `budget_status_sql_at`，仅 `warn/exceeded` 生成 `BUDGET_THRESHOLD` 组；预算分子、比例和币种仍由现有预算计算提供。
- 保护：预算组标记 `read_only=true`，不伪造 `issue_instances`、不提供虚假的原始命中关闭动作；预算值保持 minor 整数与现有按量口径，不把订阅或 USD 静默并入 CNY。
- 接入：预算组与行为/数据源组共用 L0 排序和呈现，但通过 `source_kind=budget` 在展开时显示预算状态说明。
- 验收：预算 warn/exceeded 组投影单测、workbench JS 语法、desktop 104/104、clippy `-D warnings`、data issues 8/8、差异检查通过。
- 边界：异常用量增长族、预算设置/静默快捷动作、自动关闭和真机 UAT 仍待完成；不勾选完整 REQ-074/REQ-078 或 AC18。

## Loop 81 · REQ-111 异常用量增长证据投影（自验收）

- 执行：新增 `USAGE_GROWTH` 只读组，按 `host + provider_id + billing_mode` 分别聚合日 token；最近有效日仅与前 7 个有效日的中位数比较，阈值为 2 倍。
- 保护：基线不足 7 个有效日不报警；不同宿主、provider 或计费口径不相加；忽略删除事实和 legacy aggregate；不产生虚假金额或订阅结论。
- 证据：告警携带 `comparison_range=previous_7_valid_days`、`baseline_days`、中位数、观测值、覆盖状态和计费口径，便于用户判断而非只展示红色严重度。
- 验收：8 日夹具触发单一增长组并验证 7 日基线；data crate 124/124、Clippy、desktop 编译、JS 语法、差异检查通过。
- 边界：增长阈值产品配置、通知去重/静默和真机提醒仍待完成；不勾选 REQ-111 或完整 REQ-074。

## Loop 82 · REQ-078 可自动验证 Issue 关闭（自验收）

- 执行：legacy finding 重评估后，在同一 machine/session/host/evaluator 范围内，将本轮不再出现的 `open` 或 `acknowledged` Issue 转为 `closed`，并写入 `issue_status_transitions`。
- 保护：当前仍出现的 Issue 保留；用户选择 `later` 的事项不被后台关闭；其它评估器、宿主和问题族不受影响；关闭理由固定为重评估未再观察到。
- 验收：回归覆盖 current/absent/deferred 三条实例，结果分别为 open/closed/later；runtime 全量 249/249、Clippy、差异检查通过。
- 边界：声明类事项需在声明成功应用后完成、持续观察事项的“验证中”展示，以及完整 REQ-078 真机验证仍待完成。

## Loop 83 · Issue 队列真机 UAT 复验（Computer Use）

- UAT：`REQ-073/077 L0 walked ✔`；重启安装后的 `.app` 可打开工作台，Issues 页面加载统一数据，显示规则汇总与明细入口。
- UAT：`REQ-073 L1 walked ✔`；展开第一组后能读取实例 `fnv1a64:c7a8cccc52ffeac7`，状态为 `open`，并显示“详情 / 稍后 / 已确认 / 已解决 / 不适用”入口；未点击状态变更，避免污染真实本地 Issue 状态。
- UAT：`REQ-073 L2 walked ✘`；Computer Use 点击“详情”后未稳定显示权威 metadata，尚不能证明独立详情面板/详情回读闭环。
- 结论：L0/L1 有真实界面证据，但不勾选完整 REQ-073–080 或 AC18；L2 详情读取与完整五态真机验收仍待修复/复验。

## Loop 84 · Issue L2 详情首屏可见性修复（自验收）

- 修复：L2 详情点击后先使用 L1 已返回的实例字段渲染块级详情，再异步调用 `issue_instance_read` 补齐权威行；IPC 失败会在同一详情块显式标注，不再出现空白或仅有短暂 loading。
- 保护：初始详情只复用权威 `issue_group_instances` 返回的数据，不猜测金额、状态或 metadata；独立 IPC 回读成功后覆盖为完整权威详情。
- 验收：`node --check apps/desktop/src-tauri/ui/workbench.js`、`git diff --check`、桌面 crate release 测试 104/104、clippy、`.app` release 构建和本机 ad-hoc 安装通过。
- 边界：安装后菜单栏进程正常存活，但 Computer Use 未重新取得可见工作台窗口；L2 真机点击需在窗口可见后复验，不勾选 AC18。

## Loop 85 · Issue L2 详情真机复验（Computer Use）

- UAT：`REQ-073 L2 walked ✔`；通过 `--show-workbench` 启动已安装 `.app`，Issues 页面显示 503 条发现，展开首条实例后点击“详情”，稳定显示完整权威详情 JSON。
- 证据：详情块包含 `issue_id`、`host_kind=claude-code`、`rule=SV603`、`status=open`、`evidence`、`opened_at_ms` 和 `metadata`；未点击“稍后 / 已确认 / 已解决 / 不适用”，本地状态未被测试改变。
- 启动：新增显式 `--show-workbench` 开关，允许已有同步回执的菜单栏应用在真机 UAT 时打开工作台；默认启动行为保持不变。
- 结论：L2 详情读取闭环已通过真实界面证据；五态动作、分页和其它 AC 仍按各自边界继续，不因此勾选 AC18 或完整 REQ-073–080。

## Loop 86 · Issue 稍后与恢复真机闭环（Computer Use）

- 修复：非 `open` 的实例现在显示“恢复待处理”；`later / acknowledged / closed / wontfix` 均可通过同一 UI 入口迁移回 `open`，不再让“稍后”或“不适用”成为不可恢复的终点。
- UAT：`AC18 partial walked ✔`；冷启动新安装 `.app` 后，将首条实例置为“稍后”，组汇总显示“待处理 1 · 稍后 1”；再点击“恢复待处理”，汇总恢复为“待处理 2”。
- 保护：测试未执行宿主修复、Shell 或其它外部动作；仅写入本地 Issue 状态迁移历史，最后恢复为原始 `open` 状态。
- 验收：桌面 release 测试 105/105、Clippy、`node --check`、`git diff --check`、`.app` 重建、ad-hoc 安装和 Computer Use 真机路径通过。
- 边界：提醒去重/定时策略、完整五态逐态验收、其它 REQ-073–080 与 AC18 完整门槛仍待继续，不勾选 AC18。

## Loop 87 · 套餐候选稍后抑制跨重启（Computer Use）

- 修复：套餐候选“稍后”由仅当前 WebView 会话的 `sessionStorage` 改为带时间戳的 30 天抑制窗口；过期自动清理并重新提示。对 WebView 存储不可用场景保留 `sessionStorage` 回退，不改变候选的待确认/非账单语义。
- UAT：`AC28 partial walked ✔`；新安装 `.app` 的总览可见“有套餐信息待你确认”，点击“稍后”后关闭提示；退出并冷启动 `.app`，首屏截图不再显示套餐确认卡，当前估算仍保留。
- 保护：未接受套餐、未创建账单、未改变任何计费归因；仅记录本地提醒抑制时间。
- 验收：`node --check`、`git diff --check`、桌面 release 测试 105/105、Clippy、`.app` 重建、ad-hoc 安装和 Computer Use 冷启动复验通过。
- 边界：尚未等待真实 30 天验证自然过期；候选仍可从待处理/确认入口回看，AC28 完整跨 CLI/MCP 对拍仍待完成，不勾选 AC28。

## Loop 88 · 预算本周期静默真机闭环（Computer Use）

- 修复：预算提醒不再固定静默 24 小时；工作台调用权威桌面命令，将 budget_snoozes.until_ms 写到北京时间当前自然月结束，按钮文案和回执统一为“本周期”。
- UAT：AC19 partial walked ✔；新安装 .app 显示“本周期静默提醒”，点击后回执显示“静默至本周期结束”，预算状态进入静默；随后点击“恢复预算提醒”清除测试静默，状态恢复。
- 保护：金额、预算分子、通知投递账本和用量事实未改写；测试只写入并立即清除预算静默单行。
- 验收：北京时间月界线单测通过，桌面 release 测试 106/106、Clippy、node --check、git diff --check、.app 重建、ad-hoc 安装和 Computer Use 真机路径通过。
- 边界：真实系统通知权限、阈值首穿通知去重和通知点击回预算页仍未完成完整 UAT，不勾选 AC19。

## Loop 89 · L0 问题分组分页与证据脱敏修复（自验收）

- 修复：问题分组查询对 `usize::MAX` 采用明确的无限量语义，不再因统一 `clamp(1, 500)` 静默丢失第 501 条之后的分组；桌面 Issues 改为每页 50 条并提供“加载更多”，总数和规则汇总仍基于完整集合。
- 修复：L0 分组键和 `evidence_class` 优先使用结构化 `metadata.category`，仅在缺失时回退 `metadata.evidence`；样本中的 evidence/path/file_path/source_path 路径字段默认脱敏，L2 主动详情读取链路保持不变。
- 回归：data crate 问题分组测试 2/2、desktop release 测试 106/106、desktop clippy `-D warnings`、workbench JS 语法和 `git diff --check` 通过。
- 边界：本轮修复解决验证报告中的 P0/P1 代码问题；真实数据上的计费重算链与双预算账单链仍需单独使用安全副本完成端到端证据，不因此勾选 AC18/AC19/AC28 或相关完整 REQ。

## Loop 92 · 双预算口径隔离真机验收（Computer Use 安全副本）

- UAT：在隔离 `HOME`/`AGENT_VITALS_HOME` 启动 release `.app`，分别保存“按量估算观察预算”10,000 分 CNY 与“已确认按量支出预算”20,000 分 CNY；界面分别显示两条独立预算及各自 `no_data · 已用 0 CNY`。
- 对拍：隔离 SQLite 的 `budget_profiles` 同时存在 `estimate/CNY/10000` 与 `confirmed/CNY/20000` 两行；旧单预算表 `budget_config` 未写入，证明两种口径没有覆盖或混算。
- 保护：测试仅写入 `/tmp` 安全副本，没有改写真实用户数据、用量事实或账单；金额仍按最小货币单位保存，未将订阅或 USD 并入 CNY。
- 结论：双预算设置与持久化隔离通过安全副本真机验收；预算首穿通知、账单录入及完整 AC19/REQ-074/REQ-078 仍不因此勾选。

## Loop 93 · 候选到计费声明的证据链修复（自验收）

- 修复：总览“确认计费方式”现在先明确接受待确认候选，再将 `candidate_id` 写入声明及不可变修订；此前 UI 传入 `null`，导致候选与声明失去可追溯关联。
- 失败保护：声明保存失败时尽力将候选恢复为 `pending`；声明已经落库后不再回滚候选，避免预览读取失败制造“已声明但候选待确认”的半状态。
- 验收：`node --check apps/desktop/src-tauri/ui/workbench.js`、`git diff --check` 通过；数据层计费影响预览与重算幂等测试各 1/1 通过。
- 边界：因本轮 Computer Use 运行时 macOS 已锁屏，尚未重新走桌面点击；候选声明 UI 真机复验和端到端安全副本回执仍待下一轮，不勾选 AC27/AC13。

## Loop 94 · 声明修订写入原子性修复（自验收）

- 修复：桌面 `save_billing_declaration_revision` 不再先调用独立的当前声明写入，再写不可变修订；当前声明由 `billing_declaration_revision_save` 的同一事务物化，修订校验或 scope 失败时不会留下孤立声明。
- 验收：desktop release 编译、desktop lib 测试（106 个测试目标，当前筛选无 lib 测试执行）、desktop clippy `-D warnings`、workbench JS 语法和 `git diff --check` 通过。
- 边界：锁屏导致桌面 Computer Use 仍未复验；候选接受与声明保存目前仍是两个 IPC 动作，下一步需补原子候选→声明命令及真机回执，不勾选 AC13/AC27。

## Loop 95 · 待确认候选到声明的原子事务（自验收）

- 修复：数据层 `billing_declaration_revision_save` 现在允许匹配的 `pending` 候选在同一事务内转为 `accepted`，并把 `candidate_id` 写入声明修订；候选不存在、宿主/服务商不匹配或 scope 校验失败时整笔事务回滚。
- 回归：新增 pending 成功与失败回滚测试；计费影响预览、desktop 编译/clippy、workbench JS 语法和差异检查通过。
- 边界：这消除了 UI 两步写入的半状态风险，但 macOS 当前仍锁屏，尚未完成候选确认→预览→入队→worker→刷新 Computer Use 证据；AC13/AC27 仍不勾选。

## Loop 96 · 原子候选事务进入 release 构建（自验收）

- 构建：重新生成 release `.app` 并在隔离 `HOME`/`AGENT_VITALS_HOME` 启动；隔离库中的 UAT 候选保持 `pending`，未因打开提示或失败点击被误接受。
- 真机状态：Computer Use 已重新取得工作台，但确认面板在滚动区域下方；本轮滚动/屏幕捕捉遇到 macOS ScreenCaptureKit 瞬时错误，未取得“确认→预览→入队→worker→刷新”的点击证据。
- 结论：release 包包含 Loop 95 的原子事务修复；桌面端到端回执仍待下一次稳定的 Computer Use 操作，不勾选 AC13/AC27。

## Loop 97 · 候选确认面板刷新竞争修复（自验收）

- 修复：总览刷新不再无条件关闭“确认旧套餐信息”面板；用户打开面板后，后台数据刷新只更新候选列表并保留当前打开状态；“稍后”会显式关闭并记录抑制窗口。
- 验收：`node --check apps/desktop/src-tauri/ui/workbench.js`、release `.app` 重建通过；隔离候选仍可见且未发生未经点击的状态变化。
- 边界：Computer Use 滚动复验再次遇到 ScreenCaptureKit 捕捉错误，尚未取得候选确认面板内的点击回执；AC13/AC27 仍不勾选。

## Loop 98 · 工作台 Vite 热更新开发入口（工程改进）

- 接入：新增 `apps/desktop/ui-dev` Vite 开发壳，根目录仍指向现有 `src-tauri/ui`；Tauri `dev` 模式使用 `127.0.0.1:5173/workbench.html`，发布构建继续读取静态 `ui/`。
- 保护：没有迁移或重写现有 IPC/DOM 契约；当前原生 HTML/JS/CSS 可先获得 CSS HMR 与页面自动刷新，React 组件可按页面逐步迁移。
- 验收：`npm install --ignore-scripts`、`npm run build`、Vite dev server + `curl /workbench.html`、Tauri 配置 JSON、`git diff --check` 通过。
- 边界：本轮只建立开发基础设施，未声称完整 React 迁移或替代最终 `.app` 真机验收。

## Loop 99 · Tauri + Vite 开发链路实跑（自验收）

- 修复：校正 `beforeDevCommand` 的工作目录，使用 `npm --prefix ui-dev run dev`；此前配置会把路径解析到 `apps/ui-dev`，导致 Tauri dev 在启动前退出。
- 验收：`cargo tauri dev --no-watch -- -- --show-workbench` 成功启动 Vite (`127.0.0.1:5173`) 与 Rust debug 进程；Vite 页面访问和此前 `npm run build` 均通过。
- 边界：开发二进制没有被 Computer Use 的应用列表识别为独立 bundle，本轮未声称完成开发窗口视觉 UAT；发布 `.app` 仍需单独验收。

## Loop 100 · 套餐确认面板可访问状态与收起操作（自验收）

- 修复：候选确认按钮新增 `aria-controls`/`aria-expanded` 状态；确认面板标题提供明确“收起”按钮，收起后焦点返回主按钮。
- 保护：面板状态仍由单一 `billingReviewOpen` 管理，后台刷新不会清掉打开状态；无候选或“稍后”后会同步恢复 `aria-expanded=false`。
- 验收：workbench JS 语法、Vite 构建和 `git diff --check` 通过；保留键盘焦点指示与可读按钮名称，符合 UI/UX 可访问性检查。
- 边界：尚未在最终 `.app` 完成完整候选确认链点击回执，不勾选 AC13/AC27。

## Loop 101 · 候选读取失败不吞面板状态（自验收）

- 修复：`billing_import_candidates` 临时读取失败时不再用空候选覆盖当前面板；只有明确成功且返回空数组时才关闭面板。这样后台异常不会把用户正在查看的候选误判为已消失。
- 验收：release `.app` 重建成功；新按钮在 AX 树中显示 `(collapsed)` 与 `Secondary Actions: Expand`，说明可访问状态已进入最终包。
- 真机边界：Computer Use 本轮点击“确认套餐信息”和“稍后”均只改变焦点、未触发 WebView 事件；该输入通道异常仍待设备/窗口重新聚焦后复验，不勾选 AC13/AC27。

## Loop 102 · 发布候选全量回归门禁（自验收）

- 回归：`python3 -m unittest discover tests -v` 共 1188 项通过，208 项按既有环境条件跳过；未出现失败。
- 对拍：`AGENT_VITALS_BIN=target/release/agent-vitals python3 tests/golden_runner.py --diff` 的 15 个 case 全部与 golden 逐字节一致。
- Rust：`cargo test --release` 全量通过；`cargo clippy --release --all-targets -- -D warnings` 通过。
- 工作区：差异仅保留用户已有的 WorkBuddy/Phase 文档，未修改、未暂存；本轮没有因此勾选尚未完成真机或外部发布门禁的 AC。
- 边界：AC13/AC27 套餐确认点击回执、AC21 系统时区、AC18/AC19 完整真机验收，以及签名/公证和外部试用仍待完成。

## Loop 103 · 套餐确认改为保存前只读预览（代码验收）

- 修复：候选确认不再先保存声明再预览；第一步调用只读 `billing_candidate_impact_preview`，展示受影响 tokens、facts、sessions，第二次明确确认后才写入声明。
- 保护：候选 dry-run 不创建修订、不接受候选、不改变汇总；数据层新增 prospective preview 回归，验证 scope 交集和“零修订写入”。
- 验收：data 定向测试、desktop release 测试 106/106、desktop Clippy、workbench JS 语法、Vite build、`git diff --check`、`.app` release bundle 均通过。
- 真机边界：重打包后的 Computer Use 检查因 macOS 锁屏无法进行；AC27 仍不勾选，待解锁后复验两步点击与重算回执。

## Loop 104 · 套餐提示补齐影响范围与确认收益（代码验收）

- 修复：候选读取结果现在携带当前月只读影响摘要；总览提示和候选行显示受影响 tokens、事实数、会话数，并明确“当前按原厂价估算、确认后可区分订阅覆盖与额外按量费用”。
- 保护：影响摘要只读查询，不接受候选、不创建声明、不改变账本；读取失败按候选级别降级，不把缺失影响编成零。
- 验收：data/desktop release 测试、desktop Clippy、workbench JS 语法、Vite build、`git diff --check` 和最新 `.app` bundle 构建通过。
- 真机边界：设备仍锁屏，未声称 AC26/AC27 真机完成；待解锁后复验提示内容及两步确认链。

## Loop 105 · 影响摘要失败态不冒充零（代码验收）

- 修复：候选级影响查询失败时返回 `status=unavailable`；总览不再把缺失候选累加成 `0 tokens`，而是显示“影响范围暂不可用”，候选行同样显式提示检查数据状态。
- 验收：data 定向测试、desktop Clippy、workbench JS 语法、Vite build、`git diff --check` 和最新 `.app` bundle 均通过。
- 边界：macOS 仍锁屏，AC26/AC27 真机点击与重算回执继续等待设备解锁后验证。

## Loop 106 · 影响摘要候选级降级（代码验收）

- 修复：单个候选的影响查询失败时返回 `impact.status=unavailable`；总览聚合显示“影响范围暂不可用”，不把缺失候选当作 0 tokens，候选行也保留失败原因方向。
- 验收：data 定向测试、desktop Clippy、workbench JS 语法、Vite build、`git diff --check` 和最新 `.app` bundle 均通过。
- 边界：系统时区/夏令时仍是未完成的独立 AC21 工作包；AC26/AC27 真机点击仍待设备解锁。

## Loop 107 · Vite 浏览器样式调试闭环（开发工具增强）

- 修复：Vite 开发服务器现在仅在 `serve` 模式注入浏览器 Tauri mock；可直接打开 `http://127.0.0.1:5173/workbench.html` 调整 CSS/HTML，并保留 HMR/整页刷新。mock 数据明确标注为浏览器调试数据，不写入本地数据库。
- 保护：生产构建和正式 `.app` 不注入 mock，仍使用真实 Tauri IPC；现有 DOM/JS 结构不因样式调试被改写，也未引入 React 重写范围。
- 验收：Vite build、mock JS 语法检查、浏览器实际加载总览与会话页通过；总览显示 246K/374K 级 token、预算状态和数据质量提示，会话页显示“浏览器样式调试会话”，未见读取失败。
- 边界：浏览器 mock 只验证布局与交互表现；SQLite、系统目录、真实 IPC 及 AC13/AC27/AC21 仍须在最终 `.app` 中验收。

## Loop 108 · 权威库不可用状态的恢复入口（代码验收）

- 修复：桌面 `data_status` 现在区分 `database_missing`、`database_unreadable`、`schema_too_new` 和 `schema_migration_required`，并返回稳定的 `recovery_action`；不再把所有失败压成同一条模糊文案。
- 修复：总览质量横幅按错误码显示明确状态，并提供“重试同步 / 导出诊断 / 安装新版本后重试”等安全入口；损坏库不会自动删除、重建或伪装成零用量。
- 验收：desktop release 测试目标编译通过，Workbench JS 语法检查与 `git diff --check` 通过。
- 边界：完整磁盘满、旧库升级和干净机恢复演练仍属于 AC20 真机/发布环境 UAT，尚未勾选 AC20。

## Loop 109 · Vite 构建目录隔离（开发工具增强）

- 修复：Vite 的构建输出和缓存固定到 `apps/desktop/ui-dev/dist` 与 `.vite-cache`，不再写入 `apps/desktop/src-tauri/ui`，样式迭代后的工作树保持干净。
- 验收：Vite production build、mock JS 语法检查和 `git diff --check` 通过；Tauri UI 源目录未重新生成 `dist/`。

## Loop 110 · 日历 Token / 成本视图切换

- 修复：Token 日历增加 `Tokens` 与“成本（按来源口径）”切换；成本视图按 CNY/USD 分列，保留 token 副行和来源口径说明。
- 保护：无成本证据显示“成本不可用”，不渲染为 0；原始事实、价卡和后端计价逻辑不变。
- 验收：Workbench JS 语法、Vite build、`git diff --check` 通过；浏览器实际切换两个视图，成本视图出现 CNY/USD 数值且无读取失败。
- 边界：完整 AC07 历史缺价三态和 AC21 系统时区仍未完成。

## Loop 111 · 日历日期格键盘可达性

- 修复：非未来日期格增加按钮语义、Tab 焦点、可读 `aria-label`，支持 Enter/Space 打开对应的按小时面板；月份合计增加 `aria-live` 更新提示。
- 验收：Workbench JS 语法、Vite build、`git diff --check` 通过；浏览器实测日期格可聚焦，Enter 操作成功打开“当日按小时”。
- 边界：完整 AC22 的读屏、200% 字号和最小窗口矩阵仍需专门验收。

## Loop 112 · Workbench 跟随系统明暗主题

- 修复：工作台增加 `prefers-color-scheme: light` 主题变量和控件色彩覆盖；默认深色方向保持不变，系统切换到浅色时面板、文字、边界和状态色同步调整。
- 保护：主题层不改变金额、时间窗、计价或数据状态；浅色覆盖保留“无数据/诊断”标签的可读对比度。
- 验收：Vite build、Workbench JS 语法检查、主题规则静态检查和 `git diff --check` 通过。
- 边界：真实 macOS 外观切换和完整 AC22 读屏/200% 矩阵仍需真机验收。

## Loop 113 · 价格来源与参考估算解释

- 修复：数据源行补充面向用户的价格状态说明：原厂价格卡、官方价参考估算、当前价参考估算，以及“付费路由待确认”等原因。
- 保护：只消费后端已有的 `pricing_method` / `unresolved_reason`，不在前端重算价格；参考估算不标成历史真实账单。
- 验收：Workbench/开发 mock 浏览器实测显示“当前价参考估算 · 付费路由待确认”，同时保留正常“原厂价格卡”状态；Vite build、JS 语法检查和 `git diff --check` 通过。
- 边界：完整 AC07 的真实历史缺价、当前价参考和完全缺卡数据矩阵仍待权威库 fixture/UAT。

## Loop 114 · 窄窗口与减少动态效果

- 修复：WorkBench 在约 200% 字号对应的窄 CSS 视口下允许顶部导航换行、卡片单列、日历合计独占一行，主体保持纵向滚动；增加 `prefers-reduced-motion` 全局动画/过渡降级。
- 验收：浏览器以 512×700 视口实测，刷新操作仍可见、主体 `overflow-y:auto`，无关键入口被裁切；Vite build、JS 语法检查和 `git diff --check` 通过。
- 边界：真实辅助技术读屏和 macOS 200% 显示设置仍需真机验收，不勾选完整 AC22。

## Loop 115 · 预算系统通知默认隐私收口

- 修复：预算提醒系统通知不再包含已用金额、预算金额、币种或 profile 名称；正文只保留“今日/本月 + 阈值 + 点击查看原因与明细”，点击后由预算页展示完整组成。
- 保护：通知仍通过既有 `focusTab=budget` 深链进入预算页；投递去重、静默、未解决用量和发送失败语义不变，系统通知不会成为金额或路径的旁路泄露。
- 验收：新增通知正文隐私回归测试；desktop 定向测试、`git diff --check`通过。
- 边界：真实 macOS 通知权限、首穿/重复重算/点击回预算页的完整 Computer Use UAT 仍待设备可操作后执行，不勾选 AC19；REQ-113 仅完成默认预算通知正文这一子项。

## Loop 116 · 停用预算不触发通知授权

- 修复：兼容预算表单的月预算和日预算均为 0 时，保存动作不再请求 macOS 系统通知权限；至少启用一个预算周期时才进入权限申请流程。
- 保护：预算写入、通知去重、静默和“提醒不会阻止 Agent 继续使用”语义不变；权限结果仍只作为保存回执，不会把预算保存与通知发送混为一体。
- 验收：desktop 定向测试、Clippy `-D warnings` 与 `git diff --check`通过。
- 边界：双 profile 的真实权限弹窗与 AC19 完整首穿/静默/点击 Computer Use UAT 仍待设备可操作后执行。

## Loop 117 · 双预算无数据状态不伪装为零

- 修复：工作台双预算状态按权威 `level` 分态渲染；`no_data` 显示“无数据”，`incomplete` 显示已知用量下界并说明仍有未覆盖用量，只有确定性状态才显示“已用”金额。
- 保护：不改变预算计算、币种隔离或未解决用量判定；避免 `spent_minor` 缺省值 0 在界面上制造绿色安全结论。
- 验收：真实 `workbench.js` 的 KPI/状态验证器通过（含 no_data/incomplete/ok 三态）、JS 语法检查与 `git diff --check`通过。
- 边界：完整 AC10/REQ-038 的跨入口真机与 CLI/MCP 对拍仍需在安全副本中继续执行。

## Loop 118 · 历史缺价三态文案补齐

- 修复：工作台价格来源说明新增 `no-price-card` 与 `no-pricing-snapshot` 映射，分别显示“没有匹配的原厂价格卡”和“历史缺少事件时间的价格快照”；存在未解决用量但无金额时仍保留“价格暂不可用”说明。
- 保护：参考估算继续区分官方价与当前价，不把当前价写成历史官方价格；不改变权威计价、token 或账单数据。
- 验收：真实 Workbench KPI 验证器、JS 语法检查、Vite production build 与 `git diff --check`通过。
- 边界：AC07 的真实历史缺价/当前价/完全无卡数据矩阵仍需安全副本真机与 CLI/MCP 对拍。

## Loop 119 · 待处理队列预算组分页边界

- 修复：`sessions_issues` 注入只读预算阈值组时，先为合成行预留分页槽位，默认每页不再返回 51 条；`next_cursor` 与来源组 offset 保持一致。
- 保护：`page_size=1` 时预算组独占首项，下一页从来源组 offset=0 继续，避免预算行挤掉首个来源组；原始 issue 权威表和只读投影不变。
- 验收：desktop store 测试 14/14、Clippy `-D warnings` 与 `git diff --check`通过。
- 边界：REQ-073/074 的完整跨来源真机数量、L0 P95 和六族 UAT 仍待真实数据环境验收。

## Loop 120 · 待处理状态使用规范五态名称

- 修复：待处理 UI 的“已解决/不适用”动作改为提交规范状态 `resolved/not_applicable`；权威数据层同步接受规范状态并记录关闭时间，旧 `closed/wontfix` 继续兼容已有历史数据。
- 保护：`acknowledged` 仍独立于解决；状态汇总统一映射到 `resolved/not_applicable`，恢复待处理仍可从两类已结束状态返回 `open`。
- 验收：desktop store 测试 14/14、data issues 定向测试 9/9、Clippy `-D warnings`、JS 语法检查与 `git diff --check`通过。
- 边界：真实待处理队列五态点击、自动关闭和 AC18 Computer Use UAT 仍需在可操作桌面环境执行。

## Loop 121 · 待处理状态迁移按钮补齐

- 修复：待处理明细不再把 `later/acknowledged` 限制为只能恢复 `open`；现在按权威合法迁移展示直接的“稍后/已确认/已解决/不适用”操作，已结束状态保留恢复入口。
- 保护：UI 只选择权威层允许的目标状态，不绕过事务、状态迁移记录或五态语义；“已确认”仍不等同于“已解决”。
- 验收：真实 Workbench KPI 验证器覆盖 `later` 与 `acknowledged` 动作矩阵，JS 语法检查与 `git diff --check`通过。
- 边界：真实待处理五态点击回执、状态转移历史及 AC18 Computer Use UAT 仍待可操作桌面环境执行。

## Loop 122 · 预算阈值组直达预算设置

- 修复：Issues 中的只读预算阈值组展开后新增“打开预算设置”入口，自动切回总览、滚动到预算设置并聚焦输入框；不再要求用户自行寻找处理位置。
- 保护：预算组仍不能作为普通 Issue 关闭，预算金额与比例继续只读来自权威状态；静默动作仍由预算设置页显式执行。
- 验收：真实 Workbench KPI 验证器、JS 语法检查、Vite production build 与 `git diff --check`通过。
- 边界：真实预算组点击、通知首穿/静默和 AC19 Computer Use UAT 仍待可操作桌面环境。

## Loop 123 · 待确认候选正确归入待处理状态

- 修复：统一问题投影将 `billing_import_candidates.status=pending` 映射为规范五态中的 `open`；此前候选组虽有 `count=1`，但 `status_rollup.open` 错误为 0。
- 保护：候选仍保持 `is_bill=false` 和只读投影，不写入行为 Issue 或账单表；其他 `resolved/not_applicable` 兼容映射不变。
- 验收：data issues 定向测试 9/9、data crate Clippy `-D warnings`通过；同时补充回归断言锁定候选组 `status_rollup.open=1`。
- 边界：REQ-074 六族真实数据覆盖与 AC18 的五态 Computer Use UAT 仍待真实环境执行。

## Loop 124 · 来源投影组展开与处理入口

- 修复：待处理页对 `billing_candidate`、`source_failure`、`data_quality`、`usage_growth` 等只读来源投影不再错误调用行为 Issue 的 L1 查询；展开时显示来源证据摘要和投影计数，并提供计费确认、数据源或会话入口。
- 保护：来源权威表保持只读且彼此不合并；投影组明确不能按行为 Issue 关闭，避免“暂无原始命中”掩盖真实来源证据。
- 验收：真实 Workbench KPI/状态验证器、JS 语法检查、Vite production build 与 `git diff --check`通过。
- 边界：来源投影的完整 L1/L2 权威明细接口、六族真实数据覆盖和 AC18 Computer Use UAT 仍待后续阶段。

## Loop 125 · Issue 旧状态别名界面归一

- 修复：行为 Issue 明细行和详情将历史 `closed/wontfix` 统一显示为“已解决/不适用”，并在操作矩阵中按规范 `resolved/not_applicable` 处理；`pending` 也统一按待处理语义展示。
- 保护：仅改变用户界面翻译和动作选择，不改写历史状态值；权威层的兼容读取与规范新写入保持不变。
- 验收：真实 Workbench KPI/状态验证器覆盖旧别名归一、动作矩阵，JS 语法检查与 `git diff --check`通过。
- 边界：真实五态点击回执、迁移历史验证和 AC18 Computer Use UAT 仍待可操作桌面环境。

## Loop 126 · 待处理规则摘要会话数修正

- 修复：`issue_group_rollup` 不再用各组内重复的 `0..n` 伪键汇总会话，改为按 `group_id` 隔离计数；同一规则下多个问题组的 `sessions` 不再互相覆盖而被低估。
- 保护：该字段仍是组级影响会话数的汇总，不改变原始 Issue、分组键或权威状态；命中数与五态状态汇总逻辑不变。
- 验收：新增跨组会话回归测试（2 组/5 个会话），desktop 定向测试与 Clippy `-D warnings`通过。
- 边界：跨规则同一会话的全局去重仍需在统一 DTO 设计中明确，AC18 真机 UAT 尚未执行。

## Loop 127 · 待处理规则摘要严重度取最高值

- 修复：规则级待处理摘要现在按组内最高严重度汇总；同一规则同时存在 warning 与 critical 时，不再因遍历顺序把摘要降级为 warning。
- 保护：严重度仍只表示规则/证据等级，不转译为已确认损害；原始组严重度、命中数、会话数和状态记录不变。
- 验收：新增 warning→critical 跨组回归测试；desktop 定向测试 2/2、Clippy `-D warnings` 与 `git diff --check`通过。
- 边界：跨规则同一会话的全局去重、完整严重度排序 UAT 和 AC18 Computer Use 验收仍待后续执行。

## Loop 128 · 全量回归与发布前静态门禁复验

- 验证：根 workspace `cargo test --release`、桌面 crate release 测试、Python `unittest` 1188 项、Rust/Python golden 15 个 case 逐字节对拍均通过；随后根 workspace `cargo clippy --release --all-targets -- -D warnings`、`cargo build --release` 和桌面 crate release 测试再次通过（桌面 110 项）。
- 保护：本轮只验证既有实现，没有把“测试全绿”扩大解释为 AC21 系统时区、AC18/AC19 完整 Computer Use、签名公证或外部试用完成；用户已有 WorkBuddy/Phase/Issue 文档保持未修改、未暂存。
- 结论：当前代码回归基线稳定；下一项仍应处理 AC21/REQ-033 的系统统计时区纵切面，不能继续沿用北京时间作为最终产品口径。

## Loop 129 · 系统 IANA 时区时钟基础

- 实现：runtime 新增系统 IANA 时区识别、按指定时区把绝对 epoch 投影为统计日期，以及读取指定时刻实际 UTC 偏移的 helper；使用 Jiff 处理 macOS/Linux 系统设置、`TZ` 覆盖和 DST，不把系统统计时区用于供应商价格规则。
- 验收：runtime clock 定向测试 4/4 通过；覆盖系统时区日期格式、非法时区降级，以及 Los Angeles 2026 春季 DST 前后 `-08:00`/`-07:00` 偏移；`git diff --check`通过。
- 边界：统计 SQL 的日界/小时桶、可修改的用户偏好、Python/Rust/MCP/Workbench 同口径及 AC21 真机走查尚未接入；本轮不勾选 REQ-033、REQ-096 或 AC21。

## Loop 130 · 权威查询日界与小时桶切换

- 实现：`agent-vitals-data` 的 authority query 日桶/小时桶改用 SQLite `localtime` 的系统时区投影；日期/月窗口由系统 IANA 时区的民历午夜生成，跨 DST 的自然日不再假定固定 24 小时。供应商价格快照匹配仍按事件绝对时间，不因统计时区改变。
- 验收：authority query 定向测试 30/30 通过，包含 query-plan 索引断言、跨日聚合、小时下钻和 `America/Los_Angeles` 春季 23 小时自然日测试；`cargo check -p agent-vitals-data --release`通过。
- 边界：Python 镜像、MCP envelope/CLI、Workbench 日期显示与用户可修改时区尚未切换；旧 `beijing_*` API 名称暂作兼容入口，不据此勾选 REQ-033、REQ-096 或 AC21。

## Loop 131 · MCP 与 Python sessions 时区镜像

- 实现：MCP envelope/事件时间使用系统 IANA 时区格式化；Python `sessions_sql` 同步使用系统时区的 RFC3339、民历窗口和本地小时过滤，保留旧函数名仅作兼容，不再把 `+08:00` 当作统计口径。
- 验收：Rust MCP 定向测试 12/12、Python sessions 测试 27/27、runtime Clippy `-D warnings`、Python 编译检查和 `git diff --check`通过。
- 边界：CLI 默认日期、WorkBench 日期/日历显示、用户时区偏好持久化和真实跨入口 parity/UAT 尚未完成；REQ-033、REQ-096、AC21 继续不勾选。

## Loop 132 · CLI 默认统计日期切换到系统时区

- 实现：runtime 兼容的 `today_beijing/current_month_beijing` 入口内部改用系统 IANA 统计时区；Codex 重置时间的人读格式与 Python 镜像同步改用系统时区，避免日期已切换但重置时间仍按北京时间显示。
- 验收：Rust Codex cost 定向测试 16/16、Python CLI matrix 147 项（当前未设置 Rust binary 的 parity 用例按既有规则跳过）通过；runtime 编译无新增 warning。
- 边界：Workbench/菜单栏仍有前端 `beijingToday()` 固定 `UTC+8`，用户可修改时区偏好和完整跨入口 parity 尚未完成；不勾选 REQ-033、REQ-096 或 AC21。

## Loop 133 · Workbench 前端统计日期切换

- 实现：Workbench 保留 `beijingToday()` 兼容调用名，但内部使用浏览器系统 IANA 时区；Vite browser mock 的样例日期也改为同一系统日期，避免开发调试页与正式后端在非北京时间机器上跨日漂移。
- 验收：Workbench/tauri-mock `node --check`、KPI/状态验证器、Vite production build 与 `git diff --check`通过。
- 边界：前端尚未提供用户可修改的统计时区偏好；当前默认随 OS，供应商价格策略时区仍未与统计时区混用；不勾选 REQ-033、REQ-096 或 AC21。

## Loop 134 · Issue 投影移除固定 UTC+8

- 修复：行为 Issue 的日分组改用系统 IANA 时区；`usage_growth` 日桶改用 SQLite `localtime`，不再以固定 `+08:00` 计算；投影时间改为该桶实际最后一条事件时间，避免 DST 日生成虚假的固定午夜时间。
- 保护：原始 `event_ts_ms` 不变，供应商计价时区不参与统计分组；无效 epoch 仅走无时区数学退化路径，不把错误时间伪装成有效本地时间。
- 验收：data issues 定向测试 9/9、`TZ=America/Los_Angeles` usage-growth 专项测试 1/1、data crate Clippy `-D warnings`、`git diff --check`通过。
- 边界：用户可修改的统计时区偏好尚未持久化接入；其他 Python usage/旧 MCP 文案仍需继续审计；REQ-033、REQ-096、AC21 仍不勾选。

## Loop 135 · Python 状态日期跟随系统时区

- 修复：Python `state.py` 的 today/month/rotate 日期键和 epoch 日期投影改用 OS IANA 时区，移除统计状态层的固定 UTC+8 计算；`TZ` 覆盖、`/etc/localtime` 和系统 fallback 与 sessions/cost helper 保持同一解析顺序。
- 保护：仅改变统计日期归属，事件 epoch 毫秒和供应商峰谷计价规则不变；缺失/无效配置仍走明确 fallback，不把缺数据写成零。
- 验收：Python state/history 定向测试 36/36、Python 编译检查通过；Rust workspace 全量测试与 Python 全量 1188 项回归在本轮改动前的回归基线也均通过。
- 边界：统计时区用户偏好尚未持久化并接入所有查询入口；AC21 仍需跨入口真实切换和 Computer Use 验证。

## Loop 136 · Python 预算窗口跟随系统时区

- 修复：预算层的今日日期、snooze 当前时刻和无时区时间输入改用系统 IANA 统计时区；保留 `_BEIJING` 兼容符号，但生产计算不再读取固定 UTC+8。
- 保护：DSH 供应商峰谷定价仍由独立价格规则决定，统计时区变化不会改写供应商费率或历史事件时间。
- 验收：默认环境预算测试 30/30、`TZ=America/Los_Angeles` 预算测试 30/30、Python 编译检查与 `git diff --check`通过。
- 边界：Tauri 菜单栏时间显示、用户可修改的统计时区持久化和完整 Computer Use 验证仍待完成。

## Loop 137 · Tauri 菜单栏同步时间复用系统时区

- 修复：Tauri `overview` 的同步回执时间不再自行按固定 UTC+8 格式化，改复用 runtime 的系统 IANA 时间格式化；绝对 epoch 输入保持不变，菜单栏与工作台/查询层使用同一默认时区。
- 保护：旧函数名和日期兼容 API 保留，供应商价格时区不受影响；未实现用户自定义时区时仍明确使用 OS 默认值。
- 验收：独立 desktop release 测试 110/110、runtime/data 编译与 `git diff --check`通过。
- 边界：Tauri `today_beijing`、预算周期和用户可修改统计时区偏好仍需继续收口；AC21 尚未完成真实桌面 UAT。

## Loop 138 · Tauri 默认日期与预算月界切换

- 修复：Tauri `overview::today_beijing()` 兼容入口改用 runtime 系统统计日期；预算当前周期结束点改用 authority query 的系统时区自然月午夜，DST 月份不再固定减 8 小时。
- 保护：保留旧 API 名称以避免 IPC 断裂；日期/月界只影响统计窗口，不改变事件 epoch 或供应商计价规则。
- 验收：独立 desktop release 测试 110/110、`git diff --check`通过。
- 边界：Tauri 会话默认日期与最近会话年份显示仍有旧兼容实现待清理；用户可修改的统计时区偏好和真实 Computer Use UAT 尚未完成。

## Loop 139 · Tauri 最近会话与过期时间显示切换

- 修复：菜单栏过期提示的 `HH:MM` 和最近会话“是否当前年份”判断改用 runtime 系统时区格式化，不再自行加固定 8 小时；移除由此产生的 release dead-code warning。
- 保护：日期字段仍保留完整原始 `YYYY-MM-DD`，仅展示折叠规则随本地时区变化；事件时间与价格时区不变。
- 验收：独立 desktop release 测试 110/110、无新增编译 warning、`git diff --check`通过。
- 边界：用户可修改统计时区偏好仍未持久化；AC21 仍需真实切换后的跨入口 Computer Use 验证。

## Loop 140 · 统计时区偏好配置基础

- 实现：runtime 新增统计时区偏好模块，默认读取 OS IANA 时区；用户值按 IANA 名称校验后以原子方式保存到 `state/statistics-timezone.json`，缺失、损坏和未知时区均显式报错或回退，不接受任意字符串。
- 保护：该配置只属于统计窗口与本地展示，未接入供应商价格规则；当前尚未宣称“修改后全入口立即重算”。
- 验收：runtime 统计时区定向测试 3/3、runtime Clippy `-D warnings`、`git diff --check`通过。
- 边界：Tauri IPC/UI、CLI/Python 读取和 SQLite 查询运行时尚未接入此偏好；REQ-033、REQ-096、AC21 继续不勾选。

## Loop 141 · 统计时区偏好接入 Tauri 与 CLI

- 实现：CLI 启动和 Tauri setup 在首次统计查询前应用已保存的 IANA 时区；新增 Tauri 读取/保存 IPC，Workbench 设置页可编辑并保存统计时区，保存后刷新当前统计；Vite mock 同步提供该设置入口。
- 保护：配置只影响统计日/月/小时边界与本地展示，供应商价格/峰谷规则不随之改变；校验失败不会写入无效时区，旧配置缺失仍使用 OS 默认。
- 验收：desktop release 测试 110/110、runtime 时区测试 3/3、runtime Clippy `-D warnings`、Workbench Node 语法检查、Vite production build 与 `git diff --check`通过。
- 边界：仍需验证跨进程 Python/CLI 同一偏好、SQLite `localtime` 在运行时切换后的完整 parity，并执行真实 Computer Use；REQ-033、REQ-096、AC21 暂不勾选。

## Loop 142 · Python 查询入口复用统计时区偏好

- 修复：Python `codex_cost`、`sessions_sql` 与状态层统一读取 `state/statistics-timezone.json`；桌面设置页修改后的“今天/本月/会话导航”不再只依赖继承的 `TZ` 环境变量。
- 保护：保留旧 `today_beijing` / `current_month_beijing` 名称作为兼容入口；时区只改变统计窗口与展示，不改变事件 epoch 或供应商价格规则。
- 验收：隔离数据目录跨模块偏好对拍通过（`codex_cost` / `sessions_sql` 均解析为 `America/Los_Angeles`）；Python 全量回归、Rust workspace 回归与 Vite production build 通过。
- 边界：真实 `.app` 跨进程切换、SQLite `localtime` 运行时切换和 Computer Use 仍需验收；REQ-033、REQ-096、AC21 暂不勾选。

## Loop 143 · CLI 导航 envelope 回传实际统计时区

- 修复：Rust CLI `sessions navigation` 不再把 envelope 的 `timezone` 固定写成 `Asia/Shanghai`，改回传当前已应用的统计时区偏好；日期窗口和 token 聚合继续使用同一进程时区。
- 保护：事件 epoch 与供应商计价规则不变；配置损坏时 CLI 已在入口显式失败，不以错误时区冒充成功。
- 验收：待执行 CLI release 编译/测试、Rust workspace 回归与 `git diff --check`。
- 边界：真实 `.app` 跨进程切换、SQLite `localtime` 运行时切换和 Computer Use 仍需验收；REQ-033、REQ-096、AC21 暂不勾选。

## Loop 144 · 统计时区覆盖 Jiff 默认日界

- 修复：macOS 进程内 `TZ` 改变后，Jiff `TimeZone::system()` 仍可能保留 OS 时区；新增统计时区解析并用于 runtime 时钟、authority 日界、会话导航和 MCP 时间投影，避免配置只改变 envelope 而不改变“今天/本月”。
- 验收：重建 release CLI 后以隔离数据目录配置 `America/Los_Angeles`，`sessions navigation --json` 返回 `day_key=2026-09-12` 与 `timezone=America/Los_Angeles`；runtime clock 测试 4/4、authority query 测试 30/30、CLI Clippy 通过。
- 保护：仅影响统计边界/本地展示，事件 epoch 和供应商计价规则不变；旧配置缺失仍回退 OS 时区。
- 边界：SQLite `localtime` 跨进程/运行时切换的完整矩阵和真实 `.app` Computer Use 仍需验收；REQ-033、REQ-096、AC21 暂不勾选。

## Loop 145 · 统计时区连续切换回系统值

- 修复：`statistics_timezone::apply` 每次都显式同步有效 IANA 名称；从自定义时区切回 OS 时区时不再遗留上一轮进程级 `TZ`。
- 保护：`Etc/Unknown` 不写入无效覆盖；缺失配置仍由 OS 解析。事件 epoch、供应商价格策略和持久化事实不变。
- 验收：统计时区定向测试 3/3、desktop release 测试 110/110、runtime/data Clippy 通过；重建 release CLI 后已实测自定义时区下日期与 envelope 同步。
- 边界：真实 `.app` Computer Use、系统通知和外部发布门禁仍未完成；REQ-033、REQ-096、AC21 暂不勾选。

## Loop 146 · 桌面默认会话日期与导航参数跟随偏好

- 修复：桌面会话列表默认日期不再自行加固定 8 小时；菜单栏 spawn CLI 时不再传固定 `Asia/Shanghai`，改传当前统计时区偏好，避免自定义时区下导航进程直接失败。
- 验收：desktop release 测试 110/110、CLI/desktop Clippy 通过；重建 release 后已完成自定义时区导航回归，菜单栏子进程可使用 `America/Los_Angeles`。
- 边界：真实 `.app` Computer Use 和跨进程 SQLite 完整矩阵仍需验收；REQ-033、REQ-096、AC21 暂不勾选。

## Loop 147 · 发布候选重新打包与内置 CLI 验证

- 构建：`cargo tauri build --bundles app` 成功生成 `apps/desktop/src-tauri/target/release/bundle/macos/agent-vitals.app`；包内 `Contents/Resources/bin/agent-vitals` 为当前 release CLI，版本 `1.3.0`，应用版本 `0.11.0`。
- 验收：直接运行包内 CLI，在隔离数据目录配置 `America/Los_Angeles`，`sessions navigation --json` 返回 `day_key=2026-09-12`、`timezone=America/Los_Angeles`；新 `.app` 进程可启动。
- 保护：未覆盖现有用户数据；未把进程启动证据扩大为窗口可见或 Computer Use UAT。
- 边界：真实 `.app` 窗口交互、通知权限、签名/公证和外部试用门禁仍待完成；AC21/AC19 及发布门禁不勾选。

## Loop 148 · SQLite localtime 时区投影对拍

- 验收：同一 Unix 秒在 `TZ=Asia/Shanghai` 下投影为 `2026-09-13 02:00:00 / 2026-09-13`，在 `TZ=America/Los_Angeles` 下投影为 `2026-09-12 11:00:00 / 2026-09-12`；与已重建 CLI 的统计日界一致。
- 保护：仅验证 SQLite 本地投影，不改变原始 epoch；供应商峰谷计价仍使用其独立时区规则。
- 边界：仍需真实 `.app` 窗口 Computer Use、通知权限、签名/公证和外部试用；AC21 暂不勾选。

## Loop 149 · 发布候选安装验证

- 安装：将现有 `/Applications/agent-vitals.app` 可恢复移动为 `/Applications/agent-vitals.app.pre-v1.0.0-20260913`，再安装本轮构建的 release `.app`；没有覆盖旧包数据。
- 验收：安装后启动进程成功；Info.plist 为 `com.mixlabpro.agent-vitals-menubar` / `0.11.0`，内置 CLI 为 `1.3.0`；安装后的 CLI 在隔离配置下仍返回 `America/Los_Angeles` 与 `2026-09-12`。
- 边界：本轮只证明安装、启动和内置资源，未把不可见窗口启动扩大为 Computer Use；通知权限、签名/公证和外部试用仍待完成。

## Loop 150 · 发布前 golden 与前端门禁

- 验收：`AGENT_VITALS_BIN=target/release/agent-vitals python3 tests/golden_runner.py --diff` 的 15 个 case 全部逐字节一致；Vite production build 通过。
- 发现：仓库级 `cargo fmt --all -- --check` 仍报告既有未格式化 Rust 文件；本轮未运行 formatter 改写文件，避免制造无关大 diff。该检查不作为本轮代码改动的通过证据。
- 边界：真实 `.app` 窗口 Computer Use、通知权限、签名/公证和外部试用仍待完成；不因此勾选 AC19/AC21 或发布门禁。

## Loop 151 · 安装包 Computer Use 尝试

- UAT：`UAT: AC21 walked ✘`；使用安装后的 `/Applications/agent-vitals.app` 读取工作台状态时，Computer Use 返回 macOS 已锁定且自动解锁失败，未取得可用窗口或点击证据。
- 结论：不把进程启动、CLI 隔离验证或 SQLite 对拍扩大为真实桌面 UAT；AC21 继续不勾选，待用户手动解锁后复验。
- 边界：签名/公证、通知权限和外部试用门禁同样未完成。

## Loop 152 · CLI 导航放开有效 IANA 时区

- 修复：CLI `sessions navigation` 不再硬编码拒绝非 `Asia/Shanghai`；先校验 IANA 名称、应用显式时区，再计算缺省日期并回传 envelope。此前菜单栏传入自定义时区仍会被入口拒绝。
- 验收：CLI release 测试 79/79、CLI/desktop Clippy、desktop release 测试 110/110；重新打包并安装后，显式 `--timezone America/Los_Angeles` 返回 `day_key=2026-09-12` 且 envelope 回传该时区。
- 边界：真实窗口 Computer Use 仍因 macOS 锁定未完成；AC21、通知权限、签名/公证和外部试用门禁不因本轮 CLI/安装包验证而勾选。

## Loop 153 · MCP envelope 时区与统计口径统一

- 修复：MCP 成功与错误 envelope 的 `timezone` 改为复用实际统计时区，而不是只读取 OS 时区；自定义统计时区下，查询日界、时间格式和 envelope 声明不再互相矛盾。小时查询 schema 文案同步改为“配置的统计时区”。
- 验收：runtime MCP 定向测试与 Clippy 待执行；不改变事件 epoch 或供应商价格时区。
- 边界：真实 `.app` Computer Use、AC21 跨入口 UAT、签名/公证和外部试用门禁仍未完成。

## Loop 154 · 会话日期范围尊重 DST 自然日边界

- 修复：`sessions_search(date_from,date_to)` 不再用固定 24 小时拼接结束边界，直接复用包含 `date_to` 的下一自然日边界；夏令时 23/25 小时日期不会漏算或多算。
- 保护：单日、整月与供应商计价时区不变；原始事件 epoch 不变。
- 验收：runtime MCP 定向测试与 Clippy 待执行；需在非固定 UTC+8 的统计时区下补跨 DST 真机/安全副本对拍。

## Loop 155 · 发布包纳入 MCP 时区修复

- 构建：重新执行 `cargo build --release -p agent-vitals` 与 `cargo tauri build --bundles app`；安装包内 CLI 与最新 release CLI 二进制一致。
- 验收：安装后的包内 CLI 在 `--timezone America/Los_Angeles` 下返回 `day_key=2026-09-12` 和对应时区；新 `.app` 进程已启动。
- 保护：旧包可恢复保留为 `/Applications/agent-vitals.app.pre-v1.0.0-20260913-0230`；未覆盖用户数据。
- 边界：真实窗口 Computer Use 仍受 macOS 锁定阻塞；AC21、签名/公证和外部试用门禁不因此勾选。

## Loop 156 · MCP 时区协议文档收口

- 修复：MCP 规范不再把响应 `timezone` schema 限制为固定 `Asia/Shanghai`；明确它是实际使用的、经校验的统计 IANA 时区，并同步小时查询的 DST-aware 边界说明。
- 保护：示例仍可使用 `Asia/Shanghai` 作为示例值，但不再把示例误写成协议常量；供应商计价时区不受影响。
- 验收：实现侧 MCP 54/54 与 Clippy 已通过；本轮仅修正文档契约，未修改用户已有 WorkBuddy/Phase/Issue 文档。

## Loop 157 · 兼容导航入口去除固定时区限制

- 修复：`legacy-r2a` 兼容导航入口与当前 SQL 导航入口统一接受经过校验的 IANA 统计时区，并同步 CLI 帮助文本，避免备用构建路径仍拒绝自定义时区。
- 保护：该兼容入口不改变原始事件时间或供应商价格时区；生产默认入口行为不变。
- 验收：待 legacy-r2a 定向测试与 CLI release lint；不因此扩大 AC21 的真实桌面 UAT 结论。

## Loop 158 · CLI 兼容路径发布包复验

- 构建：重新执行 CLI release 构建和 Tauri `.app` 打包；安装包内置 CLI 与最新 `target/release/agent-vitals` 二进制一致。
- 验收：安装后的 CLI 自定义 `America/Los_Angeles` 导航返回 `day_key=2026-09-12`，新 `.app` 进程已启动。
- 保护：旧包可恢复保留为 `/Applications/agent-vitals.app.pre-v1.0.0-20260913-0234`；未覆盖用户数据。
- 边界：真实窗口 Computer Use 仍受 macOS 锁定阻塞；AC21、签名/公证和外部试用门禁不因此勾选。

## Loop 159 · 统计时区保存即时刷新托盘

- 修复：保存统计时区后，Workbench 原有的当前 tab 刷新之外，Tauri 现在立即重建菜单栏；菜单栏不再继续显示旧时区的今日/月度/会话投影直到下一次定时 tick。
- 保护：保存仍先校验并原子写入偏好，再应用进程时区；应用失败不会触发菜单重建。
- 验收：desktop release 测试与 Clippy 待执行；不把 IPC 单测扩大为真实 Computer Use 的 AC21 完成证据。

## Loop 160 · 时区即时刷新修复进入安装包

- 构建：桌面 release 测试 110/110、Clippy 通过后重新执行 Tauri `.app` 打包并安装。
- 验收：新安装包进程已启动；旧包可恢复保留为 `/Applications/agent-vitals.app.pre-v1.0.0-20260913-0242`。
- 边界：保存时区后的真实托盘点击/视觉证据仍受 macOS 锁定限制；AC21、签名/公证和外部试用门禁不因此勾选。

## Loop 161 · 时区切换重建托盘导航快照

- 修复：保存统计时区后，除立即重建菜单外，后台重新生成 `sessions navigation` 并写回 `hosts.json`，避免宿主今日 token/会话行继续沿用旧时区日界；导航在后台执行，不阻塞设置页。
- 保护：使用现有 20 秒有界导航超时与失败保留旧快照策略；时区保存失败不会启动刷新线程。
- 验收：desktop release 测试与 Clippy 待执行；真实菜单栏视觉点击仍受 macOS 锁定限制。

## Loop 162 · 时区托盘快照修复进入安装包

- 验收：desktop release 测试 110/110、Clippy 通过；重新执行 Tauri `.app` 打包并安装，安装后进程已启动。
- 保护：旧包可恢复保留为 `/Applications/agent-vitals.app.pre-v1.0.0-20260913-0248`；未覆盖用户数据。
- 边界：真实设置点击、托盘视觉刷新和 AC21 Computer Use 仍受 macOS 锁定限制；签名/公证和外部试用门禁继续未完成。

## Loop 163 · 兼容导航复用参数化 authority 查询

- 修复：`legacy-r2a` 导航 token 查询改用现有 `day_token_totals_by_host(data_home, date)`，不再忽略显式数据根并回读进程全局目录；隔离库与真实库的行为现在一致。
- 保护：统一复用 authority query 的只读打开、统计时区日界和缺失/真零语义，删除重复 SQL 入口。
- 验收：desktop release 测试与 Clippy 待执行。

## Loop 164 · 隔离数据根修复进入安装包

- 构建：CLI release 构建与 Tauri `.app` 重打包成功；安装包内置 CLI 与最新 `target/release/agent-vitals` 一致。
- 验收：新安装包进程已启动；旧包可恢复保留为 `/Applications/agent-vitals.app.pre-v1.0.0-20260913-0255`。
- 边界：真实窗口 Computer Use 仍受 macOS 锁定限制；AC21、签名/公证和外部试用门禁不因此勾选。

## Loop 165 · 发布候选签名与依赖门禁审计

- 审计：当前 `/Applications/agent-vitals.app` 为 arm64 thin 包；主程序与内置 CLI 均为 arm64，CLI 仅依赖 macOS `libSystem`，桌面主程序依赖系统 Framework，未发现缺失的外置运行库。
- 结果：`codesign --verify --deep --strict` 失败，包为 `adhoc/linker-signed`，无 Team Identifier；`spctl --assess --type execute` 同样失败并报告签名资源不完整。
- 结论：REQ-135/AC24 的 Developer ID 签名、公证与干净机器 Gatekeeper 验证仍未完成，不能用本地 ad hoc 签名或“能启动”替代；需要具备 Apple Developer 证书、公证凭据的发布环境后再验收。
- 边界：这是一项发布环境阻塞，不影响当前功能测试结论；真实窗口 Computer Use 仍受 macOS 锁定限制，AC21 与外部试用门禁继续不勾选。

## Loop 166 · Workbench 统计时区与热更新调试链路

- 修复：Workbench 首屏先读取后端持久化的统计时区，再生成今天、本月、最近 7 天及会话月份；保存时区后同步更新前端月份状态。小时详情提示改为显示实际统计 IANA 时区，不再写死“北京时间”。
- 调试：保留现有原生 HTML/CSS/JS IPC 面，Vite 仅作为开发服务器提供 HMR；浏览器 mock 可独立调样式，Tauri dev 继续验证真实 IPC，不为纯样式迭代引入一次性 React 迁移。
- 验收：`node --check apps/desktop/src-tauri/ui/workbench.js` 通过；`npm --prefix apps/desktop/ui-dev run build` 通过。构建器仅提示现有 classic script 不参与 bundling，未形成构建失败。
- 边界：尚未进行真实窗口视觉 Computer Use（macOS 仍锁定）；本轮不勾选 AC21/AC22，正式包签名/公证仍受发布凭据阻塞。

## Loop 167 · Workbench 时区修复进入安装包

- 构建：`cargo tauri build --bundles app` 成功；安装包内置 CLI 与仓库 `target/release/agent-vitals` 字节一致。
- 验收：旧包移至 `/Applications/agent-vitals.app.pre-v1.0.0-20260913-0251` 后安装新包，`--show-workbench` 进程已启动。
- 边界：仅完成构建/启动和静态证据，未把启动成功当作视觉 UAT；真实 Computer Use 仍需解锁 macOS，签名/公证仍未完成。

## Loop 168 · Workbench 时间展示统一统计时区

- 修复：预算快照时间、Codex 配额重置时间、Issue 时间和数据源最近日志时间统一使用后端配置的统计 IANA 时区格式化；避免查询按配置时区而展示按系统时区造成跨日/偏移。
- 验收：`node --check apps/desktop/src-tauri/ui/workbench.js`、Vite production build 与 `git diff --check` 通过；源码不再调用未指定时区的 `toLocaleString`/`toLocaleTimeString`。
- 边界：真实窗口视觉 Computer Use 仍因 macOS 锁定未执行；未以静态检查替代 AC21/AC22 真机验收。

## Loop 169 · 时间展示修复进入安装包

- 构建：重新执行 `cargo tauri build --bundles app` 成功；安装包内置 CLI 与仓库 release CLI `cmp` 一致。
- 验收：旧包移至 `/Applications/agent-vitals.app.pre-v1.0.0-20260913-025321`，新包以 `--show-workbench` 启动，进程已运行。
- 边界：当前包仍为 ad hoc 签名且无 Team Identifier；未以本地启动替代签名公证或真实 Computer Use 验收。

## Loop 170 · v1.0.0 全量自动回归基线

- Python：`python3 -m unittest discover tests -v`，1188/1188 通过；208 项按测试定义因未设置 Rust CLI、双实现差分或可选依赖而跳过，无失败。
- Rust：`cargo test --release` 全部通过，CLI 79、data 283、core 53 及 workspace 集成/性能/边界测试均通过。
- 结论：本轮没有刷新 golden/snapshot，也没有把跳过项当作通过；Python/Rust 双实现与真实桌面/发布环境门禁仍按各自证据单独处理。

## Loop 171 · 账单影响预览使用 DST-aware 月窗口

- 修复：Workbench 的账单声明影响预览不再用固定 UTC+8 偏移构造月份 epoch 窗口；改为基于配置统计 IANA 时区的当地午夜迭代求解，跨夏令时月份的起止边界按真实偏移计算。
- 验收：洛杉矶 2026-03 月窗口得到 `2026-03-01T08:00:00Z` 至 `2026-04-01T07:00:00Z`（743 小时）；柏林对应窗口得到 `2026-02-28T23:00:00Z` 至 `2026-03-31T22:00:00Z`（743 小时）。`node --check`、Vite build 与 `git diff --check` 通过。
- 边界：这只修正前端预览窗口，事实 epoch、声明作用范围和后端权威查询不变；真实窗口 Computer Use 仍待解锁 macOS。

## Loop 172 · DST 账单预览修复进入安装包

- 构建：`cargo tauri build --bundles app` 成功；安装包内置 CLI 与仓库 release CLI `cmp` 一致。
- 验收：旧包移至 `/Applications/agent-vitals.app.pre-v1.0.0-20260913-025937`，新包以 `--show-workbench` 启动，进程 PID `76162` 已运行。
- 边界：真实账单确认点击与 Computer Use 仍需解锁 macOS；正式签名/公证继续未完成。

## Loop 173 · CLI 导航默认时区去除硬编码

- 修复：`sessions navigation --timezone` 从固定 `Asia/Shanghai` 默认值改为运行时读取已应用的统计/OS 时区；显式 `--timezone` 仍优先并经过 IANA 校验。
- 验收：CLI release 测试 79/79、CLI Clippy 通过；未显式传参的隔离数据根导航返回 `timezone=Asia/Shanghai`，与当前 macOS OS 时区一致，证明该值来自运行时而非参数默认常量。
- 边界：当前机器 OS 时区恰为 Asia/Shanghai，未在本机伪造系统时区；非 UTC+8 与 DST 行为由显式配置时区回归覆盖，真实桌面 UAT 仍待解锁。

## Loop 174 · CLI 默认时区修复进入安装包

- 构建：重新执行 `cargo tauri build --bundles app` 成功；安装包内置 CLI 与仓库 release CLI `cmp` 一致。
- 验收：旧包移至 `/Applications/agent-vitals.app.pre-v1.0.0-20260913-030203`，新包以 `--show-workbench` 启动，进程 PID `76600` 已运行。
- 边界：真实菜单点击/视觉 Computer Use 仍待解锁 macOS；当前包仍未完成 Developer ID 签名与公证。

## Loop 175 · CLI 默认时区回归收口

- 验收：CLI release 测试 79/79、Clippy 通过；完整 Python 回归 1188/1188、Rust workspace release 回归全部通过（含 data 283、core 53、集成与性能测试）。
- 保护：默认导航时区由运行时配置派生；显式时区仍走同一 IANA 校验，不改变事件 epoch、供应商计价时区或历史兼容测试契约。
- 边界：未把本机 OS 当前恰为 Asia/Shanghai 的结果扩展成非 UTC+8 真机证据；Computer Use、签名/公证和外部试用仍未完成。

## Loop 176 · Issue 时间单位存量迁移接入生产入口

- 修复：Issue 新写入虽已将秒级 `finding.time` 归一为毫秒，但存量修复函数此前没有生产调用；现接入 CLI `sessions findings` 持久化前和桌面启动阶段，旧行会在首个读面前幂等修正 `opened_at_ms` 与 `metadata.time`。
- 保护：迁移只处理 `<1e11` 的秒级值，不删除 Issue、不改身份列或 token；失败只记录错误，不把数据伪装成已迁移。
- 验收：`agent-vitals-data` Issue 测试 9/9 通过；桌面 release 测试 110/110 通过；迁移单测确认首跑修正、二次运行 0 行变更。
- 边界：当前未在锁定的 macOS 上做真实窗口视觉 Computer Use；签名/公证和外部试用门禁仍未完成。

## Loop 177 · 存量迁移修复进入安装包

- 构建：`cargo tauri build --bundles app` 成功；安装包内置 CLI 与仓库 release CLI `cmp` 一致。
- 安装：旧 `/Applications/agent-vitals.app` 可恢复备份为 `/Applications/agent-vitals.app.pre-v1.0.0-20260913-030858`，新包已安装并重启，运行 PID `78048`。
- 边界：macOS 仍锁定，未执行真实视觉点击或验证存量库实际迁移行数；当前包仍为 ad hoc 签名，Developer ID/公证和外部试用门禁未完成。

## Loop 178 · 待处理 L0 默认 30 天窗口

- 修复：桌面 `sessions_issues` 兼容入口与 `issue_groups_list` 统一传入滚动 30 天 `[from_ms, to_ms)` 窗口，不再默认扫描全库；保留 L0 组分页、L1 原始命中展开和预算只读投影。
- 保护：上界使用 `now + 1ms` 配合排他查询，避免读取期间刚写入的当前 Issue 被漏掉；窗口边界仍由 Issue 归并层按配置统计时区生成日桶。
- 验收：桌面目标测试通过，新增 30 天窗口半开区间单测；Desktop Clippy 通过。
- 边界：本轮尚未完成真实 4,450 条真机组数/响应 P95 对拍；Computer Use、签名/公证和外部试用门禁仍未完成。

## Loop 179 · L0 30 天窗口修复进入安装包

- 构建：`cargo tauri build --bundles app` 成功；安装包内置 CLI 与仓库 release CLI `cmp` 一致。
- 安装：旧包可恢复备份为 `/Applications/agent-vitals.app.pre-v1.0.0-20260913-031221`，新包已安装并重启，运行 PID `79051`。
- 边界：macOS 仍锁定，未执行真实待处理页视觉操作；真实 4,450 条数据量级/P95、签名/公证和外部试用门禁仍未完成。

## Loop 180 · 来源问题投影按稳定维度归并

- 修复：`data_quality_issues` 的 `scope_key` 可能包含 `fact_id`，不再直接作为 L0 对象；来源投影改按规则、宿主、稳定 provider/计费模式、证据类和日桶归并。
- 保护：原始来源表与 scope identity 不变；组内保留累计命中数、状态汇总、首末时间及最多 3 条样本，fact id 仍可从样本追溯。
- 验收：`agent-vitals-data` Issue 测试 10/10 通过；data Clippy 通过；新增跨 fact 质量投影归并断言。
- 边界：尚未在真实 4,450 条库上输出归并前后比值；桌面视觉 Computer Use、签名/公证和外部试用门禁仍未完成。

## Loop 181 · 来源归并修复进入安装包

- 构建：`cargo tauri build --bundles app` 成功；安装包内置 CLI 与仓库 release CLI `cmp` 一致。
- 安装：旧包可恢复备份为 `/Applications/agent-vitals.app.pre-v1.0.0-20260913-031542`，新包已安装并重启，运行 PID `79581`。
- 边界：macOS 仍锁定，未执行真实待处理页视觉操作和真机 4,450 条归并量级对拍；签名/公证和外部试用门禁仍未完成。

## Loop 182 · 真机库只读规模审计

- 证据：对 `/Users/Admin/.agent-vitals/agent-vitals.sqlite3` 使用 SQLite immutable 只读连接检查，`data_quality_issues` 的开放数量为 `0`；默认滚动 30 天内 `issue_instances` 原始行 `4,395`，状态为 open `4,425`、closed `74`（全库统计）。
- 规模：按规则、宿主、稳定对象、证据类和本地日桶做的 SQL 近似分组约 `187` 组，仅作为量级 sanity check，不替代 Rust `issue_groups` 精确结果。
- 结论：存量时间单位迁移已消除开放质量噪声；来源投影不再以 per-fact scope key 直接制造 L0 组，默认窗口也已生效。
- 边界：未直接修改真机库；尚未完成 Rust 投影精确前后比值、视觉 Computer Use、签名/公证和外部试用门禁。

## Loop 183 · 来源归并后的全量自动回归

- Python：`python3 -m unittest discover tests -v`，1188/1188 通过；208 项按测试定义因未设置 Rust CLI、双实现差分或可选依赖而跳过，无失败。
- Rust：`cargo test --release` 全部通过，CLI 79、data 283、core 53，以及 workspace 集成、边界和性能测试均通过。
- 结论：来源投影归并、默认 30 天 L0 窗口和 Issue 时间迁移未破坏既有 Python/Rust 锁步与数据契约；未刷新 golden/snapshot。
- 边界：真机精确 L0 组数/P95、视觉 Computer Use、签名/公证、外部试用和独立终审仍未完成。

## Loop 184 · SV613/SV614 描述归一化收口

- 修复：SV613 按“进度停滞: 连续工具失败”归一化并剥离次数与首个工具序号；SV614 剥离计数而保留危险模式和“授予”语义；SV611 改用同族专用归一化函数。
- 保护：只在同一问题族内合并，不改变原始 evidence 或 L1/L2 详情；命令、路径和权限值域仍保持各自边界。
- 验收：Issue 归并测试 10/10、data Clippy 通过，新增 SV613 两种计数/序号和 SV614 计数归一化断言。
- 边界：尚未重新运行桌面包构建；真机精确组数/P95、Computer Use、签名/公证和外部试用门禁仍未完成。

## Loop 185 · 描述归一化修复进入安装包

- 构建：`cargo tauri build --bundles app` 成功；安装包内置 CLI 与仓库 release CLI `cmp` 一致。
- 安装：旧包可恢复备份为 `/Applications/agent-vitals.app.pre-v1.0.0-20260913-032147`，新包已安装并重启，运行 PID `81034`。
- 边界：macOS 仍锁定，未执行真实待处理页视觉操作；真机精确组数/P95、签名/公证和外部试用门禁仍未完成。

## Loop 186 · Vite/HMR 待处理页样式调试链验收

- 修复：浏览器 mock 的 `sessions_issues` 改为 Workbench 当前 L0 契约（`totals/rules/issues/findings/source/next_cursor`），补充 `issue_group_instances` 与 `issue_instance_read` 的可展开样例，避免页面因旧 `{data:{items}}` 形状误判为空。
- 验收：Vite dev server `http://127.0.0.1:5173/workbench.html` 可加载；Issues 页显示 2 条发现/2 条规则；展开 SV613 组可见实例详情与状态操作；页面截图已完成视觉检查；`node --check apps/desktop/ui-dev/public/tauri-mock.js` 与 `npm --prefix apps/desktop/ui-dev run build` 通过。
- 结论：样式问题可用现有 vanilla HTML/CSS/JS + Vite HMR 快速迭代，无需为此迁移 React；浏览器服务调试链已经覆盖待处理页的 L0 列表和展开态。
- 边界：这是假数据浏览器验收，不等同于真实安装包/真实 SQLite 数据验收；macOS Computer Use 仍受锁屏阻塞，签名/公证和外部试用门禁仍未完成。

## Loop 187 · 待处理 L0 影响与依据可读化

- 修复：Issues 明细对象列补充影响范围（宿主、日桶、会话/命中数）、证据类别与置信限制；状态列补充建议动作。未提供金额影响时明确显示“金额影响未量化”，不以 0 代替未知。
- 验收：前端通过 Vite HMR 刷新后，SV613 行显示范围/依据/建议副信息，待确认套餐组显示“确认计费方式”；Issues 展开态仍可读取原始命中和状态动作；`node --check apps/desktop/src-tauri/ui/workbench.js`、`npm --prefix apps/desktop/ui-dev run build` 与 `git diff --check`通过。
- 边界：本轮只改善 L0 信息呈现，不改变权威计算、排序或状态写入；真实安装包视觉 Computer Use、无障碍 200% 字号和发布门禁仍待完成。

## Loop 188 · L0 可读化进入安装包

- 构建：`cargo tauri build --bundles app` 成功，前端 Issue 信息层级已进入新的 `agent-vitals.app`。
- 安装：旧包可恢复备份为 `/Applications/agent-vitals.app.pre-v1.0.0-20260913-032800`；新包以 `--show-workbench` 启动，进程 PID `81918` 已运行。
- 边界：安装包为当前本地测试构建；macOS 锁屏仍阻塞真实 Computer Use 操作，签名/公证、干净机升级和外部试用门禁仍未完成。

## Loop 189 · UI 变更后的全量回归

- Rust：`cargo test --release` 全部通过，CLI 79、data 283、domain 467、runtime 及集成/性能测试均通过。
- Python：`python3 -m unittest discover tests -v`，1188/1188 通过；208 项按测试定义因 Rust 双实现、可选依赖或环境条件跳过，无失败。
- 结论：Issue 信息层级和安装包构建未破坏既有数据、计价、迁移、宿主隔离及 Python/Rust 测试合同；未刷新 golden/snapshot。
- 边界：双实现跳过项仍需配置对应 release CLI；真实 Computer Use、200% 字号/读屏、签名/公证和外部试用门禁仍未完成。

## Loop 190 · Python 兼容 CLI 时区入口对齐

- 修复：Python `sessions navigation` 不再将 `Asia/Shanghai` 作为参数默认值；显式 `--timezone` 经过 IANA 校验并以查询局部覆盖生效，未指定时继续使用已保存统计时区或 OS 时区。
- 保护：查询局部时区通过上下文作用域传递到日窗口、最近会话和今日 token 聚合，退出调用后不污染后续查询；无效时区以 `invalid_argument`/退出码 2 明确失败。
- 验收：Python sessions SQL 27/27 通过；新增 Los Angeles 2026-03 DST 月窗口 743 小时回归；兼容 CLI 无效时区退出 2；`py_compile` 与 `git diff --check`通过。
- 边界：旧 Python 计价/历史兼容函数仍保留旧名称，但产品 sessions 查询已使用统计 IANA 时区；真实非 UTC+8 桌面与 Computer Use 仍需解锁后复验。

## Loop 191 · Python 时区修复全量回归

- Python：`python3 -m unittest discover tests -v`，1189/1189 通过；208 项按测试定义跳过，无失败。
- 保护：新增的查询局部时区上下文、IANA 校验和 CLI 参数路径未破坏既有 sessions、计价、WorkBuddy 证据与 Python 兼容合同。
- 边界：Rust/Python 双实现对拍仍有未配置 release CLI 的跳过项；真实非 UTC+8 桌面 Computer Use、签名/公证和外部试用门禁仍未完成。

## Loop 192 · Rust/Python 全量严格对拍

- Python：`AGENT_VITALS_BIN="$PWD/target/release/agent-vitals" python3 -m unittest discover tests -v`，1189/1189 通过，仅 8 项按环境条件跳过，无失败。
- 保护：启用 release CLI 后，Python/Rust 双实现、golden、时区边界、WorkBuddy 证据和桌面相关兼容合同均通过；未刷新 golden/snapshot。
- 结论：本轮 Python 查询局部时区修复在严格二进制对拍下保持兼容，默认时区与显式 IANA 覆盖均未引入回归。
- 边界：真实非 UTC+8 桌面 Computer Use 仍因 macOS 锁屏未复验；签名/公证、干净机升级和外部试用门禁仍未完成。

## Loop 193 · 日历日期格的时区独立性

- 修复：Workbench 日历首日星期、月末天数和月份切换改用 UTC 民历容器，不再受浏览器本地时区影响；统计数据窗口仍由后端配置的 IANA 统计时区决定。
- 验收：`node --check apps/desktop/src-tauri/ui/workbench.js`、Vite production build、`git diff --check`通过；Vite 页面加载后 `#cal-grid` 存在且控制台无 error。
- 边界：真实非 UTC+8 安装包视觉走查仍需解锁 macOS；AC21 完整跨日/夏令时真机证据、签名/公证和外部试用门禁仍未完成。

## Loop 194 · 日历修复重新打包安装

- 构建：`cargo tauri build --bundles app` 成功，新的 `agent-vitals.app` 已包含日期格民历修复。
- 安装：已停止旧 `/Applications/agent-vitals.app` 进程并保留备份 `/Applications/agent-vitals.app.pre-v1.0.0-20260913-0343`；新包以 `--show-workbench` 启动并确认进程存活。
- 边界：本地构建仍未具备 Developer ID/公证签名，`codesign --verify --deep --strict` 继续提示资源签名不完整；macOS 锁屏仍阻塞真实窗口 Computer Use。

## Loop 195 · 非 UTC+8 legacy ledger 日界修复

- 发现：`claude-ledger` 深历史导入把日内代表点固定为 `04:00Z`；在 `America/Los_Angeles` 统计时区下，该代表点会落到前一日，导致 ledger 查询缺失。
- 修复：legacy 导入按 `TZ`/OS IANA 时区的统计日 12:00 生成 `event_ts_ms`，保持原始日键与统计日一致；供应商价格规则不受影响。
- 验收：`TZ=America/Los_Angeles` 下 authority-query 30/30、legacy import 11/11、legacy wiring 1/1 通过；此前失败的跨月 wiring 已恢复。
- 边界：真实 `.app` 非 UTC+8 Computer Use 仍需解锁 macOS；签名/公证、干净机升级和外部试用门禁仍未完成。

## Loop 196 · data crate 双环境回归

- 验收：默认环境 `cargo test --release -p agent-vitals-data` 通过（128 单测、2 依赖测试、1 wiring 测试）；`TZ=America/Los_Angeles` 下同一组 authority-query、legacy import 与 wiring 回归也通过。
- 结论：统计日界和 legacy ledger 代表点不再依赖固定北京时间，默认环境兼容合同保持不变。
- 边界：这仍是代码/fixture 级证据，不替代真实 `.app` 跨时区切换和 Computer Use；发布签名、公证及外部试用门禁仍待完成。

## Loop 197 · 时区修复后的 release Clippy 门禁

- 验收：`cargo clippy --release --all-targets -- -D warnings` 通过；data、runtime、CLI 三个主要 release target 无告警。
- 保护：未运行 Rust formatter，未刷新 golden/snapshot；用户已有 WorkBuddy/Phase/Issue 文档保持未修改、未暂存。
- 边界：Clippy 通过不等于完整 v1.0.0 发布验收；价格目录联网更新、真实 Computer Use、签名/公证、干净机升级和外部试用仍待完成。

## Loop 198 · 桌面 release 产物路径脱敏

- 修复：桌面独立 workspace 增加 release `strip/debug` 配置，并通过 `.cargo/config.toml` 将 Rust panic/source metadata 中的本地 checkout 路径映射为中性 `/agent-vitals`。
- 验收：重新 `cargo tauri build --bundles app` 成功；产物主程序绝对 checkout 路径 0 条，bundled CLI 绝对 checkout 路径 0 条，中性 remapped 路径 27 条。
- 边界：路径脱敏不等于 Developer ID/公证；当前包仍是本地测试构建，真实无开发环境 Gatekeeper/升级验证待发布环境执行。

## Loop 199 · 路径脱敏包安装启动

- 安装：旧 `/Applications/agent-vitals.app` 已保留为 `/Applications/agent-vitals.app.pre-v1.0.0-20260913-0415`；新包已安装并以 `--show-workbench` 启动，PID `89707` 存活。
- 保护：没有触碰或暂存用户已有 WorkBuddy/Phase/Issue 文档。
- 边界：macOS 锁屏仍阻塞真实窗口 Computer Use；签名/公证、干净机升级和外部试用门禁继续未完成。

## Loop 200 · 公共价格目录更新链路（REQ-097–102）

- 新增：公共价卡规范化/校验层，生成内容指纹版本；检查固定维护者 HTTPS 公共地址，不携带本地路径、日志、会话或账户数据。
- 新增：桌面“检查价格更新”入口与状态持久化，显示上次成功版本、模型覆盖和失败原因；远端失败、超限或目录不合法时只记录状态，保留当前有效价卡。
- 验收：`cargo test --release -p agent-vitals-runtime pricing_catalog` 4/4；桌面 `cargo check --release`、Workbench `node --check`、Vite production build、`git diff --check`通过；内置目录可作为已验证离线候选。
- 边界：本轮未宣称每日后台检查/指数退避和外部发布环境公证完成；真实联网成功路径与锁屏 Computer Use 仍需在可操作 macOS 上复验。

## Loop 201 · 公共目录发布可达性复核

- 复核：对固定 GitHub Raw 公共地址执行真实 HTTPS 请求，当前返回 HTTP 404；仓库 `main` 尚未公开该目录路径。
- 结论：更新链路会把该结果记录为失败并保留内置有效价卡；REQ-097 的“真实联网成功”证据不能在目录发布前宣称完成。
- 边界：需要发布负责人将已核验价卡放到约定公共地址（或提供新的可信地址）后，再复验成功写入、版本覆盖和失败回退；未执行外部 push 或修改用户文档。

## Loop 202 · 公共价格联网授权边界

- 修复：价格联网检查默认关闭；新增本地授权策略与设置开关，未明确允许时不会发起公共网络请求。
- 验收：授权状态与目录状态均可通过 Tauri IPC 读取/保存；未授权路径保留离线内置价卡；桌面 release `cargo check`/Clippy、Vite 构建和 JS 语法检查通过。
- 边界：每日后台检查、指数退避及公共目录成功发布仍未完成；当前 404 外部阻塞保持可见。

## Loop 203 · 公共价格每日检查与退避

- 修复：授权后后台每 5 分钟检查一次本地调度状态，但实际联网每天最多一次；网络/HTTP/目录校验失败按失败次数指数退避，成功后恢复 24 小时周期。
- 保护：手动检查不受后台调度窗口阻塞；后台未授权时不请求网络；所有状态只写入本地独立策略/状态文件，不接触用户日志和会话内容。
- 验收：桌面 release `cargo check` 与 Clippy、Vite production build、Workbench JS 语法检查、`git diff --check`通过。
- 边界：真实成功更新仍等待公共目录发布；后台调度需在解锁可操作的 `.app` 上观察，签名/公证和外部试用门禁未完成。

## Loop 204 · 价格更新链路发布构建

- 构建：`cargo tauri build --bundles app` 成功，新增公共价格检查、授权策略和后台调度已进入 `.app`。
- 复核：桌面 Clippy 与 release 检查通过；本地 ad hoc 包的 `codesign --verify --deep --strict` 仍失败，符合尚未配置 Developer ID/公证凭据的已知边界。
- 边界：本轮未安装或启动新包，避免在锁屏状态下伪造 Computer Use 证据；真实后台调度、联网成功目录和签名发布仍待外部条件具备。

## Loop 205 · 公共目录改动后的 Rust 全量回归

- 验收：`cargo test --release` 全部通过；CLI 79、data 128 + 2 依赖 + 1 wiring、domain 467、runtime 287 + 3 依赖 + 8 Q acceptance，以及 core/集成/性能测试均无失败。
- 结论：价格目录校验模块与桌面调度依赖未破坏既有数据、计价、迁移、宿主隔离、时区和跨实现合同。
- 边界：该回归不替代真实联网成功、`.app` Computer Use、签名/公证、干净机升级和外部试用验收。

## Loop 206 · 公共目录与价格快照原子切换

- 修复：公共 catalog 与 pricing snapshot 改为同一 SQLite 事务写入；任一外键或不可变身份校验失败，两个表都回滚，旧有效版本继续可读。
- 验收：新增原子回滚测试通过；目录/价格相关 data crate 回归通过，`git diff --check`通过。
- 边界：真实联网成功仍受公共目录 404 阻塞，签名/公证、Computer Use 和外部试用门禁仍未完成。

## Loop 207 · 原子切换修复进入桌面包

- 构建：`cargo tauri build --bundles app` 成功；桌面包已重新编译 data/runtime 与公共价格更新链路。
- 复核：主程序产物中本地 checkout 路径计数为 0，路径脱敏配置继续生效。
- 边界：未安装或启动新包；本地包签名/公证、锁屏 Computer Use、公共目录 404 和外部试用仍未完成。

## Loop 208 · DSH 价卡锁步与真实 React 渲染回归

- 发现并修复：来源链接元数据更新后，`integrations/dsh-client/pricing.json` 与 `assets/pricing.json` 曾发生字节漂移；已同步并恢复锁步。
- 发现并修复：Node 22 的默认 `navigator.language=en-US` 使独立渲染验证错误地走英文回退；验证脚本现在显式固定无宿主语言场景为 `zh-CN`，不改变浏览器运行时语言行为。
- 验收：Python 价卡/目录 21/21；`integrations/dsh-client` 的 check、build、verify、host/wire/timeline/export/render 全部通过。
- 边界：真实 DSH 宿主安装和 `.app` Computer Use 仍需真机；签名/公证与外部试用未完成。

## Loop 209 · 关于与诊断版本信息

- 新增：帮助与诊断区可展开查看 App 版本、Authority schema、当前价格快照版本/捕获时间和最近同步回执；信息只读且不包含会话正文或绝对路径。
- 验收：桌面 release `cargo check` 与 Clippy、Workbench/Vite 构建、JS 语法检查和 `git diff --check`通过；浏览器 mock 可展示同一面板。
- 边界：Developer ID/公证、真实 Computer Use、公共目录成功发布、干净机升级和外部试用仍未完成。

## Loop 210 · DSH 集成全流程回归收口

- 发现：价卡来源元数据同步后，DSH 副本锁步测试先报告字节漂移；修复副本后，Node 22 的默认 `navigator.language` 又暴露出独立 React 渲染验证的环境不确定性。
- 修复：保持浏览器运行时语言回退逻辑不变，仅在独立 verifier 中固定测试环境；价卡主副本重新字节一致。
- 验收：`npm test`（check、build、verify、verify:host、verify:wire、verify:timeline、verify:export、verify:render）全部通过；Python 价卡/目录 21/21 通过。
- 边界：真实 DSH 宿主与 `.app` Computer Use、签名/公证、公共目录发布和外部试用仍未完成。

## Loop 211 · 可信发布页入口

- 新增：帮助与诊断区提供“查看版本发布页”，只打开固定 HTTPS 维护者 Releases 页面；不自动下载、不自动安装、不请求本地数据。
- 验收：Tauri command 注册、桌面 release check/Clippy、Workbench/Vite 构建、JS 语法检查和 `git diff --check`通过；浏览器 mock 可走同一 IPC 路径。
- 边界：发布页当前仓库仍需公开可访问；Developer ID/公证、真实 Computer Use、干净机升级和外部试用仍未完成。

## Loop 212 · 关于/发布页入口进入安装包

- 构建：`cargo tauri build --bundles app` 成功，最新版本诊断与可信发布页 IPC/UI 已进入 `.app`。
- 复核：产物构建完成于 2026-09-13 04:29；主程序本地 checkout 路径计数仍为 0。
- 边界：未安装或启动新包；锁屏 Computer Use、Developer ID/公证、公开 Releases/价格目录、干净机升级和外部试用仍未完成。

## Loop 213 · Python/Rust 严格对拍回归

- 验收：`AGENT_VITALS_BIN="$PWD/target/release/agent-vitals" python3 -m unittest discover tests -q`，1189/1189 通过，仅 8 项按环境条件跳过，无失败。
- 保护：公共价格、时区、宿主隔离、账单/声明、迁移、CLI 输出与桌面数据合同均在 release CLI 配置下重新覆盖；未刷新 golden/snapshot。
- 边界：完整自动化通过不替代真实 `.app` Computer Use、签名/公证、公共目录联网成功、干净机升级和外部试用。

## Loop 214 · Vite 浏览器开发服务 UI smoke 验收

- 验收：通过 `http://127.0.0.1:5173/workbench.html` 检查总览页面，导航、统计时区输入、公共价格授权复选框、发布页入口和预算保存按钮均存在且可定位；页面标题为 `agent-vitals 工作台`。
- 结果：浏览器控制台错误数为 0；`npm run build`、Workbench 两个脚本语法检查和 `git diff --check` 通过。当前 Vite 构建仍提示 legacy script 未声明 `type="module"`，这是兼容现有 Tauri DOM/IPC 的已知提示，不影响开发服务渲染。
- 结论：样式/交互迭代可先在 Vite + mock IPC 页面完成，再回到 Tauri `.app` 验证原生边界；本轮未把尚未迁移的页面强行改写为 React。

## Loop 215 · Workbench 模块化热更新构建修复

- 修复：将 Workbench 的 `timeline.js` 与 `workbench.js` 标记为有序 ES modules，消除 Vite 的 legacy script 构建警告；合并 `workbench.js` 内重复的 `fmtTokens` 声明，并保留十亿级 token 的 `1.50B` 展示格式。
- 验收：Vite production build 成功生成 JS bundle；WorkBench KPI、轨迹、JS 语法和桌面 release `cargo check` 全部通过；浏览器 reload 后总览、时区、价格更新入口正常，控制台错误数为 0。
- 边界：这是开发与打包链路修复，不替代真实 `.app` Computer Use、签名/公证、公共目录成功发布和外部试用验收。

## Loop 216 · 模块化改动后的 UI/DSH 回归

- 验收：当前 UI verifier（fold bridge、KPI/决策、来源、轨迹、Codex findings/timeline）全部通过；DSH `npm test` 的 TypeScript 检查、构建、基础验证、宿主投影、wire、timeline、export、render 全部通过。
- 发现：历史脚本 `scripts/verify-workbench-v010-closeout.mjs` 仍硬编码 Cargo `0.10.0`、`app_build_info` 等旧版契约，当前运行会失败；它不是 v1.0.0 当前门槛，未通过修改断言或删除检查来伪造成功。
- 结论：模块化脚本在 Vite、浏览器 mock、Tauri release check 和 DSH 集成中均可用；历史 verifier 的漂移记录为待清理项，不影响本轮已覆盖的 v1 当前验证。

## Loop 217 · Workbench 历史收口验证器迁移

- 修复：保留原有 `verify-workbench-v010-closeout.mjs` 命令入口，但将其旧版硬编码断言迁移为当前 v1 Workbench 契约：安全 `session_ref` 轨迹、当前响应式布局、`about_diagnostics`、来源故障/真实空态和唯一 token 格式化实现。
- 验收：该验证器现已全部通过；不降低原有检查范围，且继续检查 Tauri/Cargo 版本锁步、菜单降级、Authority 数据源和核心 Trace 路径。
- 边界：验证器通过不代表真实 `.app` Computer Use、签名/公证、公共目录成功发布或外部试用门槛已完成。

## Loop 218 · 统计时区 helper 语义收口

- 修复：前端原先名为 `beijingToday/beijingMonth/shiftBeijingDate` 的 helper 实际读取的是用户配置的 IANA 统计时区；现更名为 `statisticsToday/statisticsMonth/shiftStatisticsDate`，同步更新月份、日历、预算、会话和最近 7 天查询调用点及验证器。
- 验收：源代码不再残留旧 helper 名；Vite production build、Workbench KPI/closeout verifier、JS 语法检查和浏览器 reload smoke 全部通过，统计时区输入与本月区域正常渲染，控制台错误数为 0。
- 结论：代码命名现在与“系统/用户统计时区决定今天、本月和日界线”的产品契约一致；不改变供应商计价时区或原始事件时间。

## Loop 219 · 时区收口后的全量回归

- 验收：`cargo test --release` 全部通过；`AGENT_VITALS_BIN="$PWD/target/release/agent-vitals" python3 -m unittest discover tests -q` 完成 1189 项，8 项按环境跳过，无失败。
- 保护：Rust/Python 价卡、authority 查询、跨时区日/月边界、宿主隔离、迁移、MCP/CLI 输出和既有 golden 合同均重新覆盖；未刷新 snapshot。
- 边界：自动化全量通过仍不替代真实 `.app` Computer Use、签名/公证、公共目录联网成功、干净机升级和外部试用。

## Loop 220 · Vite 统计时区实际交互验收

- UAT：在 Vite + mock IPC 页面将统计时区改为 `America/Los_Angeles` 并保存，页面返回“正在刷新今天、本月和日历统计”；随后恢复为 `Asia/Shanghai`，状态同样成功。
- 结果：恢复后输入值为 `Asia/Shanghai`，本月统计区域仍正常渲染，浏览器控制台错误数为 0；该路径证明设置按钮实际使用动态配置，而非仅依赖命名重构。
- 边界：这是浏览器 mock 交互证据，不替代真实 `.app` 跨时区点击、系统时区切换及 Computer Use；未写入本地权威数据库。

## Loop 221 · 窄视口会话工具栏换行修复

- 发现：在约 569px 的窄浏览器视口检查时，`.sess-toolbar` 实际计算样式为 `nowrap`；旧验证器的跨规则正则误报为已支持换行。
- 修复：为会话工具栏加入真实 `flex-wrap: wrap`，并将验证器收紧为只匹配 `.sess-toolbar` 规则块，避免相邻 CSS 规则造成假阳性。
- 验收：窄视口下 12 个会话控件无页面横向溢出，计算样式为 `wrap`；Vite 构建、Workbench closeout verifier、浏览器 reload smoke 和 `git diff --check` 通过。临时视口已恢复默认。

## Loop 222 · 会话详情卡片响应式覆盖修复

- 发现：约 569px 视口打开真实 mock 会话详情时，`.detail-cards` 仍计算为 4 列、宽度 704px；早期媒体规则被后置基础网格声明覆盖。
- 修复：在 CSS 全部基础网格声明之后补充窄视口覆盖，详情与 Findings 卡片改为两列，总览卡片改为单列。
- 验收：窄视口实际计算为两列 `264px + 264px`，卡片宽度与容器一致（541px），页面无横向溢出；Vite 构建、closeout verifier、会话详情浏览器 smoke 和 `git diff --check` 通过。临时视口已恢复默认。

## Loop 223 · 响应式修复进入 Tauri 安装包

- 构建：`cargo tauri build --bundles app` 成功，最新 Workbench CSS 响应式修复已重新编入 `agent-vitals.app`。
- 复核：release 构建完成，资源打包阶段无错误；未安装或启动新包，避免把锁屏环境下的 Computer Use 误报为成功。
- 边界：Developer ID/公证、真实窗口 Computer Use、干净机升级和外部试用仍未完成。

## Loop 224 · 账单 CSV 浏览器闭环

- UAT：在 Vite mock 总览展开“导入 CSV 模板”，合法表头与一行账单预览返回“可导入 1 行，未发现错误”，确认导入按钮启用。
- 保护：提交两条相同 `evidence_ref` 的行时，预览返回“可导入 1 行；拒绝 1 行……重复”，确认导入按钮保持禁用；浏览器控制台错误数为 0。未点击确认导入，避免向 mock 写入测试账单。
- 结论：CSV 的字段校验、预览和重复行阻断在 UI 层形成闭环；订阅合同与 token 数据未被此路径改写。

## Loop 225 · CSV 账单稳定身份与打包

- 修复：CSV 导入不再用时间戳生成 `bill_id`，改为按 `host/provider/period/basis/evidence_ref` 稳定派生，与 Authority 唯一键和 upsert 契约一致；同一 CSV 重复导入会复用同一账单身份。
- 验收：JS 语法、Workbench closeout verifier、Vite production build 通过；`cargo tauri build --bundles app` 成功，修复已进入最新 `agent-vitals.app`。
- 边界：未在锁屏环境安装/启动新包；真实 Computer Use、签名/公证、干净机升级和外部试用仍未完成。

## Loop 226 · CSV 币种代码校验与打包

- 修复：CSV 账单入口要求 `currency` 为三位大写 ISO 风格代码，拒绝空值、小写和自然语言币种，避免破坏 CNY/USD 分币展示与预算口径。
- UAT：输入 `cny` 时预览返回“可导入 0 行；拒绝 1 行”，确认导入按钮禁用，控制台错误数为 0。
- 构建：JS 语法、closeout verifier、Vite build 和 `cargo tauri build --bundles app` 全部通过；修复已进入最新 `.app`。

## Loop 227 · Authority 账单币种边界收口

- 修复：`AuthorityDb::host_bill_put` 现在与 CSV 前端一致，只接受三位 ASCII 大写币种代码；IPC 或其他调用方无法绕过输入约束。
- 回归：新增 `cny` 拒绝断言；`agent-vitals-data` 定向测试与 Clippy 通过，最新 `cargo tauri build --bundles app` 成功。
- 边界：既有合法 CNY/USD 账单契约保持不变；未在锁屏环境安装/启动新包，真实 Computer Use、签名/公证和外部试用仍未完成。

## Loop 228 · 账单边界收口后的全量回归

- 验收：`cargo test --release` 全部通过；`python3 tests/golden_runner.py --diff` 的 15 个 case 全部逐字节一致。
- 保护：Authority 账单校验、迁移、价格、跨宿主聚合、MCP/CLI 与 golden 输出均未发生回归；未刷新 snapshot。
- 边界：自动化回归不替代真实 `.app` Computer Use、签名/公证、公共目录联网成功、干净机升级和外部试用。

## Loop 229 · 独立预算输入无障碍名称

- 修复：两组独立按量预算的币种、月预算、日预算和预警阈值输入均补充明确 `aria-label`，不再让读屏器只读出无名称 `spinbutton`/`combobox`。
- 验收：浏览器实际读取 8 个独立预算控件名称，控制台错误数为 0；JS 语法、closeout verifier、Vite build 和最新 `.app` 构建通过。
- 边界：键盘/读屏完整真机路径仍需在可操作的 `.app` 上复验；本轮未在锁屏环境启动新包。

## Loop 230 · Token 日历月份选择器无障碍名称

- 发现：对 Workbench 全部 `input/select/textarea/button` 做名称扫描时，唯一缺少 `label/aria-label/title/placeholder` 的控件是 `#cal-month`。
- 修复：为 Token 日历月份选择器加入 `aria-label="选择日历月份"`，并在 closeout verifier 中固定该契约。
- 验收：浏览器名称扫描返回 0 个无名称表单控件，控制台错误数为 0；closeout verifier、Vite build 和 `cargo tauri build --bundles app` 全部通过。
