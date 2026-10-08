# Agent City 城市驾驶模式 SPEC

日期：2026-10-09。状态：技术与产品提案，尚未批准实施。范围：在现有 City 插件游戏模式内增加单车驾驶体验；不是完整 GTA 克隆。上位设计：[CITY_GAME_MODE_IMPLEMENTATION_PLAN.md](CITY_GAME_MODE_IMPLEMENTATION_PLAN.md)；交互规范：[CITY_UX_SPEC.md](CITY_UX_SPEC.md)；飞机校准参考：[CITY_GAME_FLIGHT_CALIBRATION_SPEC.md](CITY_GAME_FLIGHT_CALIBRATION_SPEC.md)。

## 1. 目标与产品边界

让用户在熟悉的 Agent City 中驾驶一辆车，沿程序化道路自由探索，并可完成一类简单驾驶挑战。体验借鉴 GTA 的“第三人称城市驾驶与探索”，不追求 GTA 的犯罪叙事、开放世界内容量或真实车辆模拟。

首个 MVP 目标：

- 从 City 通用游戏入口选择“驾驶”，进入一辆可驾驶车辆；不要求先实现步行角色、上下车或车库。
- 在实际道路表面上完成加速、刹车/倒车、转向、车身姿态反馈、相机跟随和安全碰撞响应。
- 可自由驾驶；另提供一种短程检查点挑战，使用模拟时钟、暂停/重试/退出和本地最佳成绩。
- 驾驶结束回到进入游戏前的数据视角；不会改变真实会话、楼宇统计或其他分析数据。

明确不做：武器、警察/通缉、犯罪、行人伤害、多人/网络、任务奖励等级、车辆购买/升级、交通 AI、完整步行模式、可破坏环境、游戏录制。环境车辆可保留为静态/装饰对象，但 MVP 中不与玩家车进行动态碰撞，除非性能与稳定性验证证明值得加入。

## 2. 现有能力与缺口

当前 City 游戏代码已提供可复用的宿主运行时：单一 Three.js renderer 与帧循环、游戏相机所有权、互斥/暂停/退出状态机、画布焦点输入、固定步长、布局快照、HUD、结果与 `plugin.state` 档案端口。飞机模拟、飞机碰撞与路线任务不可直接作为车辆物理复用。

| 能力 | 当前证据/状态 | 驾驶模式影响 |
| --- | --- | --- |
| 道路拓扑 | `CityLayout` 有 `roadNodes`、`roadEdges`；edge 含 `points / width / kind / bridge` | 可作为可驾驶路网候选；仍需验证连通性、宽度、交叉口和不同 seed 的覆盖率 |
| 道路渲染 | `cityParts.ts` 基于道路布局绘制；另有 highways、bridge 等道路/结构 | 视觉网格不等于可碰撞路面；必须从同一来源构造物理/路面查询，避免错位 |
| 路面高程 | `layout.terrain.height(x,z)` 可查地形；桥梁布局 `BridgeLayout` 目前只有端点、角度、长度 | 桥面/坡道可能没有足以驾驶的高度剖面；高架道路与地面碰撞不能凭平面假设 |
| 飞行世界 | `FlightWorld` 主要有障碍盒、地形和出生点 | 可借只读布局快照、网格查询与生命周期思想；不可将其 AABB/安全出生点当成道路碰撞系统 |
| 车辆物理 | 仓库当前未声明 `cannon-es` 或 Rapier 车辆依赖 | 必须先做小型物理技术验证，再选择依赖或轻量自研方案；不要未经验证引入完整物理框架 |

**首要技术风险不是车模，而是“渲染道路是否构成连续、可寻址、能贴地的驾驶表面”。** 实施前必须先在多个 seed、不同城市规模、桥梁/河道/坡地上验证路面数据与视觉一致性。若该条件不满足，应先补道路表面契约或缩小为已验证的平地试验赛道，不得让车辆凭视觉上路、实际穿地/悬空。

## 3. 参考项目与借鉴边界

参考只作为设计研究，不是项目运行依赖，也不等于批准复制源码。实施前重新核对使用版本、许可证和来源；无明确许可证的仓库只阅读，不逐段移植。

| 参考 | 适合学习 | 不直接照搬 |
| --- | --- | --- |
| [icurtis1/raycast-vehicle](https://github.com/icurtis1/raycast-vehicle) | Three.js + `cannon-es` RaycastVehicle、轮胎射线悬挂、静态三角网格赛道、视觉体与物理体分离、阻尼追尾相机和实时调参面板；仓库标注 MIT | RC 车参数、GLB 测试赛道和后处理栈；我们的 City 网格/尺度/性能约束不同 |
| [pmndrs/cannon-es RaycastVehicle 示例](https://github.com/pmndrs/cannon-es/blob/master/examples/raycast_vehicle.html) | 轮位、悬挂、转向、制动、摩擦等车辆 API 最小样例 | 示例本身不是完整驾驶模型或游戏会话架构 |
| [depixeled-chris/gta7](https://github.com/depixeled-chris/gta7) | 城市驾驶的玩法组合、街道照明、车辆/行人/交通等系统如何组合；仓库标注 MIT | 它是独立垂直切片，绝大多数 GTA 玩法不属于 MVP；不要整体引入其架构或资产 |
| [YukihiroKimuraJ/mini-gta-3d](https://github.com/YukihiroKimuraJ/mini-gta-3d) | 小型 TypeScript + Three.js + `cannon-es` 城市沙盒的模块组织、任务与调试钩子 | 当前核对页面未见明确许可证；在许可证明确前仅用于阅读，不复制代码/资产 |

借鉴规则：保留出处、固定 commit 与许可证记录；优先借鉴算法/概念并按 City 世界单位重写。不上游多人服务、网络请求、音频素材、角色素材或任务成长系统。游戏始终离线，本地数据不因驾驶被上传。

## 4. 用户流程与操作

1. 用户在 City 通用工具中选择“驾驶模式”，可选“自由驾驶”或“检查点挑战”。默认数据模式不变。
2. 系统检查 City 已就绪、无航拍/视频导出冲突，选择可驾驶道路上的安全出生点；失败时给出可理解原因并允许重试/退出。
3. 车辆落在路面上，显示短控制说明。自由驾驶立即开始；挑战在起点静止/就位后开始倒计时（起点触发方式另在技术验证后定稿）。
4. 用户可暂停、继续、重赛或退出。Tab 隐藏、失焦、长帧、WebGL context lost 遵循现有游戏模式恢复语义；不追赶后台时间。
5. 退出时移除车辆、物理世界、事件监听和本模式资源，恢复相机/回放/标签/选择等原始状态。

初始键盘映射建议：W 加速，S 刹车/倒车（速度接近 0 后切换倒车），A/D 转向，Space 手刹（挑战外可选），R 回到最近安全道路点，Esc 暂停/继续。必须用 `KeyboardEvent.code`，仅游戏画布聚焦时消费；输入框、宿主控件、输入法组合不被拦截。首版不要求鼠标锁定、手柄或触控。

车速/档位等 HUD 仅为游戏状态，不显示用户数据、token、session、异常内容；碰撞和成绩不得解释为 Agent 效率或工作表现。车辆可以驶离道路短距离，但应有软提示和安全恢复边界，不允许穿越楼体/水域后永久困住。

## 5. 技术架构

### 5.1 共用运行时与隔离

沿用单 renderer、单 rAF、单相机所有者和游戏退出事务。飞机与车辆是同一 City 游戏宿主中的不同 vehicle adapter；不要复制第二套 CityEngine、相机生命周期、React 每帧状态或插件桥接。

建议将当前游戏引擎编排逐步收敛为：

```text
GameRuntime / GameSession
  ├─ Shared lifecycle: enter / pause / resume / restart / exit / ReturnState
  ├─ VehicleAdapter: FlightAdapter | CarAdapter
  ├─ VehicleWorld: FlightWorld | DrivingWorld
  ├─ Mission: RaceMission | RoadCheckpointMission
  └─ GameHud: shared shell + vehicle-specific control/telemetry panel
```

当前 `GameSelection` 仅覆盖 practice/race，后续扩展应使用显式 `vehicle: "plane" | "car"` 与 `activity: "free" | "challenge"`（或等价强类型），避免继续堆叠特定插件/载具分支。此 SPEC 不要求立即重构飞机代码；先提取必要的生命周期接口，保持既有飞机验收不回退。

车辆模拟与道路查询保持纯逻辑模块，不依赖 React；Three.js 层只将模拟状态同步到车模、车轮和相机。HUD 以事件/低频快照更新，不逐帧 React render。物理更新加入现有固定步循环；不得创建独立动画循环。

### 5.2 道路表面与 DrivingWorld

新增只读 `DrivingWorld` 快照，输入为进入时冻结的 `CityLayout`，输出至少包括：

- 可驾驶路段图：道路节点、边、中心线采样、宽度、路类、连通关系、是否桥梁/坡道；过滤人行 promenade、装饰道路和不允许驾驶的段。
- 路面查询：给定 `(x,z)` 返回最近合法路面、中心线切线、横向偏移/路宽、地表高程、坡度与有效性；桥面必须有与实际渲染一致的高度剖面。
- 空间索引：最近道路与静态碰撞候选查询有界，不能每个物理步扫描整张 road graph 或全部建筑。
- 静态碰撞：沿用建筑/地标数据作为保守障碍，但为道路表面、路缘、桥梁分别建模；不要把飞机使用的宽松盒直接当车辆可通行判定。
- 安全恢复点：来自已验证路段的采样位，车辆 footprint、朝向、地面高度和四周净空全部通过校验；无点时拒绝启动。

道路数据应成为渲染与驾驶共同消费的来源，至少共享路面采样/高程定义。若现有道路中心线无法给出实际 road mesh 的边界、高度或桥坡，先补 `RoadSurface` 数据契约；不从屏幕截图反推物理表面。

### 5.3 车辆动力学决策门

目前没有已选定的物理模型。第一个迭代先用同一条短测试路段比较两种方案：

| 方案 | 优点 | 风险 |
| --- | --- | --- |
| 轻量 arcade/bicycle model（速度向量、横向抓地、转向随速度变化、坡度贴合） | 依赖小、容易适配固定步长和确定性，也容易保持“休闲、可控” | 轮胎悬挂、跳跃、路面冲击和翻车反馈较弱，需仔细控制横向滑移 |
| `cannon-es` RaycastVehicle（或经评估的等价库） | 轮胎射线、悬挂、摩擦和接触点较成熟，适合路缘/坡道/起伏 | 仓库当前无此依赖；需评估打包体积、初始化/释放、固定步集成、determinism、地形网格成本与 WebView 性能 |

选择门槛：比较 City 道路贴合精度、碰撞可控性、输入延迟、30/60 FPS 下稳定性、城市最坏种子 CPU P95、额外内存/包体、重复重置与清理结果。未测前不写死“必须用 Cannon/Rapier”或“自研即可”。MVP 应选择能达到稳定可玩体验的最低复杂度方案；不追求完整汽车工业级轮胎模型。

无论选哪种，车辆至少有位置、朝向、线速度、角速度/转向状态、接地状态、模拟时钟；固定步长积分与渲染插值；速度上限/加速度、制动/倒车、横向摩擦、转向响应均配置化，单位按城市世界单位标注。连续碰撞检测或受限子步进避免高速穿楼；车辆车轮/底盘视觉状态服从物理姿态，不能各自独立漂移。

### 5.4 相机、输入与物理反馈

- 车辆相机归 `cameraOwner=game`，使用平滑追尾与障碍遮挡处理；鼠标 orbit 仅在暂停/退出驾驶后恢复。
- 车速可控制镜头距离/FOV 的轻微变化，reduced-motion 偏好可关闭冲击 shake/FOV 动态。
- 碰撞反馈先通过减速、短暂镜头/车身响应、HUD 提示传达；不可将随机逐帧抖动作为唯一反馈。轻微擦碰与不可通过障碍需有不同处理。
- 驶离路面时车辆保留有限控制，越界或翻覆后可回到最近安全路段；恢复应重置速度并给短暂免重复触发保护，不造成任务瞬移计时作弊。

## 6. MVP 模式与挑战

### 6.1 自由驾驶

- 一辆程序化/项目自有低模车辆，视觉风格与 Agent City 协调；不得直接依赖参考仓库外链模型。
- 安全道路出生点；开放道路自由行驶；建筑、桥墩、水域和地图边界有碰撞/恢复。
- 无交通 AI、无行人、无犯罪/伤害系统；背景车仅装饰且不会与玩家车发生不可预期物理冲突。
- 玩家可随时 Esc 暂停、R 安全复位、退出返回原视角。

### 6.2 检查点挑战

- 路线从经过验证的连通道路图上生成，不通过楼内、步道、断头路或无高程桥面。
- 首版建议 5–8 个检查点，路口前有足够预告，避免强迫高速急转；可以固定一条验证路线起步，再扩展确定性变体。
- 检查点顺序、方向、有效路面和宽度需校验；使用连续路径/区域穿越判定，不能只靠一个低帧率点距离检测。
- 倒计时、任务时钟、暂停、超时、重赛、退出沿用现有 race mission 合约；车辆碰撞罚时是否加入，先由用户体验决定，首版推荐只做轻量复位，不叠复杂罚时规则。
- 成绩仅按 `courseId + vehiclePhysicsVersion + rulesVersion` 比较，记录最终时间与复位/碰撞数；失败不覆盖最佳成功成绩。不奖励 token、等级或虚拟货币。

## 7. 状态、存档与数据隔离

- 飞机与汽车模式互斥，一次只允许一个活动 vehicle session。进入前检测城市就绪、摄影/导出/忙碌状态。
- 复用当前游戏模式暂停来源、Tab 隐藏与恢复行为；结果面板不自动重开，退出与清理幂等。
- 使用现有插件隔离 `plugin.state`，建议新增 `vehicle-profile:v1`，或评估是否把同一游戏档案升级为包含 `vehicles` 的兼容 schema；不可因新载具覆盖旧飞机成绩。
- 只存用户偏好与有限挑战纪录，不存 session handle、提示词、工作路径、车辆行驶轨迹或真实分析数据。损坏/未知版本遵循现有档案保留与只读降级规则。
- 无授权插件端口时只使用预览 localStorage/内存并标明“不持久保存”；不访问 authority DB，不请求任意 Rust IPC，不新增外网依赖/遥测。

## 8. 建议目录与 API 草案

实际目录以当前代码复用为准，候选新增模块：

```text
apps/agent-city/ui/src/game/
  DrivingWorld.ts            冻结路网、路面/高程/净空查询、空间索引
  DrivingSimulation.ts       固定步长车辆状态与动力学（纯逻辑）
  DrivingCollision.ts        道路边界、建筑、地形、边界扫掠
  CarVisuals.ts              车身/车轮视觉同步、资源释放
  DrivingCamera.ts           追尾相机目标与遮挡约束
  RoadCourse.ts              确定性道路路线生成与可达性校验
  RoadMission.ts             检查点进度、计时、终态
  VehicleAdapter.ts          载具生命周期接口；Flight/Car 分别实现
  DrivingHud.tsx             速度、挑战进度、简短控制提示
```

候选载具接口：`prepare(world) / reset(spawn) / step(input, dt) / snapshot() / dispose()`。所有创建的物理世界、几何、材质、监听和临时对象必须由该适配器释放；CityEngine 继续拥有 renderer 与统一帧循环。

## 9. 迭代计划

总计三个迭代交付 MVP；每一阶段都可停止并保留已验证成果。

### V1：道路可驾驶性与物理选型 Spike（先做，硬门槛）

- 审计 `roadNodes/roadEdges/points/width/bridge` 与实际 road mesh，统计不同 seed/scale 的连通分量、可驾驶边长度、窄路占比、端点连接误差。
- 明确道路/桥梁 surface 高度来源，制作最小 `DrivingWorld` 查询原型；验证桥面、坡道、交叉口、路缘/地形一致性。
- 在静态测试世界比较 arcade 模型与 RaycastVehicle；不接宿主完整 UI，先测输入、操控、碰撞、帧时和包体。
- 输出决策记录：采用模型、物理参数量纲、道路契约缺口、性能基线、许可证/版本与不采用方案理由。

验收门槛：多 seed 路面查询成功率、车道内 spawn 成功率和连通路径覆盖达到项目后续定值；否则 V1 转为修路网/道路 surface 数据，不进入集成阶段。不得伪造这些指标已经达标。

### V2：自由驾驶垂直切片

- 加入车辆 adapter、输入、车辆相机、道路贴合、碰撞与安全复位。
- 接入既有暂停/退出/恢复/UI 状态；验证切换 Tab、失焦、resize、连续进退与 WebGL 错误。
- 先覆盖浏览器预览和合成/本地布局；稳定后再做原生 bundle 验收。

验收：能够从安全道路出生点连续驾驶至少 5 分钟；转弯/制动/倒车可控；桥坡和路口不悬空/穿地；碰撞可恢复；退出后相机和 City 标签/回放状态恢复；重复 20 次进退没有车辆/监听/物理体累积。

### V3：检查点挑战与原生 UAT

- 确定性路线、可达性验证、倒计时/计时/结果、成绩存档与双语 UI。
- 接入开发入口后保持发布门槛；通过 TypeScript、verify 脚本及所选物理库测试。
- UAT 覆盖成功、超时、暂停/恢复、重赛、换路线、存档失败、退出回 City 与宿主其他 Tab 不受影响。

## 10. 测试与量化验收

自动化/守卫至少覆盖：

1. 固定输入和不同 render Hz 下，固定模拟步长轨迹一致；W/S/A/D 同时输入边界明确，速度与姿态无 NaN。
2. 道路 graph 连通性、边宽/中心线查询、交叉口与桥梁高度、候选 spawn 的确定性；失败必须明确拒绝，不能静默放到路外。
3. 车辆 footprint 对静态障碍的扫掠碰撞、路面贴合和边界；高速连续步不穿越建筑，桥梁上/下层判定正确。
4. Route/mission 同 seed 与版本输出稳定；检查点反向/越序/瞬移规则明确；暂停不推进模拟时钟。
5. 输入焦点、画布失焦清键、输入框忽略、监听 attach/detach 配对；游戏退出归还 camera owner。
6. 资源计数：多次进入退出后车辆 meshes/geometry/materials/physics bodies/listeners 归零；renderer 保持存活。
7. 性能采样至少覆盖低端配置、30/60 FPS、不同 DPR、0/90/500 会话布局；记录车辆新增 CPU P95、总帧时增量、draw calls、物理体数与依赖包体。验收预算在 V1 测量后制定，不预填未经证实的数字。

测试入口遵循仓库既有 `scripts/verify-city-game-*.mjs` 风格，并新增独立 driving world/simulation/session 守卫。Rust 只在存档端口契约变更时测试；不得为驾驶玩法查询 authority DB。

## 11. 风险与决策清单

实施 V1 前需回答：

- 道路 mesh 与 `RoadEdge.points` 是否同源、同高度？桥面高程从哪来？
- 路网是否足够连通与宽阔，使普通城市 seed 可完成安全出生和挑战路线？
- 选择轻量 arcade 还是刚体 raycast vehicle？物理库能否与当前 Three.js WebView bundle、CSP/打包和固定步循环可靠共存？
- 道路外驾驶允许多远？撞楼是停住、弹开还是复位？水面是否视为不可通行？
- 驾驶挑战碰撞是否罚时？车辆最佳成绩如何与飞机结果分组？

任何车辆物理或规则变化都使用独立 `vehiclePhysicsVersion` / `drivingRulesVersion`，不更改飞机 `PHYSICS_VERSION` 或污染飞机成绩。相机/车模等纯视觉调整不需要物理成绩版本升级。

## 12. 参考链接

- TinySkies 项目：<https://github.com/dannylimanseta/tinyskies>。它是球面飞机游戏，不是汽车物理参考；只借相机/输入/任务组织的思路，不把 Plane 运动参数迁移到汽车。
- Raycast Vehicle 样例：<https://github.com/icurtis1/raycast-vehicle>。
- cannon-es 官方 RaycastVehicle 示例：<https://github.com/pmndrs/cannon-es/blob/master/examples/raycast_vehicle.html>。
- GTA 式 Three.js 城市切片：<https://github.com/depixeled-chris/gta7>。
- mini-gta-3d：<https://github.com/YukihiroKimuraJ/mini-gta-3d>（许可未确认，不复制）。
