# 城市驾驶收尾检查表

2026-10-16，分支 `codex/city-driving-car-model`。此表跟踪“完成上述任务”的完整范围，不能把局部修复、几何连通或采样无占路当作正式开放证明。具体契约以架构 SPEC、产品 SPEC 与 Agent 交接文档为准。

| 要求 | 当前证据 / 剩余工作 |
| --- | --- |
| C：贴墙查询预算、TOI/法线/滑动、坡度和帧率一致性 | 已实现；`verify-city-continuous-driving.mjs`，真实接触用例参数 `--contact-cities`。碰撞版本 3；旧合成 tick 38 复现运行 600 tick 已解决。 |
| 宿主 freshness 性能 | `54064652`：冻结源快检 `isLeaseCurrent()`，深检 `verifyCurrent()`；正式入口和每帧运行时使用快检，宿主浏览器与会话守卫已验证。原生性能仍待测。 |
| A：高架桥墩占路 | `1ad86f5d`：门式双柱与横梁，共享真实渲染/碰撞；15 Miami 场景的占路诊断为零。 |
| A：7/1 唯一连接桥反向横坡 | `1ad86f5d`：桥面分段；两岸连通，双向 572 tick 整车连续独立复核通过。 |
| A：机场、区级地标、桥头桁架 | 几何版本 7：机场堤道按道路高度保留 2 高净空；地标检查真实道路/人行道三角形并增加真实街区中心候选；低位桁架在两岸各内退至多 8。`verify-city-road-obstructions.mjs` 的 15 实际场景全部无静态占路见证。此为诊断，不是道路开放证据。 |
| A：0/1 (158.7,429.1) 轮面扭曲 | 已实现，几何版本 8：实际地形精度 192→384，原始高度场及路网不改。`verify-city-road-terrain.mjs` 核对 148,225 个实际地形顶点、32 个朝向与整车双向连续试跑；保持 0.06 约束。15 规划布局的路面/结构检查、15 实际场景静态占路诊断、30 次试跑/1800 独立复核 tick 通过。长边界提取改为轴向扫描，预算保持 20 万。地形顶点约四倍，原生性能仍待 E 验收。早期填方原型已撤回。 |
| A：42/2 桥头、其他局部冲突 | **待处理，桥面/桥头原型已撤出活动代码**；`-319.94:707.54/-328.75:712.17` 桥长约 9.95，192 精度的岸侧横断面为 V 形。纵横分块 BOX 可改善静态连通，但整车引道试跑仍失败：384 精度下短桥起点 excessive-slope，长桥 `145.25:-689.12/186.19:-660.49` 在接缝前车底接触底板。长桥在提交版本 7 也有连续查询失败，已独立重放。下一步处理真实桥头/引道工程几何；不能仅按静态连通放行。 实验补丁保存在 `/tmp/agent-city-bank-loft-prototype.patch`，不属于已验收实现。规划层 `roadApproachMaxSlope=6` 是历史岸边引道豁免，远大于车辆的 0.3 rad 限制；单靠接缝 BOX 无法使真实陡坡可驾驶。 |
| B：安全恢复、逐路静态审计、观察器接线 | 用户/协作方负责；已有 `SafeRecovery`、`RoadPassabilityAudit`，合并其最终证据后核对真实流程，不另建同名协议。 |
| D1：全量场景用例及结果 | 协作方发布结果；需要按最终几何版本重新生成证据，旧 key 不可继承。 |
| D2：开放图、证据存储、可定位故障的出生路线 | 有界内存证据库及 runner/B 审计/调度取消接线已实现，见 `CITY_AUDIT_EVIDENCE_NOTES.md`；默认 600 tick、32 片段、8 MiB，同内核一致性及失效/淘汰回归通过，界面消费仍待 E。`ReleasedDrivingGraph` 最小切片已实现（`verify-city-driving-release-graph.mjs`，入 game 模块链）：发布门复检 ready+边界 hash、green 子集只含 passed、图与 key/租约绑定失效。**仍待完成** 故障分解出生路线、审计界面消费（E）。pending/blocked/inconclusive 不混入图。 |
| 正式出生点 | SPEC §13.5 契约已定（`a7489eeb`）；图几何 vNext 已落：开放图发布时从审计案例提取 verified centerline（多案例歧义单元不带几何）；`spawnPoints.ts` 派生器用真几何出中点候选（守卫 `verify-city-driving-spawns`，入 game 链）。**仍待完成** 产品确认入库流程、边界余量/朝向校验（依赖图几何带宽字段）。 |
| E：正式驾驶宿主入口 | 建筑碰撞现可同时接入白名单 `sceneSolids` 代理与 `renderedSolids` 逐实例保守包围盒，和结构体进入同一个有预算上限的碰撞索引；渲染盒模型建筑的投影边界与绘制 footprint 一致，非盒网格用不小于其绘制范围的 AABB。坏数据/超预算显式拒绝，coverage 标明来源。守卫：`verify-city-car-session.mjs`、`verify-city-car-rendered-collision.mjs`。正式入口 React 桥 `useCityDriving` 已实现（互斥门控/入场暂停/Esc 语义/低频 HUD 快照；守卫 `verify-city-driving-entry` 入 game 链）。**仍待完成** CityApp 工具栏按钮与驾驶 HUD 接线、连续内核城市实驾验证、原生 bundle 验收。 |
| E：HUD、本地审计界面、原生 bundle 验收 | **待完成**。原生仅构建 `.app` 后通过 `open` 启动；未验收前不得声称正式驾驶可用。 |

本地保存证据，禁止上传用户日志/分析数据。渲染基线只为经审阅的真实几何变化增加记录；保留历史基线和未通过结果，不通过改快照掩盖故障。
