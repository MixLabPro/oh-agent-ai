# Three.js 赛车/驾驶游戏源码调研（驾驶模式参考补充）

日期：2026-10-15。状态：调研记录， clones 在 `/tmp/threejs-racing/`（临时目录，不进仓库）。上位文档：[CITY_GAME_VEHICLE_MODE_SPEC.md](CITY_GAME_VEHICLE_MODE_SPEC.md)（本调研补充其 §3 参考表，针对 V1 剩余缺口：坡度动力学、路面提取、擦碰响应、V3 检查点体验）。许可纪律同台账：只借概念按 City 世界单位重写；逐段移植须固定 commit 并登记许可。

## 1. 调研对象总表

| 仓库 | 许可（已核） | 技术栈 | 对我们的价值 |
| --- | --- | --- | --- |
| [BKcore/HexGL](https://github.com/BKcore/HexGL) | MIT（2015 改版；早期 CC） | three.js r60s + 自研悬浮艇物理 | 路面掩膜碰撞/助推区/擦碰排斥；漂移横向通道 |
| [MankyDanky/web-racing](https://github.com/MankyDanky/web-racing) | MIT | three.js + Ammo.js RaycastVehicle + GLB 赛道 | 现代 Ammo 车辆接线全貌；转向回正速率不对称；门渐显 UX |
| [mauriciopoppe/Three.js-City](https://github.com/mauriciopoppe/Three.js-City) | Apache-2.0 | 老版 three.js + 纯街机模型 | **坡度减速项**（tilt 进速度方程）；引擎音调随速度 |
| （SPEC §3 已录）icurtis1/raycast-vehicle、cannon-es 示例、gta7、mini-gta-3d | MIT/MIT/MIT/未确认 | — | 见 SPEC §3，不重复 |

旧 API（r50–60s）意味着 HexGL/Three.js-City 代码不可直接运行，全部为概念级借鉴。

## 2. 关键发现（按我们的缺口映射）

### 2.1 坡度动力学（我们最大的"体感谎言"缺口）

**Three.js-City `Car.js`**（Apache-2.0）：`computeSpeed(direction, oldSpeed, delta, tilt)` 的第四参就是坡度项——`newSpeed = min(maxSpeed, oldSpeed + accel*delta - |tiltAmount|*30)`，**上/下坡直接改变速度积分**；且其位移用梯形积分 `(oldSpeed+newSpeed)/2*delta`（比我们的欧拉前向更稳一档）。实现只有一行量级——正是此前评审建议的 `加速度 ∓ g·sin(pitch)` 的街机等价物。**建议照此概念在 `DrivingSimulation` 增加坡度项**（借概念+注明出处；Apache-2.0 若逐段复制需保留 NOTICE，概念级无需）。

### 2.2 路面表达的三种流派（对照我们的解析 patch 方案）

1. **图像掩膜**（HexGL `collisionCheck`）：赛道可行驶性编码成一张 collision.png，每帧 `getPixelBilinear(x,z)` 查墙、查助推区（按像素颜色），墙内侧以左右探针采样决定排斥方向。优点是美术可控、查询 O(1)；缺点是非解析、不可确定性断言、内存随城市面积增长。**对我们的价值**：RoadSurface 提取后的"可行驶热力图"可视化调试工具（把 DrivingWorld 覆盖率画成图片供 §13.4 验收看），而不是替代解析查询。
2. **网格碰撞体**（web-racing `track.js`）：GLB 赛道 → 遍历 mesh 合并世界空间顶点/索引 → `btBvhTriangleMeshShape`。这是"从渲染网格构造物理面"的完整参考代码（顶点变换、索引偏移、非索引展开都处理了）。若 V1 发现解析提取覆盖不了复杂路口，这条是回退路线；也验证了 SPEC"视觉网格 ≠ 可碰撞路面，必须同源构造"的警示。
3. **解析几何**（我们现状）：矩形/多边形 patch + 显式连接。仍是确定性最强、内存最省的选择，维持。

### 2.3 擦碰响应（SPEC §13.2"轻擦沿切线滑动"尚未实现）

HexGL 的墙排斥三件套值得借概念：**速度平方尺度的伤害/衰减**（`shield -= speedRatio²·damage`——高速撞墙重、低速蹭墙轻）、**左右探针定向排斥**（在车体左右各采样一步，哪边更"空"往哪边推）、**排斥力上限与最小值**（0.8–cap，防瞬移也防粘墙）。比我们现在的"一律停住"细腻，且仍是纯运动学可确定实现。

### 2.4 手感参数（V2 调参素材）

- **转向回正快于打入**（web-racing `updateSteering`）：回正速率 > 施加速率，且换向时用回正速率——我们是对称指数平滑，值得一档对照试验。
- **速度相关最大转角**（web-racing 按 km/h 分档 `calculateMaxSteeringAngle`）：我们已有 `1/(1+0.07|v|)` 连续版，两者对照。
- **漂移横向通道**（HexGL `movement.x += speed·drift·dt`，drift 由按键与 lerp 驱动）：未来"路肩降抓地/漂移"的最低成本实现形状——横向速度分量独立于航向。
- **引擎音调**（Three.js-City：`playbackRate = |speed|·4/maxSpeed`）：直接可用于 `GameSfx` 引擎循环。

### 2.5 检查点体验（V3）

web-racing `gates.js`：仅当前门可见、下一门**淡入**（1s 透明度过渡）、通过即渐隐——比"12 环全显"更聚焦；但其判定是**距离触发**（`checkGateProximity` 平方距离），弱于我们 RaceMission 的连续环面扫掠判定——**UX 借、判定不借**。

### 2.6 不借清单

- HexGL 的 CoffeeScript 时代 API（`addSelf`/`rotateByAxis` 已删除）、Leap/重力感应控制器（非目标）、护盾/武器语义；
- web-racing 的 Peer.js 多人后端、Ammo 全家桶（SPEC §5.3 决策门未触发不引入）、GLB 资产管线；
- Three.js-City 的 dat.gui 调参面板（我们用版本化配置）、城市生成（自有 cityPlan 更强）。

## 3. 落地建议（并入现有批次计划）

1. **立即**（城市接入批次顺手项）：`DrivingSimulation` 加坡度项（借 Three.js-City 概念）；`GameSfx` 引擎音调随速度比。
2. **V2 调参档**：转向回正不对称、擦碰探针排斥（借 HexGL 概念），进校准回放脚本做 A/B。
3. **V1 路面提取的调试工具**：把 DrivingWorld 覆盖率渲染成热力图 PNG（借 HexGL 掩膜思路），供 §13.4 验收证据。
4. **V3**：检查点淡入 UX（借 web-racing）。
