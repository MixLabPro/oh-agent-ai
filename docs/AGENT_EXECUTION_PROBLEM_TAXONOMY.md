# Agent 执行问题分类图谱（七层 × 覆盖状态）

**状态：** Draft v1（2026-09-19）。基于 agent-vitals 现有证据流、2026-09-19 实机抽样（MCP 全链路验证）与通用 Agent 实践中的常见故障整理。
**定位：** 检测器 backlog 的总纲——「发现」tab（[WORKBENCH_FINDINGS_TAB_SPEC.md](v1.0.0/WORKBENCH_FINDINGS_TAB_SPEC.md)）的②对比面每加一列、③证据面每接一类证据，都应能在这份图谱里找到对应的问题类与信号源。它不规定实现，只回答"有哪些问题、信号在哪、现在覆盖到哪"。
**覆盖状态图例：** ✅ 已有检测器/聚合 · 🟡 schema 或原料在库、缺规则或数据 · ❌ 缺口（无信号源被消费）。

---

## 0. 三个总判断（排期依据）

1. **最便宜的收益在"升格"，不在新检测器。** 缓存抖动、马拉松会话、审批摩擦三类问题，原料已全量入库（四桶 token、会话跨度、SV610 计数），缺的只是把原始数据升格为 finding 的规则——成本比写新 emitter 低一个量级，且实机已证明它们直接证伪钱包。
2. **MCP 层是整块空白，且是本仓库的主场优势。** 我们自己就是 MCP 工具作者（`data-mcp` 对 business error 与 JSON-RPC error 的区分有测试钉住，`mcp/mod.rs`），宿主日志里这层错误天然存在——缺的是 emitter 摄取 + 一套错误码分类词表。
3. **DSH 的 waste 检测器是全家最先进的三件套，但只装在一个宿主上。** `hosts/dsh/sessions/waste.rs` 的"增量才是真代价"口径（failure_run_waste 用失败前后 `context_tokens` 差值衡量，而非失败次数）值得移植到 claude-code / codex——这是跨宿主回答"哪些便宜但耗 token"的证据基础。

---

## 1. 工具层（Tool）

| 问题 | 说明 | 信号源 | 现状 |
|---|---|---|---|
| 工具失败 | 报错/异常返回 | tool_finished + 三态 outcome；`error_fingerprint` | ✅ 实机 9 月：1,763 次 / 233 会话；trace 内 failed_tool_call（40/982） |
| 重复调用 | 同工具同参数反复调 | §7 规范化 + canonical args（键序无关）；`repeated_tool_call` | ✅ 实机：43,927 次 / 659 会话；最大组 20,475 次，其 Bash 指纹与 473M 浪费会话同源（2026-09-19 验证） |
| 重试链 | 失败→重试→恢复/放弃 | `retry_chains`（capability 维度） | ✅ 实机：178 条 / 120 恢复；与 skill 的配对 🟡（指纹尚未配对生命周期） |
| 参数误用 | schema 错 / 调不存在的工具 | 工具错误码 | ❌ 错误码没有分类聚合，现只有指纹去重 |
| 工具超时 | 挂起 | SV608（TOOL_TIMEOUT 归它） | 🟡 有码有检测，无聚合视图 |

## 2. MCP 层

| 问题 | 说明 | 信号源 | 现状 |
|---|---|---|---|
| server 连不上 / 起不来 | 命令错、依赖缺、端口占 | 宿主日志的 MCP 客户端记录 | ❌ 日志里有，无 emitter 摄取 |
| JSON-RPC 错误分类 | −32700 解析 / −32601 方法不存在 / −32602 参数非法 / 超时 | MCP 响应错误对象 | ❌ 无分类词表。自家 `data-mcp` 已区分 business error vs JSON-RPC error（`mcp::tests::tools_call_data_status_on_missing_db_is_business_error_not_jsonrpc_error`），词表可自产 |
| 结果过大塞爆上下文 | 单次返回巨大 payload 挤占上下文 | result 尺寸（canonical args/result 长度已在归一化路径上） | ❌ 无检测——常是缓存抖动（§4）的上游原因之一 |
| 工具名冲突 / 影子化 | 两个 server 同名工具，一个永不被调 | MCP 注册表 vs 实际调用 | ❌ 且"影子工具"表现为零调用，与"没人用"难区分，需注册表对比 |
| server 版本漂移 | 升级后 schema 变、调用开始失败 | server 版本标识 | ❌ 版本信号未采集（与 skill 版本缺口同根，见 §3） |

## 3. Skill 层

| 问题 | 说明 | 信号源 | 现状 |
|---|---|---|---|
| 失败率 | skill_finished outcome | `skills_summary` schema 已备 | 🟡 **疑似 emitter bug**：`finished_events` 在库而 succeeded/failed 全零、unknown 全占（`workflow_summary.rs:86-87` 的计数 `AND outcome='succeeded'` 永不命中）——事件里 outcome 字段疑未写入。修复收益最大 |
| 重试率 | 与重试链配对 | retry lifecycle | 🟡 "invocation fingerprints are not yet paired with a retry lifecycle" |
| 时长 | duration_ms 平均 | skill_finished.duration_ms | 🟡 字段在、值为 null |
| 版本回归 | 版本更新后表现变化 | `versions` / `version_regression` | 🟡 版本全 `<unknown>`（known_version_count=0），检测等于没开 |
| 覆盖 | 哪些宿主的 skill 事件进库 | workflow_events | 🟡 实机 9 月仅 claude-code（4 skill / 6 调用 / 12 事件） |

静态定义健康（SKILL.md 结构、触发可靠性）不在此层——那是 doctor / Skill 体检 tab 的领域（SV101–508），两边互不重复。

## 4. 上下文/缓存层——实机证明最贵的一层

| 问题 | 说明 | 信号源 | 现状 |
|---|---|---|---|
| **缓存抖动 / 上下文重建** | 每轮全量重喂，命中率崩塌 | 四桶 token（`HourlyCell::cache_hit_ratio` 现成） | 🟡 原料全量入库，**无升格规则**。实机案例：单会话 473M token、命中 22%、p50 却 99.5%（双峰分布）——"命中分布双峰"本身就该是 finding |
| 失败结果占位 | 报错文本塞回上下文、占位直到压缩 | `failure_run_waste`（增量口径） | ✅ 仅 DSH；移植见 §0.3 |
| 重复结果膨胀 | 同一结果反复进上下文 | `duplicate_tool_results` | ✅ 仅 DSH |
| 上下文溢出 / 压缩频度 | 频繁 compaction = 任务超出窗口 | `context_overflow` remedy 已有；`TraceNodeType::Compaction` 在词表 | 🟡 压缩事件无采集，节点不产出 |

## 5. 模型/路由层

| 问题 | 说明 | 信号源 | 现状 |
|---|---|---|---|
| 单会话模型混切 | 切换时点/原因不可见 | usage 节点 model_id（侧面） | ❌ `ModelChange` 词表占位、构建不产出（实机 1 会话 7 模型核验） |
| 路由到贵端点 | custom 被官方卡 USD 兜底 | 归因线 | ✅ 2026-09-18 合并的时间线判定（cc-switch 证据） |
| 限流 / 配额耗尽 | 撞窗 | SV607 + `windows_recent`（按 (窗口, 重置时刻) 去重） | ✅ `hosts/claude_code/sources/quota.rs` |
| 模型降级 fallback | 主模型不可用悄悄换 | — | ❌ 无信号 |

## 6. 会话/行为层

| 问题 | 说明 | 信号源 | 现状 |
|---|---|---|---|
| **马拉松会话** | 超长不间歇、失败还在跑 | 会话跨度（首末事件） | ❌ 无单会话阈值档（实机 49.8h 会话零提醒；发现 tab 待拍板 #2） |
| 死循环 / 无进展 | 转圈不收敛 | `structural_waste`（DSH） | 🟡 单宿主覆盖；通用检测缺 |
| 任务中途放弃 | outcome unknown 占比 | 三态 outcome 聚合 | 🟡 unknown 占比本身是信号（skill 全 unknown 即案例） |
| 人机摩擦 | 人均 39 次审批确认 | SV610 计数 | ✅ 有数据，但只当**风险**展示、没当**效率**展示——同一条数据的第二个用途 |
| 子代理失控 | Task 子代理跑飞 | scope 字段 | ❌ 恒 `main`，无子代理编号空间（TraceGraph 契约明文盲区） |
| 安全风险行为 | 危险命令 / 工作区外写 / 敏感路径 / 网络外联 | SV601–606 | ✅ 覆盖最好的老区 |

---

## 7. 本地数据访问/外传层（Local Data Access / Egress）

这一层关心的不是 Agent 通过可见工具执行了危险命令，而是宿主客户端、sidecar 或插件绕过工具审计面，在后台读取、打包或发送本地数据。判定只陈述可观测行为与授权偏差；“用于训练”“人工查看”“转卖”等用途在没有服务端证据时不得推断。

实现契约、证据等级、存储边界与分期见 [Findings 2.0：本地 Agent 数据访问与出境审计规格](v1.0.0/FINDINGS_TRUST_EGRESS_MONITORING_SPEC.md)。

| 问题 | 说明 | 信号源 | 现状 |
|---|---|---|---|
| **未披露/超范围数据外传** | 未明确告知或未获得对应授权，将工作区、Git 历史、凭据痕迹或全局配置发送到云端/第三方存储 | 进程—文件访问范围；本地快照/清单/状态元数据；进程—域名连接；凭证请求后紧跟大体积 PUT/POST；实际字节数 vs 用户授权范围 | ❌ 无跨进程文件/网络侧信号摄取；SV601–606 只覆盖 Agent 可见行为，不能证明宿主 sidecar 无后台外传 |
| 超范围本地读取/打包 | 宣称只使用当前文件或对话附件，实际遍历整仓、`.git`、工作区外配置或其他敏感路径 | 文件打开范围与数量；快照 manifest 的路径类别/字节分布；本地加密包体积与 mtime | ❌ 现有工具 trace 看不到宿主进程自身的文件 I/O |
| 绕过工具/审批面 | 后台 sidecar 或内置模块执行读取和上传，不出现在 Agent 工具列表、工具 trace 或审批次数中 | 进程树/签名；网络连接与 tool invocation 时间线差集；宿主空闲时的持续活动 | ❌ `scope` 恒 `main`，无 sidecar/子进程归属空间 |
| 隐私开关/授权与实际行为不一致 | 关闭索引、体验优化或数据共享后，相关读取/外传链路仍触发 | 本地设置快照 + 同时段文件/网络行为；版本前后对照 | ❌ 无授权状态与运行时行为的联合判定 |
| 后台外传重试/滞留 | 上传失败后长期保留快照并自动重试，延长敏感数据的暴露窗口 | pending 文件存活时间；`failure_count`/重试间隔；重复凭证请求；成功确认后的本地清理行为 | ❌ 无客户端后台传输生命周期模型 |

**证据分级：** 只发现本地快照只能判定“已读取/已打包”；凭证请求只能判定“已准备上传”；进程归属的大体积外发或服务端 accepted 记录才可判定“已外传”。任何一级都不自动证明数据被训练、人工查看或转卖。实现时只存储路径类别、字节数、时间、进程归属和域名等分析增量，不复制文件内容、凭据、请求体或快照明文。

**事件样本（非厂商专用规则）：** 2026-09-18 公开的 ZCode 取证报告展示了“本地工作区快照 → 上传凭证/服务端公钥 → 对象存储大体积 POST”的可观测链路（[ferstar 原始报告](https://blog.ferstar.org/posts/zcode-silent-workspace-snapshot-upload/)）。该事件用于证明此问题类的可检测性，不足以单独证明云端数据的后续用途或删除状态。

## 8. Backlog 排序建议（供「发现」tab P2/P3 与 emitter 迭代取用）

1. **升格类（先做，纯规则/SQL）**：缓存命中双峰分布 → finding；会话跨度超阈值 → finding；SV610 的"效率视角"二次聚合（每会话审批摩擦）。
2. **一行 bug 类**：skill outcome 字段修复（§3）——修完成功率/失败率两列立即有数。
3. **移植类**：waste 三件套从 DSH 移植 claude-code / codex（口径不变，读各自日志）。
4. **新 emitter 类**：MCP 层摄取（server 状态 + JSON-RPC 错误分类词表）；skill 版本采集；ModelChange / Compaction 信号进 `CanonicalSession`。
5. **本地外传审计类**：先定义进程归属、授权偏差和分级证据契约，再接历史适配器；OS 文件/网络元数据实时采集必须显式开启，保持离线、不采集内容、不将请求体或凭据写入 authority DB。
6. **长期研究类**：skill→token 归因（与 issues 同源的 attribution not unique）、子代理编号空间、语义级任务分类（只允许本地呈现层，见发现 tab 规格 §3.4/§9.5）。

每次新增问题类，先在本图谱登记（问题、信号源、覆盖状态），再动 emitter——保证「发现」tab 的每一列都能回答"这数从哪来"。
