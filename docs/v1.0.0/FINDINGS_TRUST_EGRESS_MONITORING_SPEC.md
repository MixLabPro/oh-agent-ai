# Findings 2.0：本地 Agent 数据访问与出境审计规格

**状态：** Draft v1（2026-09-19）

**目标版本：** v1.0.0-beta.4（候选；须在排期评审后确认）

**产品定位：** 离线、只读优先、证据驱动的本地 Agent 信任审计；默认不拦截、不上传任何用户数据。

**关联文档：** [Agent 执行问题分类图谱](../AGENT_EXECUTION_PROBLEM_TAXONOMY.md)（第 7 层）、[工作台 Findings 规格](WORKBENCH_FINDINGS_TAB_SPEC.md)。V16/V17 富化与探针规格尚未进入本分支，相关数据留存纪律在合并该能力时再建立正式链接。

---

## 0. 决策摘要

这是 Findings 能力的一次重大升级，但不是把“安全”两个字加到现有 SV6xx 规则上。

现有 Findings 主要回答：**Agent 在可见工具和会话轨迹中做错了什么**。本规格新增的能力回答：**承载 Agent 的客户端、sidecar 或插件，是否在工具审计面之外读取、打包或发送了本地数据，且该行为是否超出用户授权**。

两者共享 `issue_instances` 的身份、生命周期、分组和状态迁移，但不得共享错误的证据假设：

- `CanonicalSession` / SV601–SV614 继续描述会话内可见行为；
- 新增 `TrustObservation` 描述进程、文件、设置、本地快照和网络元数据；
- 规则引擎把多条 observation 关联为一个持久 Finding；
- “读取”“打包”“准备上传”“尝试外发”“已发送”“服务端接受”必须分开表达；
- 未取得服务端证据时，不得声称数据被训练、人工查看、转卖或长期保存。

第一版采用“两阶段”路径：先交付**历史审计**，再交付用户显式开启的**实时监测与报警**。实时监测不是首版成立的前提，也不得为了“实时”而采集文件内容、请求体、凭据或 TLS 明文。

## 1. 代码基线与架构判断

### 1.1 可复用能力

| 现有能力 | 代码位置 | 本规格的复用方式 |
|---|---|---|
| 稳定 Issue 身份、生命周期和状态历史 | `crates/agent-vitals-data/src/issues.rs`；authority `issue_instances` / `issue_status_transitions` | Trust Finding 仍写入统一 Issue authority，不另造第二套 Finding 状态机 |
| Authority SQLite 与版本化迁移 | `crates/agent-vitals-data/src/authority.rs`，本分支当前 schema v15 | 新观察表必须基于届时最新 schema 顺序迁移；不能预占固定版本号 |
| 宿主差量摄取 | `crates/agent-vitals-runtime/src/sync_service.rs` | 历史审计适配器复用“发现 → 指纹差量 → authority 事务写入”模式 |
| Findings 分组、分页、详情 IPC | `apps/desktop/src-tauri/src/store.rs` 的 `sessions_issues`、`issue_group_instances`、`issue_instance_read` | Trust Finding 进入同一查询面；详情增加证据时间线 |
| 系统通知插件与显式授权先例 | `apps/desktop/src-tauri/src/lib.rs` 的预算/额度提醒 | Trust 实时报警独立开关；仅在用户开启时申请系统通知权限 |
| 原始日志锚点、本地 UI 与 MCP/导出分面 | 现行数据留存政策；V16 enrichments 尚未合入本分支 | 合入锚点能力后本地详情可现场复核；此前只显示脱敏投影，MCP/默认导出仍只给聚合 |

### 1.2 不能复用或不能混用的能力

1. `canonical_audit.rs` 的 `CanonicalSession` 只知道工具、审批、sandbox、turn 等会话事件。后台 sidecar、内置 uploader 和空闲时网络活动不在这个边界内，不能伪装成新的 canonical tool event。
2. `sync_service` 是例行差量同步，不是文件系统或网络 watcher。实时传感器必须是独立、可停用、可观测的 runtime 组件。
3. 现有 `metadata_json` 适合 Finding 摘要，不适合承载高频 OS 事件。观察记录须独立存储并有保留期，否则会让 Issue 表成为不可控的事件仓。
4. 现有 skills 静态安全扫描与本规格无关：它扫描 Skill 定义；本规格观察已安装 Agent 客户端的运行时行为。

## 2. 目标与非目标

### 2.1 目标

1. 统一描述不同 Coding Agent 的本地读取、打包、上传准备、网络外发和授权偏差。
2. 对 ZCode 式“仓库快照直传对象存储”和 MiniMax Code 式“会话/eval 二次上报”使用同一证据模型，而不是厂商黑名单。
3. 在不读取内容的前提下，尽可能回答：哪个进程、何时、访问了什么范围、形成多大投料、连向哪里、传出多少、授权状态是什么。
4. 同时支持历史自查与可选实时报警，并明确每种模式能证明和不能证明什么。
5. 将结论放入现有 Findings 生命周期，支持确认、稍后、已解决、不适用和证据刷新。

### 2.2 非目标

- 不做 TLS 中间人，不解密请求正文，不安装根证书。
- 不读取或复制源代码、prompt、tool arguments/results、快照明文和凭据。
- 不把目标域名是否属于某厂商当作单一恶意判据。
- 首版不自动阻断进程、网络或文件访问；阻断属于另一个高风险产品决策。
- 不根据客户端证据推断云端训练、人工查看、转卖或删除策略。
- 不把 Agent Vitals 自身变成云安全产品；所有分析和通知都在本机完成。

## 3. 统一概念模型

### 3.1 Observation、Evidence、Finding

- **Observation（观察）**：一个可重复采集的事实，例如“某进程在 30 秒内枚举 10,752 个工作区文件”“请求了 upload credential”“向 OSS 发出 48 MiB”。Observation 本身不下恶意结论。
- **Evidence（证据）**：供用户复核 Observation 的本地来源与质量，包括文件锚点、状态字段、进程身份、网络计数和采集器版本。
- **Finding（发现）**：规则引擎把同一 actor、工作区和时间窗内的多个 Observation 关联后，对授权偏差或风险作出的版本化判定。

Finding 的严重度与证据置信度必须独立：一次高敏工作区的大包“准备上传”可严重但未证实传输；一次明确成功的小型公开仓上传可证据很强但风险较低。

### 3.2 数据动作阶段

| 阶段 | 规范值 | 最低证据 | 允许的结论 |
|---|---|---|---|
| 本地读取 | `read_observed` | manifest、状态文件或进程文件访问范围 | 已读取/枚举相应范围 |
| 本地打包 | `package_observed` | 包文件、加密归档或明确打包状态 | 已形成待处理快照/载荷 |
| 上传准备 | `credential_observed` | 上传凭证接口、签名、公钥或目标对象元数据 | 已准备上传 |
| 上传尝试 | `egress_attempted` | 连接/POST/PUT 尝试、失败或超时记录 | 已尝试外发，不能说成功 |
| 字节发送 | `egress_transmitted` | 归属到 actor 的 outbound bytes | 有相应数量字节离开进程 |
| 远端接受 | `remote_accepted` | accepted hash、服务端确认或等价回执 | 远端至少接受了相应对象/清单 |

阶段只单向增强证据，不自动代表前一阶段的全部内容均被后一阶段发送。例如 50 MiB 本地包与 8 MiB outbound 不能被描述成“50 MiB 已上传”。

### 3.3 证据等级

- `E0 inferred`：仅静态代码/字符串或规则推断，不能证明运行时发生。
- `E1 local_artifact`：本地 manifest、状态、快照或客户端日志证明读取/打包。
- `E2 upload_ready`：运行时取得凭证、公钥、预签名目标或出现上传调用。
- `E3 network_attempt`：观察到目标连接和上传尝试，但成功/字节不足以确认。
- `E4 transmitted`：进程归属的网络字节与载荷时序吻合。
- `E5 accepted`：本地可核验的远端接受回执或 accepted 状态。

UI 必须同时显示阶段和等级，禁止用一个“已泄露”标签吞掉差异。

## 4. Finding 类型注册

第 7 层已在分类图谱登记；实现前再冻结稳定代码。建议预留以下家族，最终编号不得与既有 SV601–SV614 冲突：

| 候选代码 | 类型 | 触发要点 |
|---|---|---|
| `SV701` | `workspace_scope_exceeded` | 读取范围显著超过当前文件/明确附件，或覆盖整仓/工作区外配置 |
| `SV702` | `repository_history_packaged` | manifest/文件访问覆盖 `.git/objects`、LFS、logs、reflog 等历史类别 |
| `SV703` | `secondary_session_reporting` | 会话、system prompt、messages、tool schema 等进入非主推理链路的二次上报 |
| `SV704` | `tool_payload_secondary_egress` | tool args/results 或运行时事件被二次上报，且授权/披露不足 |
| `SV705` | `consent_behavior_mismatch` | 隐私、索引或体验优化关闭时，对应链路仍触发 |
| `SV706` | `audit_surface_bypass` | sidecar/宿主后台行为不存在于工具、审批和 canonical session 轨迹 |
| `SV707` | `background_retry_retention` | pending 快照长期滞留或失败后后台持续重试 |
| `SV708` | `remote_controlled_egress_enablement` | 服务端配置、凭证或 feature flag 动态开启本地采集/上报 |
| `SV709` | `direct_object_storage_egress` | 业务域取凭证后向对象存储直传，绕过普通 API 体量观察 |
| `SV710` | `declared_exclusion_violated` | 厂商声明排除的路径类别仍出现在实际 manifest/访问范围中 |

规则代码表达行为模式，不含厂商名。厂商/产品/版本只能作为 `host` 与 evidence 属性。

## 5. 数据契约

### 5.1 `TrustObservation`

Domain 层新增冻结 DTO，建议字段如下：

```text
observation_id           稳定哈希 ID
machine_namespace        机器命名空间
host                     zcode / minimax-code / ...
actor_id                 本地稳定、不可逆的进程身份 ID
actor_kind               main / sidecar / helper / extension / unknown
actor_version            可空
observed_at_ms
observation_kind         file_scope / package / credential / connection /
                         outbound_bytes / remote_ack / consent_state / retry
stage                    §3.2 闭集
evidence_level           E0–E5
workspace_ref            HMAC，不存原路径
scope_classes_json       workspace_current / workspace_other / git_history /
                         credentials_hint / user_config / temp / unknown
file_count               可空
byte_count               可空
destination_class        vendor_api / object_storage / telemetry / eval /
                         model_api / unknown
destination_host         规范化 hostname；不得含 URL query/path/token
consent_state            enabled / disabled / unavailable / ambiguous
source_id                可空，引用本地证据源
native_event_id          可空
source_line              可空，自校验加速提示
source_offset            可空，自校验加速提示
collector_id/version
provenance_json          仅枚举值、计数、哈希和质量标记
expires_at_ms            高频观察的清理时间
```

禁止字段：原始路径、文件名清单、文件内容、prompt/messages、tool 参数/结果、请求体、header、cookie、JWT、签名 URL、RSA/AES 密钥、原始命令行中可能含有的 secret。

### 5.2 Authority 表

下一 schema 版本新增：

1. `trust_observations`：存低频或聚合后的 Observation；以 `observation_id` 幂等。
2. `trust_issue_evidence`：`issue_id + observation_id + evidence_role` 的关联表；Finding metadata 只保留摘要和 observation IDs。
3. `trust_monitor_state`：采集器开关、能力状态、最近成功时间和错误码；不存系统权限原文。
4. 可选 `trust_flow_rollups`：按 actor、目标 host、分钟桶汇总连接数和字节数，避免每个 socket 一行。

不新增 `trust_findings` 表。最终判定继续写 `issue_instances`，`evaluator_id` 使用 `trust-egress-correlator`，规则升级通过 `evaluator_version` 与 `evidence_fingerprint` 驱动生命周期。

### 5.3 保留期

- 网络/文件高频 observation 默认保留 7 天；用户可选 1/7/30 天。
- 已形成 Finding 的关键 observation 在 Finding 打开期间保留；关闭后只保留聚合摘要与不可逆指纹，原始 observation 按保留期清理。
- consent snapshot 仅在状态变化时写入。
- 不拥有宿主原始日志；源被轮换后显示“源已过期，仅存脱敏投影”。

### 5.4 Schema 演进顺序（已拍板）

本分支当前 authority schema 为 v15；另一工作区中的 V16 富化与 V17 探针实现尚未形成可合并提交。Trust/Egress 不得抢占 v16，也不得从混合脏工作区直接复制一份平行迁移。

实施顺序固定为：

1. V16/V17 先各自形成可审查、可测试的提交并合入本分支；
2. Trust/Egress 基于合入后的最新 authority 追加下一版迁移，按当前排布即 v18；
3. 如果 V16/V17 在合入前发生重新编号，Trust 迁移顺延，代码与文档不依赖硬编码“必须是 18”；
4. 新库直接创建最新形状，旧库必须逐级通过 v15 → v16 → v17 → Trust；两条路径的 `sqlite_master`、列定义、索引与约束必须等价。

P1 的最小 schema 只增加 `trust_observations` 与 `trust_issue_evidence`。`issue_instances` / `issue_status_transitions` 不加 Trust 专用列；实时传感器需要的 `trust_monitor_state`、`trust_flow_rollups` 延后到 P2 的独立迁移，避免用尚未实现的高频采集需求污染历史审计表面。

所有 `trust_observations` 行必须带 `ingested_run_id REFERENCES sync_runs(run_id)`；来自文件/日志的观察同时带可空 `source_id REFERENCES source_files(source_id)`。实时采集若未来落库，也必须使用具名 `sync_runs.trigger`（如 `trust-monitor`），不能绕过批次审计直接写表。

### 5.5 Issue 安全摘要与删除联动

Trust Finding 继续复用现有 Issue 生命周期，但 `issue_instances.metadata_json` 只允许存以下安全摘要白名单：

- `stage`、`evidence_level`、`confidence`；
- `scope_classes`、`file_count`、`byte_count`；
- `destination_class`、`consent_state`；
- observation 数量、最早/最近观察时间和 coverage 状态。

`actor_id`、`workspace_ref`、具体 hostname、`source_id`、native event/行号/偏移和任何本地路径不得进入 Issue metadata；它们只存在于 `trust_observations`，且只能由本地专用详情命令读取。这样即使现有通用 Issue 分组或 MCP `issues_list` 采样 metadata，也不会把 Trust 原始证据带出本机呈现边界。

迁移不能只建表：同一变更必须扩展 retention 与宿主删除事务。`delete_imported_host_data(host)` 必须先删除 `trust_issue_evidence` 关联，再删除该宿主的 `trust_observations`，最后才可删除 `source_files`；已失去全部证据的 Trust Issue 按 evaluator 规则转为 resolved/expired，不留下悬空外键或仍声称证据存在的开放 Finding。默认导出和 MCP 不注册 trust 表或本地详情命令。

## 6. 采集架构

```text
宿主日志/状态/manifest ── 历史适配器 ──┐
                                        ├─ TrustObservation ─ Correlator ─ issue_instances
文件/进程/网络元数据 ── 可选实时传感器 ─┘                         │
                                                                  ├─ Findings UI
本地设置快照 ───────── Consent adapter ───────────────────────────└─ 本地通知
```

### 6.1 历史审计适配器（P1）

每个宿主可注册一个 `TrustEvidenceAdapter`：

```rust
trait TrustEvidenceAdapter {
    fn host(&self) -> &'static str;
    fn discover_sources(&self) -> Vec<SourceDescriptor>;
    fn emit_observations(&self, dirty: &[PathBuf]) -> Result<Vec<TrustObservation>, AdapterError>;
}
```

适配器只解析已存在的本地状态、日志、manifest 和客户端设置，并立即归类/计数/哈希。原始敏感值不得越过 adapter 边界进入 authority writer。

首批参考适配器：

- ZCode：checkpoint manifest、state、accepted hash、失败次数、工作区类别分布；只读检查客户端包内端点只能产 E0，不能升级运行时结论。
- MiniMax Code：本地 eval snapshot/steps 上报日志、失败/超时/成功状态、批次大小和字段类别；不得把消息正文写库。

未知宿主仍可由通用文件/网络观察器覆盖，但没有专用 consent adapter 时必须标 `consent_state=unavailable`。

### 6.2 实时传感器（P2，默认关闭）

新增独立 `trust_monitor` runtime，不改变 `sync_service` 的语义。它应：

- 由桌面 app 启停，退出 app 后不常驻；
- 首次开启时解释采集元数据范围，并按需申请系统通知/监控权限；
- 文件侧只观察已识别 Agent 进程对路径**类别和计数**的访问，不采内容；
- 网络侧只记录进程、目标 hostname、方向、字节数和时间桶；不解 TLS；
- 写入有界 channel，按 10–60 秒窗口聚合后批量落库；过载时丢弃低优先级明细并写 `dropped_count`，不得拖慢 Agent；
- 权限不足时诚实降级，不用客户端静态字符串冒充实时证据。

macOS 第一版可先提供低权限模式（已知目录 watcher + 宿主日志 tail + 进程连接/字节轮询）；需要 Endpoint Security、Network Extension 或 Full Disk Access 的增强模式另行评审、签名和发布，不作为 beta.4 前置条件。

### 6.3 Correlator

关联键建议为 `(host, actor_id, workspace_ref, time_window)`，规则采用“多信号优先”：

1. 同一 actor 在短时间内出现大范围读取/打包；
2. 随后取得 upload credential 或连接 vendor API；
3. 再连接对象存储/eval endpoint 并产生显著 outbound bytes；
4. consent 为 disabled、unavailable 或实际范围大于授权范围；
5. canonical session 中没有对应 tool/approval 事件，仅用于证明“审计面差集”，不用于证明恶意。

每次评价必须输出：规则版本、输入 observation IDs、阶段、证据等级、严重度、置信度、支持事实、缺失事实和不可推断项。

## 7. 判定与报警策略

### 7.1 风险分数不是证据分数

建议分别输出：

- `severity`: info / warning / critical；由数据范围、敏感类别、体量、授权偏差和持续时间决定。
- `confidence`: low / medium / high；由证据等级、多信号一致性、进程归属和时间关联决定。

示例：

| 场景 | 阶段/证据 | severity | confidence |
|---|---|---|---|
| 仅在安装包中发现上传端点 | E0 | info | low |
| 生成整仓 manifest，未见网络 | package / E1 | warning | high |
| 关闭开关后仍取凭证并 POST 失败 | attempted / E3 | critical | high |
| 对象存储大 POST，但进程归属不明 | transmitted / E4 | warning | medium |
| accepted hash 与本地 manifest 对上 | accepted / E5 | critical | high |

### 7.2 通知门槛

默认通知仅在以下任一条件满足时触发：

- 新 Finding 达 `critical + medium/high confidence`；
- 阶段首次升级到 `egress_transmitted` 或 `remote_accepted`；
- 用户明确关闭相关 consent 后仍出现 E2+ 行为；
- 相同 actor 的后台重试超过阈值并跨越 30 分钟。

E0/E1 默认只进入 Findings，不弹系统通知。相同 Finding 在 24 小时内去重，除非阶段、严重度或证据等级升级。通知文案必须是事实句，例如：

> MiniMax Code 在 14:32 尝试向 eval endpoint 上报约 5.8 MiB；本地日志记录为 timeout，未证实远端接受。查看证据。

不得写“MiniMax 偷走了数据”。

### 7.3 默认不阻断

报警后的动作首版只有：查看证据、暂停此宿主监测、忽略该规则、打开处置指引。终止进程、修改防火墙、删除快照、修改客户端包或轮换凭据均不得自动执行。

## 8. Findings 2.0 产品面

### 8.1 导航与信息架构

在现有 Findings 三分区基础上新增“信任与数据出境”维度，而不是独立收件箱：

1. **状态卡**：监测关闭/历史审计可用/实时监测中/权限受限/数据截至时间。
2. **风险摘要**：读取、打包、尝试、发送、接受五阶段数量，不合并成“泄露数”。
3. **Finding 列表**：产品、版本、阶段、严重度、置信度、最近发生、授权状态。
4. **证据时间线**：设置状态 → 文件范围 → 本地包 → 凭证 → 网络 → 回执；缺环节显示“未观察到”，不是“未发生”。
5. **处置建议**：按证据阶段给出轮换凭据、企业内报、退出登录、升级/停用等人工建议，并标明建议依据。

Trust Finding 不自动进入“无脑修复待办”，因为多数处置需要用户判断。只有可逆且结果可验证的本产品设置动作（如关闭实时监测通知）可进入普通待办。

### 8.2 详情中的严格措辞

详情固定显示三块：

- **我们观察到：** 可核验事实。
- **这支持：** 当前阶段与授权偏差结论。
- **这不能证明：** 云端用途、完整内容、长期留存等缺失结论。

厂商声明可以作为“声明/授权基线”展示，但不能覆盖运行时证据；社区报告可以作为规则来源，不作为本机发生过行为的证据。

## 9. API 与服务面

### 9.1 本地桌面 IPC

新增或扩展：

- `trust_monitor_status()`：能力、开关、权限、最近采集时间、丢弃计数。
- `save_trust_monitor_config(input)`：用户显式启停和通知阈值。
- `trust_findings_summary(window)`：纯 authority 聚合，首屏不得扫原始日志。
- `trust_finding_timeline(issue_id)`：读取 observation 投影。
- `trust_evidence_open(issue_id, observation_id)`：本地呈现时按锚点只读复核；返回内容不得缓存或落库。
- 现有 `issue_transition` 继续处理生命周期。

### 9.2 MCP 与导出

P1 默认**不向 MCP 暴露** Trust observation 和证据时间线。后续若产品决定开放，只允许聚合：规则、阶段、严重度、置信度、计数、时间和目标类别；不得包含 actor 原始路径、workspace_ref、destination_host、锚点或 excerpt。

默认 redacted export 与 MCP 同边界。private export 即使由用户显式选择，也不导出文件内容、请求体或 secret；最多增加本机可读的 hostname 和归类统计。

## 10. 性能、可靠性与安全预算

1. 历史审计沿用 source fingerprint 差量；未变化源不得重复解析。
2. Findings 首屏只读 authority 聚合，目标 p95 < 1 秒；证据源重读仅在显式展开时发生。
3. 实时传感器 CPU 平均 < 1%，内存 < 100 MiB，authority 写入不高于每 10 秒一批；具体门槛以真机基准冻结。
4. 传感器崩溃不得影响宿主 Agent；队列满时 fail-open 并显式报告 coverage gap。
5. Agent Vitals 自身任何 outbound request 都不得携带 observation、Finding 或宿主标识。现有价目表和版本检查继续遵守“无用户数据”政策。
6. 采集器自身访问 authority、宿主日志或目录的行为要排除，防止自激循环。

## 11. 分期

### P0：契约与样本（小）

- 冻结 `TrustObservation`、阶段、证据等级、路径类别和 destination 类别。
- 将 SV701–SV710 正式登记到问题图谱及规则注册表。
- 建立完全脱敏的 ZCode/MiniMax fixtures；样本只含虚构路径、计数、域名类别和状态。

### P1：历史审计（可独立发布）

- authority schema 与迁移；Observation writer、evidence link、correlator。
- ZCode、MiniMax Code 两个 read-only adapter。
- Findings 信任维度、证据时间线和处置建议。
- CLI `trust audit --host <host> --json` 与桌面手动扫描。
- 无系统级 watcher、无实时网络传感器、无自动阻断。

### P2：低权限实时报警

- 桌面显式开关、权限说明、通知去重。
- 已知目录 watcher、宿主日志 tail、进程/连接/字节的低权限观察。
- 阶段升级和 consent mismatch 即时评价；目标 60 秒内报警。

### P3：增强 OS 证据

- 评估 macOS Endpoint Security / Network Extension、Windows ETW/WFP、Linux eBPF/auditd。
- 必须另做权限、签名、性能、兼容性与隐私评审；不得因 P3 未实现而夸大 P2 覆盖。

### P4：保护模式（不在本规格授权内）

- 进程阻断、域名阻断、快照隔离、企业策略；需单独 SPEC 和用户明确授权。

## 12. 验收标准

1. 相同证据输入重复运行，Observation、Issue ID 和 transition 均幂等。
2. 只有 manifest 时最高为 `package_observed/E1`；测试不得输出“已上传”。
3. 只有 timeout/failed 日志时最高为 `egress_attempted/E3`；不得输出“远端已接受”。
4. `remote_accepted/E5` 必须存在明确回执并可关联本地对象/manifest 指纹。
5. severity 与 confidence 可独立变化，UI 不把二者合并。
6. ZCode fixture 能形成“工作区扫描/打包 → credential → 对象存储 → accepted”的完整或缺环时间线。
7. MiniMax fixture 能形成“会话/eval 二次上报 → 尝试/timeout”的时间线，不误报整仓上传。
8. consent disabled 与 E2+ 同窗时形成 `SV705`；consent unavailable 只显示未知，不当成 disabled。
9. Sidecar 行为未出现在 canonical session 时可形成 `SV706`，但措辞仅为“未出现在工具/审批轨迹”。
10. authority DB、MCP、redacted export 中均搜不到 fixture 的原始路径、文件内容、prompt、tool args/results、token 和签名 URL。
11. 原始证据源删除后，Finding 仍可显示脱敏摘要，并明确标“源已过期”。
12. 实时监测默认关闭；开启时才申请通知/监控权限；关闭后传感器在 5 秒内停止并不再新增 observation。
13. 相同 Finding 24 小时内通知去重；证据等级或阶段升级可再次通知。
14. 传感器不可用或丢事件时 coverage 明确为 degraded，不输出“未发生外传”。
15. `python3 -m unittest discover tests -v`、`cargo test --release`、golden parity 和新增迁移测试通过；不以刷新 snapshot 掩盖合同变化。

## 13. 风险与待拍板项

1. **命名：** 用户侧叫“信任审计”“数据出境”还是“本地 Agent 防护”；代码层建议保持 `trust_*`，避免预设犯罪性质。
2. **SV 编号：** 本规格提供 701–710 候选，正式实现前需确认与后续 family 分配无冲突。
3. **默认保留期：** 建议 7 天；企业用户可能要求 30 天，个人用户可能偏好 1 天。
4. **hostname 是否进 private export：** 默认 export 不进；private export 需产品确认。
5. **macOS 权限路线：** beta.4 是否只做历史审计，或同时做无需高权限的低配实时模式。
6. **规则更新渠道：** 离线内置随版本发布最符合当前红线；远程规则目录会引入供应链与版本解释问题，首版不建议。
7. **厂商声明来源：** 是否维护本地版本化 disclosure catalog。若做，声明与实际观测必须并列，不能让声明替代证据。

## 14. 最终产品判断

这项能力应被定义为 **Findings 2.0 的新证据平面**，而不是一个 ZCode 专项检测器：

- 从“读 Agent 自述的会话日志”升级到“同时观察承载 Agent 的本地客户端行为”；
- 从“单条规则命中”升级到“授权—读取—打包—外发—接受的证据链”；
- 从“事后列表”升级到“历史审计 + 可选实时报警”；
- 仍然坚持本产品的核心边界：本地计算、最小元数据、可复核、不过度归因、绝不上传用户数据。

只要这四条边界不被稀释，它就是 Finding 功能的重大升级；如果为了实时性去采正文、解 TLS 或上传遥测，则会让产品自身变成它试图检测的问题。
