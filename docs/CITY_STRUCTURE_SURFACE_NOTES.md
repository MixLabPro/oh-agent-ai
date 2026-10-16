# A6：结构描述符、整城驾驶路面聚合、会话矩阵与宿主快照端口

日期：2026-10-15。接 [A5贴地记录](CITY_GROUND_SURFACE_TERRAIN_FIT_NOTES.md) 与 [A4区域记录](CITY_SURFACE_REGIONS_NOTES.md)。本轮完成A批次的剩余几何部分。**不认证任何道路可通行**：`geometricallyEligibleLength` 仍为0，跨层portal、固体碰撞（CollisionIndex）和正式开放图仍归B/C/D。

## 代码入口（相对UI src）

| 文件 | 作用 |
| --- | --- |
| `engine/surface/structureProfiles.ts` | 高架剖面常量与 `expresswayDeckHeights`（从 render/shared 移出，shared 原样re-export） |
| `engine/surface/structureCompiler.ts` | 纯描述符：`bridgeDeckParts`、`expresswayPieces`、`trussBars`/`trussBarPart`、`culDeSacDiscs`/`culDeSacTopCap`、`channelizedGeometry`/`flareTriangles`；`eulerMatrix`（XYZ/YZX/YXZ，与THREE同公式）、`boxPoint`/`boxTopFace`/`boxCorners` |
| `engine/systems/roadSystem.ts`（改） | 桥面/高架/桁架/尽端圆盘/渠化口改为消费描述符，自身只负责组实例矩阵 |
| `engine/surface/compileSurface.ts` | `compileCitySurface(layout)`：地面路面 + 喇叭口 + 分流岛 + 尽端圆盘 + 桥面 + 高架合成一份 `CompiledCitySurface`（geometryVersion 2），另输出静态障碍、桥头/匝道 `landings` 和计数；`landingConnectivity(编译结果, 区域)` 按区域规则给出桥头是否真正连通 |
| `engine/surface/terrainClip.ts`（扩） | `terrainFit(layout, lift)`（精确贴地判定，路面与喇叭口共用）、`conformMesh`（任意共享顶点网格的保形裁剪）、`earClip`、`convexHullOf` |
| `engine/surface/citySurfacePort.ts` | `CitySurfacePort`：按需编译、发布到SurfaceStore（本地SHA-256）、按revision读取；invalidate后旧捕获读不到，在途捕获返回stale |
| `engine/cityParts.ts` / `CityEngine.ts`（改） | 路面只编译一次，渲染与驾驶共用，并随静态城缓存保存；`parts.drivingSurfaceSource()` 返回**当前画出来的**静态城所用的布局与地面编译（静态缓存可能沿用旧布局对象）；`CityEngine.captureDrivingSurface(signal)`；applyModel / setSeed / dispose 时invalidate |

## 规则

- **渲染与驾驶同源**：几何只在描述符里算一次。驾驶取BOX实例的真实顶面（缩放 → Euler旋转 → 平移），不按 `deckHeights + 厚度` 猜；行车面横向收到护栏内侧（桥：width/2 − 0.3；高架：±4.95）。车道线和虚线0.025–0.05高，按路漆处理，不算台阶。
- **层**：
  - 地面路、喇叭口、尽端圆盘、分流岛都在 `ground` 层。
  - 桥面若在离两端3个单位以外不压任何不属于两端节点的地面车行面（即跨河），也放进 `ground` 层，两端叠置由alias规则判：接得上就同区域，接不上就是conflict/step，关闭——这就是同层落地。
  - 压着地面路的桥面（立交）用 `bridge:<id>` 层，每条高架用 `expressway:<i>` 层。**跨层portal未实现**，这些入口一律关闭。
- **渠化口**：喇叭口改为贴「渲染地形 + 0.035」并保形（原来按 `terrain.height` 真值取高，坡地上会与路面错开），平地和线性坡上与原几何一致。分流岛是 `island`，在区域里是curb孔洞，同时输出为棱柱障碍。
- **尽端圆盘**：顶面取自渲染器的倾斜圆柱顶盖（20段），比路面高0.10，在接缝容差内（alias比较加1e-6浮点余量，规则版本v2）。
- **静态障碍**（交CollisionIndex，本轮不参与碰撞）：桥护栏、桥墩、高架护栏、高架桥墩、桁架杆件（8角点），分流岛（棱柱）。地面路缘仍由人行道边界的curb语义表达，未输出为障碍盒。
- **扇面**：只有多边形相对扇心呈星形时才用扇形三角化；不是星形的（偏移1.2的转角人行道圆弧）改用耳切；自交的闭合渐变轮廓用其凸包。星形扇面的三角形与原来逐字节一致。

## 证据

- **渲染不变**：`fixtures/city-driving/structure-render-baseline.json` 记录了改动前（8ec8c11）十五城五个结构系统的实例矩阵、颜色和几何属性摘要；`verify-city-structure-surface --cities` 逐城逐系统字节对照，全部一致。道路标线守卫（含合成渠化场景）全部通过；合成场景补了 `extent`，因为喇叭口现在按渲染地形三角网取高，真实CityLayout都带这个字段。
- **变换精确**：pure Euler/BOX变换与THREE `Matrix4.compose` 在三种顺序下误差 ≤1e-9；尽端顶盖与THREE圆柱顶盖误差 ≤1e-6。
- **合成夹具**：
  - 平岸桥：两端连通，内核从西开到东；
  - 西岸低0.56：台阶，被挡在西桥头；
  - 立交：桥面单独成层，桥下路不受影响，没有隐式跨层；
  - 悬空端报no-ground，多点桥报unsupported；
  - 高架：单独成层，中段顶面9.1，匝道末端比路面高约0.26，护栏界±4.95；
  - 40°渠化T口：岛是curb；
  - 尽端圆盘：路宽以外可行驶，与道路同区域。
- **十五城规划布局**：
  - 所有编译片段的边界都是流形（修复前seed 7 tier 3有1个人行道扇面例外，现为0）；
  - 28座桥、56个桥头中，按区域规则只有**3个**与桥面连通。其余为deck-end-blocked 31、ground-blocked 15（桥对岸在渲染路网里没有路）、different-region 7；
  - **没有一座桥两端都连通**（A6时）——A7修复后见下节。
- **0/90/500会话 × 5种子的显示布局**（`verify-city-surface-sessions`）：
  - 每层精确贴地，所有片段边界是流形；
  - 地面路/路口片段之间高差冲突为0；
  - 299/299次直路同核试跑每tick独立复核合法；
  - 桥头连通0–1个。

## A7：桥面视觉修复（2026-10-16，经产品确认）

A6 的发现：原来的桥面是一块平板，顶面取两岸**原始**地形高度的较大值，而引道贴着渲染地形、带坡度；桥头路面要么戳出桥面，要么形成 0.1–1.1 的台阶，十五城没有一座桥两端都接得上。现修复如下：

- **斜板桥面**（`bridgeDeckProfile`）：每个落在道路上的端点，桥面顶高等于该处的渲染路面高（渲染地形 + 0.04），中间线性过渡；没有路的一端沿用已落地一端的高度，避免伸进水里；两端都没路时保持原平板。桥面按两端路面横坡的平均值做横向倾斜（BOX 不能扭转）。护栏、车道线和虚线立在桥面实际顶面上，桥墩顶跟随剖面，桁架弦杆随纵坡倾斜，悬索桥的塔、主缆、吊索和灯串都以同一剖面为底（无落地道路时保留原有的最低 0.3）。
- **区域规则 v3：桥面遮挡**：同层、被桥面盖住、且不高于桥面超过容差的地面片段，不算冲突、也不提供支撑（桥头扇面会伸进桥跨 1.5–2.3）；高出桥面超过容差的才判为高差冲突。桥面端边与地面的接缝照旧检查台阶。
- **渲染基线**：桥面所在的基础设施系统（15 城）和桁架（12 城）改为对照 `corrected` 段，并记录原因；路缘单独摘要，与改动前逐字节一致；高架、尽端、渠化口仍逐字节一致。地标基线（含悬索桥合成场景）与 golden 一致。

**结果（十五城规划布局）**：

- 56 个桥头中 37 个与桥面连通（修复前 3 个）；15 个属于对岸没有道路的断头桥；4 个仍不连通（different-region）。
- 两端都落在道路上的 13 座桥里，10 座两端连通（修复前 0 座），每座的桥跨本身都能被内核整段开过。
- 沿桥轴从引道开到对岸引道：7 座通过。另 3 座卡在桥头区，如实上报：
  - 1/2：出生区有一块局部冲突；
  - 7/3：对岸引道有转角，直线驾驶撞上路缘（桥跨已开过）；
  - 2026/3：桥尾前 1.4 处有一块局部冲突。
- 仍关闭的 2 座：7/1 两端横坡方向相反，单块 BOX 无法扭转；42/2 是一座很短的桥，紧挨一条陡升道路，戳出 0.74。

合成夹具：西岸低 0.6 的桥两端都连通，内核可以爬坡通过；两端横坡相反的桥保持关闭；断头桥远端在水上时桥面保持落地端高度。

后续可选：把桥面拆成多段 BOX 以支持扭转（可修复 7/1 这类）；守卫里的直线测试改为沿路线跟踪（7/3 这类本身不是几何问题）。

## 未完成（移交）

2026-10-16后续：实体板底、宿主所有权/worldRevision和独立坡度/净空检查已开始补齐，见 [任务1/2实施记录](CITY_DRIVING_STRUCTURE_HOST_PROGRESS.md)。新端口使用readWorld()/checkStructures()，不再暴露原始compilation。几何版本为3；下列A6/A7剩余项仍需逐项关闭。

- 跨层portal（立交桥、高架匝道；高架匝道末端在渲染上本来就有约0.26的台阶）。
- CollisionIndex 接入 `obstacles`；SafeRecovery；正式开放图与审计（B/C/D）。
- 宿主端口已接CityEngine，但尚无运行时消费方（GameRuntime/CarAdapter属E）；编译在主线程同步执行，Worker是后续项。
- 含修复补丁（planPatch）的显示布局未纳入会话矩阵；原生bundle性能与内存未测。
- 已存在的守卫失败（与本轮无关，在744f926上就失败）：`verify-city-culdesac-bulbs`（380会话布局 `culDeSacEnds` 为空）、`verify-city-scene-baseline`（场景图摘要不一致）。

## 命令

```sh
node scripts/verify-city-structure-surface.mjs            # 合成 + THREE对照 + 宿主端口
node scripts/verify-city-structure-surface.mjs --cities   # 十五城渲染字节对照、桥头连通、同核过桥
node scripts/verify-city-surface-sessions.mjs             # 0/90/500会话 × 5种子显示布局
```
