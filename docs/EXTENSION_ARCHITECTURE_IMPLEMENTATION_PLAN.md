# 扩展架构实施任务与验收台账

依据：`AGENT_VITALS_EXTENSION_ARCHITECTURE_SPEC.md` v1.1 与
`HARNESS_MANIFEST_DSL_SPEC.md` v0.4.2。任务范围覆盖两份规格的承诺路线；
P1.5 脚本开发者模式、P2 DSL、P3 社区目录均为条件触发，不自动启用。

## 迭代协议

每轮按分析 → build → 测试 → 独立 subAgent 验收推进。分析记录实际调用链、
数据契约与失败边界；实现保留未相关用户改动；测试针对真实入口与失败恢复；
验收 agent 读当前 diff 和测试证据，提出问题后修复并复验。只有证据齐全才
将任务标为完成。进度不等于整个扩展架构已经完成。

## 任务分解

### 当前优先级（2026-10-03）

主线转到APP_LAYER_IMPLEMENTATION_PLAN.md的C0–C13（独立City M0–M2）。
保留本表完成证据和欠账；已启动批次仅作必要修复、测试与阶段合并准备。
E00及尚未开始的执行环境/DSL/其他数据插槽扩容后移，E15全范围验收仍未完成。
City按需复用已有校验/来源/事务原语，可执行包、签名和独立权限机制按新规格建设。
本分支基于main；原feat/agent-city工作区未提交的E06–E08进展未迁入此分支，
不能用原工作区局部测试证明本分支已具备这些运行能力。

| ID | 任务 | 依赖 | 完成证据 | 状态 |
|---|---|---|---|---|
| E00 | P-1 真实执行环境 feasibility 与 recipe 覆盖率调查 | 无 | 至少十真实执行环境或明确报告折算；两个分母、脱敏样本与真实来源 | 待调查 |
| E01 | CAP-1：schema、Rust/Python 能力与版本门，接入加载入口 | 无 | 旧 manifest 正常、未知能力/格式拒绝、双语言错误与输出对拍 | 本轮验收通过 |
| E02 | typed index、固定 commit/hash、路径与资源限制、依赖闭包 | E01 | 共用合法/恶意 fixture、循环/冲突/超限测试 | 本轮纯校验层验收通过 |
| E03 | authority 扩展台账 migration、revision/origin、generation、历史关联 | E02 | 旧库迁移、事务回滚、事实关联及读写兼容测试 | 本轮验收通过 |
| E04 | 不可变对象、校验加载、staging、预览绑定、事务激活/回滚 | E03 | 各崩溃边界、对象损坏、并发预览失效测试 | 本轮验收通过 |
| E05 | harness 前缀迁移及完整消费面守卫、billing 估算锁 | E03 | 迁移预览/备份/恢复、SQL/MCP/行为面拒绝、受控 golden parity | 本轮验收通过（一项测试欠账登记） |
| E06 | 官方目录 opt-in 客户端、CLI/MCP、更新与确认、来源状态 | E04,E05 | 禁网无请求、同源约束、离线加载/回滚、来源不可伪造 | 索引面验收通过；payload 下载与激活确认待下批次 |
| E07 | catalog 仓库布局、价卡兼容镜像与发布 CI | E02 | 旧 URL/schema 兼容、镜像漂移检查、客户端缺价降级 | 待实施 |
| E08 | 应急旁名互斥、升级漂移、退出与显式重算 | E05,E06 | 同源范围重叠拒绝、重放不双计、账单/封账保持测试 | 本轮实施与验收通过；E15 全规格矩阵仍待 |
| E09 | P1 桌面导入向导、徽标、KPI/矩阵、卸载与状态呈现 | E06,E08 | UI 截图/交互验证、脱敏与历史来源保留 | 待实施 |
| E10 | MAN-3/4 会话身份、时基与 provider 证据槽 | E01,E05 | 原始 provider 优先、时间未知降级、身份稳定与 parity | 待实施 |
| E11 | MAN-1 多源 join、MAN-2 json/rotated | E10 | join 缺失/重复、轮转重放、差分/树形 recipe fixture | 待实施 |
| E11R | 真实树形/累计快照证据驱动的本体 recipe 新族 | E00,E10 | 分支去重、差分/重置/乱序回放及双语言 golden；覆盖缺口报告 | 待实施 |
| E12 | provider、price_card、model_alias 数据插槽 | E02,E04,E07 | local 不升级订阅/官方路由、估算影响预览及冲突 pin | 待实施 |
| E13 | vendor taxonomy、behavior_patterns、trust_profile 权限 | E04,E05 | 分类/finding 影响回放、来源权限及行为资格守卫 | 待实施 |
| E14 | subscription_scope、FX、quota_window 与阈值插槽 | E12,E13 | 路由证据门、封账绑定、DST/时间窗口与影响预览 | 待实施 |
| E15 | 发布验收与全量 parity、clippy、故障矩阵核对 | E00–E14（含 E11R） | 对架构 §12 每项逐一登记测试/实现证据与 subAgent 结论 | 待实施 |

SQLite 源扩容另行立项评审。P-1 的至少十执行环境覆盖率调查须记录真实样本来源、
执行环境与 usage 行两个分母；缺少样本时明确缺口，不能以合成数据冒充真实覆盖率。
harness 前缀迁移会变更外部身份，E05 实现时必须检查 source 控制、retention、
导出/封账引用及 fact_id，不以纯文本替换视为完成。

## 当前轮

E01 分析发现：现有 parser 仅具有固定 recipe 词表及未来字段拒绝，未接受
requires/min_app_version；Rust 与 Python 分别解析，必须同步。现有 facts
仍使用 plugin 前缀，本轮能力门不改变事实身份，迁移由 E05 完整处理。
实现与测试结果、独立验收结论将在实际完成后登记。

### E02 独立验收记录（2026-10-01）

交付范围为纯 typed index 校验、schema 与共享 fixtures；网络获取、内容哈希
计算、最高序号持久化、payload 对账与激活由 E03/E04/E06 接入，不能把纯
校验层通过解释为目录安装已经可用。

architecture_analysis subAgent 独立重跑：Rust
`cargo test --release -p agent-vitals-domain --test catalog_index` 4 tests 通过；
Python catalog suite 最终 7 tests 通过，覆盖 schema search 语义下末尾换行
拒绝、u32 边界、日期、diamond DAG/环、大小上限与共享错误码。
独立额外输入验证 NaN/正负 Infinity 均为 `index_json`；反序依赖错误条目
与正序均优先报告 `dependency_duplicate`；非 ASCII 日期数字及 2026 闰日
拒绝，2024 闰日接受；5000 位版本返回稳定 `version`；128 个 Unicode
字符能力名按字符计数接受，Rust 已用 `chars().count()` 对齐。
依赖阶段与 DFS 的 Python `sorted(nodes)` 与 Rust BTreeMap 排序一致。
`git diff --check` 通过，既有 golden 无改动。后续发布仍须完成全量门与
事务、来源、离线及故障恢复验收。

### E01 验收记录（2026-10-01）

实现：Rust harnesses manifest 和 Python twin 的真实 parser 入口能力门，公开
CapabilitySet/协商接口、schema 与共享 `harness-manifest-capabilities.json`。
旧 local manifest 缺声明仍按实际 recipe 校验；当前公告三种内置 recipe、
零 feature，尚未消除的 trust 双语言差异不能成为已支持 feature。

build/test：`cargo build --release -p agent-vitals` 通过；
`cargo test --release -p agent-vitals-harnesses harnesses::generic` 29 tests 通过；
Python generic suite 22 tests 通过，包含文件加载拒绝与共享错误串。
独立 architecture_analysis subAgent 使用新 release CLI 与 `scripts/scan.py`
对同输入 unknown-feature、非法 u32 版本、未知键顺序三个拒绝案例：均 exit 2，
stdout 逐字一致；另核查 registry/ingest 加载必经 parser、schema 数字边界和
末尾换行拒绝。没有更新既有 golden。

全量首次 Python suite：1259 tests，6 failures、2 errors、210 skipped。
运行中新增 catalog 模块导致分类/包装白名单三项失败，已登记并针对复验。
另有月聚合/by-source 日期测试失败，fixture 固定 2026-09 而本轮日期为
2026-10-01；已复现，尚待完整区分基线问题与本次变化。全量重新运行中，
因此此记录只证明 E01 本轮门通过，不代表发布全量检查通过。

后续补充：Python 与新 release Rust 二进制各 16 golden cases 全部逐字一致。
harnesses/domain 的 `clippy --release --all-targets -- -D warnings` 通过；检查遇到
既有 FX 文档/迭代器 lint，以手工小改修正（last/filter 改等价反向查找），
FX 回归测试随后运行。workspace 全量 gate 仍待后续实施及完整验证。

### E00 样本初查（2026-10-01）

已检查 tracked fixtures 和 README：DSH README 明确为按源码格式生成的手写
语料，golden_runner 的 zcode case 也由 `_plugin_fixture_row` 生成。这些可用
作回归测试，不能计入“十个真实执行环境”调查分母。仓库有 Claude、Codex、DSH、
WorkBuddy 格式夹具与 trust/minimax 元数据，但尚无覆盖十执行环境的真实用量样本
来源台账。E00 保持未完成；后续可以完成合成回归、收集已提供的脱敏样本并
明确覆盖缺口，不能宣称 recipe-only 80% 目标已满足。

### E03–E06 迭代记录（2026-10-01，第二轮）

**E03 验收通过**：`extension_authority.rs` 五张表 + CAS 激活 + 事实关联，
schema v28 迁移（旧分支 v27 边界保留、失败不推进版本戳）。data crate
196+7 测试通过；`EXTENSION_AUTHORITY_SCHEMA_V28.md` 明确「本轮仅 SQL 基础，
不宣称文件/网络安装生命周期完成」。

**E04 验收通过**：`runtime-core` ObjectStore 增补 stage/discard（Python twin
同步，错误码逐字一致）；ingest 新增 `extension_installer`（PreviewTicket
预览绑定 generation+候选集+引擎版本、commit 前 §8.3.3 对象存在性校验、
rollback_to/uninstall_all、registry.json 派生快照可删可重建）。测试覆盖：
陈旧 ticket CAS 拒绝、对象篡改/缺失阻断提交且 generation 不动、回滚不重复
登记 revision、卸载保留历史、未知 revision/空引擎版本拒绝。ingest 542+14
测试通过。

**E05 验收通过（一项欠账）**：`plugin:` → `harness:` 全量迁移——
`facts_harness`/`facts_file_stem`/source_profile 前缀、`plugin_facts_stem`（旧
`plugin:` 值折算新 stem）、source_controls 锁与排除项（旧值读取时原地规范
化，未注册 manifest 执行环境仍按既有 stale 语义清扫）、session_insights/summary
谓词、retention 磁盘发现（新旧文件名双认）、CLI 三命令改名 `manifest-*`、
Python twin（`generic_manifest.py`/`generic_plugin.py`/cli.py，slug 错误串
两侧逐字一致）、desktop 显示/徽标双前缀、attribution 签名表键位。数据迁移
三件套：authority **v29**（`usage_facts` harness 列幂等 UPDATE，重开即迁）、
facts 文件改名 `migrate_manifest_facts_prefix`（幂等、目标存在即跳过如实
上报，retention 前置执行）、source-controls 就地规范化。**受控 golden 更
新**：仅 `harness-generic-zcode.json` 10 行（前缀 ×7；fact_id ×3——harness 参与
身份哈希，属契约变更预期后果），16 case 双实现逐字节一致。欠账：E05 证据
项中「declarations 不得把 `harness:%` 改 subscription」的**专项 SQL 回归测试**
未写（现有 attribution 测试已覆盖 harness: 行的声明路径，负向断言待补）。

**E06 索引面验收通过；payload 面待下批次**：桌面 `update_manifest_catalog`
（opt-in 策略默认关、10s/4MiB 限、UA 固定、index sha256 + E02
`validate_catalog` 含最高序号单调性、缓存 `cache/catalog/index.json`、状态
文件含 supported_entries 并如实标注「激活需显式确认」）、
`manifest_catalog_status`/`save_manifest_catalog_policy` 命令；MCP
control_plane 增 `manifest_catalog_status`（只读）与
`manifest_catalog_policy_set`（MUTATIONS）；CLI 增 `manifest-catalog-status`
（本地只读，无网络——HTTP 归桌面层，与价卡同构，规格 §13.2 的 CLI update
预期按此修正）。仓库播种 `catalog/index.json`（空 entries，sequence 1）。
capability 词表经桌面直依 harnesses 的 `CapabilitySet::default()` 单一来源。
**待办**：payload 下载 → ObjectStore staging → preview ticket → 显式确认激
活的完整链路、E08 互斥门联动、以及禁网/离线加载的故障注入测试（§12 对应
行）。本批次未写桌面/MCP 专项单测（沿用价卡同构面，构建+CLI 冒烟验证）。

**全量门（第二轮收尾）**：workspace `cargo test --release` 64 套件零失败；
Python 1274 tests OK（210 skip）；golden 16/16 双实现逐字节一致；workspace
`cargo clippy --release --all-targets -- -D warnings` 通过（修正 6 处：本轮
3 处 manual_contains/char-comparison、预存 WIP 3 处——billing_preview 未用
导入、authority 8 参函数 allow、price_overrides 文档缩进）。本轮全部改动
未提交。

### 真机测试记录（2026-10-01，bundle 通道）

**发现并修复一个升级 bug**：v29 bump 把幂等升级带写成「27 或 29」，漏掉
上一发布版本 28——现网 28 库 open 时掉进 `__unsupported_legacy_version__`
防御分支被拒开（data-migrate 实测复现）。修复为区间判断
`(27..=SCHEMA_VERSION).contains(v)`，并补 `v28_stamped_database_upgrades_
through_the_idempotent_band` 回归（28/27 双向钉死）。

**迁移时序缝（已收口，登记成因）**：首个 bundle 带着上述 bug，其同步 tick
在 retention 改名迁移**之前**就写了新路径 `harness-zcode.jsonl`（当时 authority
写连接被 brick，双写半失败）；改名迁移按「目标存在即跳过」如实保留旧件。
修复后重导 + 精确对账收口：DB 2141 行（2015 个 v29 保留旧 id + 126 个新
id；**事件级 exactly-once 证明与 harness 无关**，无重复计数），facts 文件合并
为 2141 行、id 与 DB 逐一对应；旧文件备份于 /tmp。**E05 遗留决定项——已拍板并实施（2026-10-01）**：产品未正式发布、无老数据
兼容包袱，**一次性重 stamp 到新 fact_id**。实现为 authority **v30**（标记 =
`source_profile LIKE 'plugin-%'`；`PRAGMA defer_foreign_keys=ON` 下同批改
`extension_fact_provenance` / `billing_fact_attributions` 子表与父行；事件级
UNIQUE(harness,ns,session,event,kind) 保证新旧 id 不可能由常规摄入共存——UPDATE
即足够，异事件哈希碰撞交由事务整体回滚响亮报错）+ ingest 文件侧重写
`restamp_manifest_fact_files`（同 `fact_id()` 重算、文件内按新 id 全量去重、
原子替换、幂等）。**接线教训**：迁移不能只挂在 retention 链路上——CLI 调用
图会把不可达代码链接裁掉（实测二进制无 `cutoff_month`），故显式挂进
`data-migrate` 维护命令确定性触发。真机终态：schema 30；zcode 2378 行全部
新 id；facts 文件 2378 行与 DB **1:1 零重复**；145 行 tick 重发重复行已合并。
过程中另修复：v29 幂等带漏掉 v28（已回归钉死）、v30 首版 FK 顺序违约
（deferred FK 解决）。**并行会话警告**：本轮多次与另一会话在同一工作区/
target 目录竞态（18:40 提交 63583b58、18:43 清空 bundle 目录、共享 rlib 被
陈旧复用），曾触发一次误判与一次过重的 `cargo clean -p`（清掉 26.6GB 共享
构建缓存）；后续构建请避免双会话同时 cargo。

### E08 收尾记录（2026-10-04，最新 City/harness 基线）

本轮在 City 最近代码 `3a9ae0a3`（含 harness 重命名）上先合入本地 `main`
并保留 City 的最新插件布局同步改动，再移植 E08；没有改动原始工作区。
E08 的实际身份统一为 `harness_manifest` / `harness:` / `harness`，DNS
字段 `endpoint_host` 保持其网络语义，不属于 harness 命名迁移。

实现范围：

- 对已编译 harness、已安装 manifest、新候选及丢失/符号链接路径按 canonical
  source roots 检查范围冲突；拒绝会造成同一来源被两个 manifest 声明的激活。
- local/vendor manifest 安装、确认、撤销/卸载都经同一 revision/object 与
  activation ledger 路径；卸载只撤销当前激活，不删除历史来源和 facts。
- 新增 `manifest-recompute` 显式历史回放：只允许指定当前激活的
  `harness_manifest` revision；预览绑定固定语料、命名空间和结果哈希，确认后
  输出隔离的不可变结果对象。重复确认幂等，既有 facts、官方账单归因与封账
  数据保持不变。它不自动重写 billing 或迁移封账。
- CLI 暴露 `--harness`，使用当前注册表枚举；city plugin 继续是前端项目，
  本轮没有把 Rust 扩展功能放进 City 插件。

验证（在 `codex/e08-city-closeout`）：workspace `cargo test --release` 通过；
`cargo clippy --release --all-targets -- -D warnings` 通过；`cargo build --release`
通过；Python 与 release CLI 的 16 个 golden cases 逐字节一致。Python 全量
`unittest discover` 跑了 1274 项，首次有 1 项 `verify-workbench-traces.mjs`
失败，发生时桌面 bundle 正并行重建；打包完成后该脚本及对应单测独立复跑通过。
带 release CLI 的 `test_harness_contract.py` 20 项和 `test_ci_gate.py` 19 项
均通过。City 侧 desktop React build、City package build/typecheck、7 项
`verify:city` 检查、City 布局检查、插件架构检查与 native isolation 检查通过；
第一次插件架构检查读到重建前的旧 bundle（误含 City chunk），由最新源码重建后
复验通过。`git diff --check` 通过。

边界：这些证据完成 E08 的本分支实现，不代表 P1.5、E00、E07、E09–E15 或
整个扩展架构已完成；E15 仍需逐项对照 §12 做整体验收。本地 `main` 尚未被
合并或推送。
