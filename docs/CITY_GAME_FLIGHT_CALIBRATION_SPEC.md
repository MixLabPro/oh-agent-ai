# Agent City 飞行手感校准与 tinyskies 借鉴 SPEC

日期：2026-10-09。状态：提案（数值为首轮调试起点，非承诺）。上位文档：[CITY_GAME_MODE_IMPLEMENTATION_PLAN.md](CITY_GAME_MODE_IMPLEMENTATION_PLAN.md)（§6.1 参数、§7.3 反馈、§11 G2.4 试飞校准、§13 第二阶段）；移植台账：[TINYSKIES_PORTING_ANALYSIS.md](TINYSKIES_PORTING_ANALYSIS.md)。

## 1. 背景与调研对象

游戏模式 G1–G3 已在分支 `worktree-city-game-mode` 实现。对照参考实现重读 tinyskies（commit `2659a5c`，本机 `/tmp/tinyskies`，2026-10-09 因系统清理重新克隆校验）七个核心模块（FlightControls/Plane/CameraRig/BiplaneMesh/RaceManager/PackageQuest/ProgressionManager），发现两类差距：**计划要求但未实现的手感项**（转弯减速），与**可选的体验/表现增强**。本 SPEC 把可落地项收敛为一批"试飞校准"工作，并为第二阶段登记设计存款。

授权与标注纪律沿用台账 §头：作者已授权参考与移植；**凡参照其代码形状重写的模块，头注释与提交信息注明出处与 commit**。

## 2. 范围与非目标

范围：运动参数 v2、追尾相机阻尼、碰撞反馈、飞机造型、竞速进入交互（可选）、第二阶段存款登记。
非目标（不做，维持计划与台账结论）：

- 加速带/桶滚/彩弹/战斗/HP——与"休闲难度、初学者可控"（§7.3）冲突；
- 数值成长与升级——若未来加入，成绩必须按物理配置分组（§13），本批不动；
- 音效——首版无声是计划允许的最终状态，音效钩子仅登记为存款；
- **不倒退**：穿环判定保持我们的连续环面+方向+扣安全半径扫掠（RaceManager 的球形半径触发弱于现实现，不借）；
- 不引入 tinyskies 的球面数学、多人后端、Game 总控。

## 3. R1 运动手感 v2（`FlightSimulation`，`PHYSICS_VERSION` 1→2）

参数仍是 §6.1 的"首轮调试起点"性质；变更点：

1. **转弯减速**（计划 §2 移植表明确要求、现实现遗漏；参照 Plane.ts:255-261）：
   `|turnRate| / turnRateMax > 0.1` 时，`speed -= (|turnRateNorm| × turnDragRate × cruiseSpeed) × dt`，下限 `minSpeed`。首轮 `turnDragRate = 0.25`（满舵每秒损失约 25% 巡航速度；上游为 0.8，但其速度量纲在半径 5 的球上，按尺度比折减后取保守值）。松舵即停止损失，不回补。
2. **不对称油门回落**（参照 Plane.ts:240-250）：当前速度高于目标（松 W / 超速回落）时回落率 = `accel × 0.12`，明显慢于加速率；S 刹车仍用 `brake`。形成"加速快、松手缓、刹车急"三档节奏。
3. **speedRatio 分段缓动**（参照 Plane.ts:403-413）：`[minSpeed, cruiseSpeed]` 线性映射到 `[0, 0.167]`；`(cruiseSpeed, maxSpeed]` 用 `t×(2−t)` ease-out 映射到 `(0.167, 1]`。该比例只供相机/HUD 消费，不进物理积分。

**版本与成绩分组**：`PHYSICS_VERSION` 递增为 2——`courseId` 含物理版本（§7.1/§9），v1 成绩与 v2 成绩自动分组，不迁移、不覆盖。重试复用原路线的行为不变（同版本内）。

## 4. R2 追尾相机与反馈（`FlightCamera` / `FlightVisuals`）

1. **closeDamp 距离相关阻尼**（参照 CameraRig.ts:121-124）：`damp = clamp(dist / (planeRadius × 5.2), 0.36, 1)`；位置阻尼 × damp，注视点阻尼 × damp × 0.78。近距跟拍更"黏"，注视点不跑赢位置（防甩头）。现有 `1−exp(−k·dt)` 形式不变。
2. **碰撞轻 shake**（参照 CameraRig.shake，Plane 无关）：碰撞温和重置时相机叠加 `amp = planeRadius × 0.35`、时长 0.25s、平方衰减的偏移；`prefers-reduced-motion` 或档案 `reducedCameraMotion` 偏好时禁用（§7.3）。灯光脉冲保留。
3. **环脉冲幅度**（参照 RaceManager.ts:195-197）：`1 + 0.10·sin(4.5t)`（现 0.04/4Hz），仅当前目标环。

## 5. R3 飞机造型（`FlightVisuals`，参照 BiplaneMesh.ts @ 2659a5c）

占位机升级为低模双翼机，仍全部基础几何、零贴图、预算内（对象数 ≤ 现有 +6，1 个新材质）：

1. **Lathe 机身**：24 段半径轮廓曲线（鼻锥缓入 → 等径段 → 尾椎 smoothstep 收敛），替换胶囊；
2. **圆角翼尖**：上下翼端以圆柱收边，去"积木感"；
3. **RimLight 边缘光**：onBeforeCompile 注入暖色 rim（`#ffeebb`，强度 0.25，幂 3.5；手法已在台账 §5.6 登记），黄昏场景显著提升可读性；
4. 斜撑/舱支柱、玻璃风挡为可选细节，不阻塞验收。

模块头注释注明：机身轮廓与 rim 手法参照 tinyskies `BiplaneMesh.ts`（commit `2659a5c`），按城市尺度重写。资源释放清单覆盖全部新几何/材质（20 次进入退出零泄漏不回退）。

## 6. R4 竞速进入交互（可选，默认关闭）

现状：进入挑战即在出生点 3-2-1。升级为**接近确认**（参照 RaceManager idle→approaching 语义，§3.4"接近起点后倒计时"）：

- 进入后飞机可低速滑行；距首环进近点一定范围内悬停/低速保持 `1.2s` 填充进度环（HUD 圆环或进度条），填满即 3-2-1；
- 任意时刻按 **Enter/空格** 立即开始；**Esc** 维持现有暂停/退出语义；
- 未填满离开范围则进度回退；不新增状态机相位（在 `countdown` 前加 `approach` 子阶段，暂停/错误/退出规则与 countdown 相同）。

实现开关 `raceApproachConfirm`（版本化配置，默认 on；关退回现行为）。时间预算不变：倒计时与任务计时仍从 GO 起算。

## 7. 第二阶段存款（登记，不实施）

| 借鉴点 | tinyskies 出处 | 对接我们的什么 |
| --- | --- | --- |
| 吊挂包裹钟摆（绳长/重力/阻尼/惯性） | PackageQuest.ts 常量组 | §13 DeliveryMission 携带感核心 |
| 配对生成约束（最小距离 dot + 分离度数组 + 有界重试 + 多 offer） | PackageQuest.ts `MIN_PAIR_SEPARATION` 等 | 公共地标配送对选择，复用 RaceCourse 候选-验证-降级骨架 |
| 一次性奖励 `xxxClaimed` 防重复发放 | ProgressionManager.ts | 外观奖励/路线解锁的发放幂等（与 runId 单次结算同族） |
| 世界弧长→HUD 显示距离换算 | PackageQuest.ts `WORLD_ARC_TO_METRES` | 「城市单位不标真实米」的读数换算先例 |
| 音效钩子（chime/celebrate/race_start；循环源 gain 差值淡入淡出；引擎音量与速度解耦的 `engineSpeedRatio`） | AudioManager.ts / RaceManager.ts / Plane.ts | 若做可关音效的接线参考 |

## 8. 尺度换算纪律（台账 §5.1 的强制适用）

tinyskies 的世界半径 5、速度 0.3–2.0；我们的城市对角线 ~10³。**任何借来的数值禁止原样搬入**：速度类按 `我们的量纲 = 上游值 × (D_城市 / 10)` 换算，频率类按 §5.1 除以世界尺度比，随后必须远距目检；换算式与目检结论写入参数配置注释。

## 9. 验收与测试

| 项 | 通过条件 |
| --- | --- |
| 运动 | verify-city-game-flight 增加：满舵 N 秒速度下降低于巡航 ≥ 预期；松 W 回落慢于加速；30/60/120Hz 确定性不回退；speedRatio 单调且分段连续 |
| 版本 | PHYSICS_VERSION=2 后 courseId 与 v1 不同（verify-city-game-race 增断言）；同版本重试仍同路线 |
| 相机 | reduced-motion 下无 shake；无 shake 时帧内相机路径与旧实现一致（阻尼变化仅手感，不引入跳变） |
| 造型 | typecheck/build；对象计数与 dispose 清单覆盖新几何；20 次进入退出零增长（浏览器复测） |
| R4（若启用） | 状态机测试覆盖 approach 子阶段的暂停/退出/回退；不启用时行为与现状逐字节一致 |
| 试飞 | 真机/浏览器试飞清单：急转掉速可感知、近距跟拍不甩头、黄昏 rim 可读、环脉冲醒目；结论回写本 SPEC 的参数表 |
| 门槛 | 原生 bundle 全流程 UAT（计划 §12）仍是开放入口的前置条件，本批不改变 |

## 10. 实施说明

- 全部改动落在 `apps/agent-city/ui/src/game/` 与 verify 脚本，无 Rust/SDK 变更；
- 提交按 R1/R2/R3/R4 分块，均可独立回退；
- 实施时同步更新移植台账 §3 第 1 项与 §2 已移植表（BiplaneMesh/RimLight 若落地）。
