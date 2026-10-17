# 可越障碍（mountable curbs）设计契约

日期：2026-10-17。状态：设计提案，未实施。上位：[产品 SPEC §13.2](CITY_GAME_VEHICLE_MODE_SPEC.md)（碰撞与复位规则）；[路面区域规则](CITY_SURFACE_REGIONS_NOTES.md)（curb/step 边界语义）。

## 问题

赛车游戏常允许轮胎爬升低矮路缘/减速带（高度 ≤ 轮胎半径的 60%），但高墙/柱子/建筑仍应挡住车。当前实现没有这套规则——`curb` 边界一律阻挡，没有"可越"通道；而障碍高度不影响碰撞判定（整车 OBB vs 固体 AABB，不管 AABB 多矮都挡）。

**当前代码已有的基础设施**：
- `surfaceRegions` 输出 `curb`（人行道/分流岛边缘）和 `step`（同区域内台阶）边界标签（`surfaceRegions.ts:447, 64`）；
- `surfaceFootprint` 有 `maxStepPerSample: 0.18`（步高上限）和 `maxSlope: 0.3 rad`（坡度上限）——但这两个参数用于**拒绝**超限运动，不用于**允许**爬升障碍；
- `CollisionIndex` 的固体碰撞是硬阻挡（整车 OBB vs AABB SAT），不看高度差。

## 设计原则

不引入悬挂仿真或独立轮胎碰撞。整车按坡度限制"虚拟爬升"：

1. **障碍分类**：`mountable`（可越，高度 ≤ 可越阈值）vs `blocking`（阻挡，其余一切）。可越阈值 = 轮胎半径 × 0.6 ≈ 0.144 世界单位（CAR_DIMENSIONS.wheelRadius = 0.24）。**任何未标注的障碍默认 blocking。**

2. **爬升物理**：车碰到 `mountable` 障碍时，不碰撞停止，而是将车的支撑面高度平滑过渡到障碍顶面。过渡受三个约束：
   - **爬升坡度**：过渡面的等效坡度 ≤ `maxSlope`（0.3 rad ≈ 17°）。等效坡度 = 障碍高度 / 过渡水平距离。60 km/h 时 0.144 高的台阶需要约 0.5 单位的水平过渡距离。
   - **速度要求**：爬升需要最低速度（> `zeroSpeed` ≈ 0.08）；静止时碰到 mountable 障碍不穿透也不爬升，停车在上面是合法的。
   - **车底净空**：爬升后车身底下不得有新的 blocking 固体（防止爬上路缘后车底穿柱子）。

3. **边界标签映射**：
   - `curb` 边界：**待产品确认**是否标记为 mountable（当前全部 blocking）。
   - `step` 边界（同区域内台阶 ≤ `maxStepPerSample` = 0.18）：已经是合法运动（`validateMotion` 允许），不需要额外处理。
   - 固体障碍：需增加高度信息。当前 `StructureObstacle` 有 minY/maxY——`maxY - minY ≤ mountableHeight` 且是孤立障碍（非建筑/桥墩/护栏）时可标 mountable。

## 实施方案

### 第一步：障碍高度标注（编译器层）

在 `compileCitySurface` 输出的 `StructureObstacle` 上增加可选字段：

```ts
// engine/surface/types.ts
export type StructureObstacle =
  | Readonly<{ id: string; role: BoxPart["role"]; shape: "box"; corners: readonly P3[];
      surfacePatchId?: string;
      /** ≤ 此高度按可越障碍处理（默认无 = blocking）。编译器从描述符高度推导。 */
      mountableHeight?: number }>
  | ...;
```

**推导规则**：编译器只给已知的低矮结构标注——分流岛路缘石（已知高度 0.15–0.20）、渠化口实心圆角——其余一律不标注（默认 blocking）。不给建筑/桥墩/护栏/桁架标注。

### 第二步：碰撞层消费高度（DrivingCollisionSolver）

在 `DrivingCollisionSolver` 的滑动/接触解决中增加 mountable 分支：

```
if (obstacle.mountableHeight !== undefined && obstacleHeight ≤ mountableHeight) {
  // 不产生法向阻挡——支撑面高度在后续 footprintSupport 中取
  // 路面 + obstacleTopY 的最大值
  skip SAT blocking; continue;
}
```

### 第三步：支撑面高度融合（surfaceFootprint / ContinuousDrivingEnvironment）

在 `footprintSupport` 计算支撑面高度时，如果车体水平投影覆盖了 mountable 障碍：
- 车轮支撑高度 = max(路面高度, mountable 障碍顶面高度)
- 车身净空检查仍用 blocking 固体（忽略 mountable）
- 坡度检查用融合后的支撑面（爬升坡度自动受 maxSlope 约束）

### 第四步：运动验证约束（validateMotion）

`validateMotion` 对融合支撑面运行现有的 `maxSlope` / `maxWheelResidual` / `maxStepPerSample` 检查——爬升太陡或车身扭曲超限自动拒绝，不需要新参数。

## 不做的事

- 不引入悬挂物理、独立轮胎碰撞体或轮子弹跳；
- 不允许爬升建筑/桥墩/护栏/桁架（这些永远 blocking）；
- 不做减速带/可破坏物——只处理静态可越路缘；
- 不放宽任何现有安全检查——mountable 只是"这个障碍不产生法向碰撞"，其余整车覆盖/坡度/净空规则不变。

## 验收

- 合成测试场加一段 0.15 高路缘：车可低速越过，不掉速穿过（有爬升感）；静止停在上面合法。
- 0.3 高墙（> 可越阈值）仍完全阻挡。
- 十五城现有审计结果不因 mountable 改变（审计路线不经过路缘——如有改变需逐条解释）。
- 爬升时车身姿态平滑（无瞬移抬升）；`DRIVING_PHYSICS_VERSION` 递增。
