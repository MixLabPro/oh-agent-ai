# C 批次：连续碰撞与坡度动力学

本批次只写 DrivingSimulation、DrivingKernel、新增 C 模块与专项守卫；不修改 B 的 SurfaceDrivingWorld、CollisionIndex、恢复、逐路审计或审计结论契约。代码仍在当前分支工作区，未提交。

## B 的接入方式

1. 从同一冻结世界取 `Solid[]`、surface regions、车辆尺寸与中心高度。B 必须确认固体索引没有 rejected/遗漏，覆盖范围与世界身份真实；本批次不把 renderer triangle soup 变成碰撞体，也不把凸代理当作原始渲染精度。
2. 创建 `ContinuousDrivingEnvironment(regions, {surfaceRevision,worldRevision,solidRevision,solids,dimensions,centerHeight,isCurrent})`。solidRevision 必须等于worldRevision，且isCurrent必须绑定同一捕获句柄。centerHeight 沿车体 up 轴偏移；dimensions 为车体碰撞盒三个半尺寸，不是 wheel footprint。默认预测支撑间距0.1、最多64段，每段调用 B 的 validateMotion；独立验证用同一 surface 事实，不能认证编译器自身。
3. 用 `createContinuousDrivingKernel(environment,{worldRevision,vehicleConfigHash,kernelBuildId})` 校准 physics=2、collision=2、query=3。vehicleConfigHash 必须覆盖实际车辆、动力学、支撑与求解参数；不要把旧审计 key 改几个字段后复用旧结论。
4. 为每个审计case创建新的 `ContinuousWorldValidator(environment,corridorProgress)`，传给现有 GateAuditObserver。B 的旧 validator 仍验证直达运动，不能把折线滑动当直线复核。新 verifier 重新检查每段完整 footprint 与 CCD，验证首尾、支撑姿态、速度/角度上限和累计有符号路程。

`KernelStep.motion` 兼容新增可选字段：trajectory、contacts、contact、queryStatus。C 世界始终给出 resolved/unresolved。部分推进可以在 contact=true 时 blocked=false；blocked 继续表示本次没有有效推进。查询失败/过期回滚整个tick，queryStatus=unresolved，独立 verifier 返回 simulation-invalid，不生成物理阻塞证明。单纯接触、恢复失败和道路 blocked 的最终归因仍由 B/D 负责。

## 碰撞与响应

- `sweepBody` 对保持姿态的直线平移使用解析 SAT 区间交，返回接触时刻、向外单位法线。时刻对应数值 skin 边界（默认1e-4），不是声称无限精度下的零间隙物理接触。
- 姿态改变时以所有车体点的速度上界分割时间，按时间顺序证明安全前缀，找到已观察到 skin 接触的上界。返回 [time,timeUpper]，默认宽度不超过1e-7。无法证明的擦边、初始重叠、精度不足或预算耗尽返回 unresolved；不以均匀采样或旋转末态判清空。
- `resolveDrivingCollision` 推进到安全前缀，累计接触平面，只去掉剩余位移朝障碍的分量，随后重新拟合支撑并重新扫掠。最多4次滑动，不注入弹性或随机脱困；首个接触后停止剩余角度运动，不绕接触点转车。
- 双墙角不能通过交替投影穿出；所有最终接受片段再次 CCD。版本在查询中失效则整个事务回滚。初始重叠交给 B 的 SafeRecovery。
- 数据源使用 B 的冻结凸代理。旋转时间区间有数值误差界，不能称解析精确旋转TOI；skin、timeTolerance、预算及代理几何必须留在审计配置/证据中。

## 动力学

speed 是车体前进方向的有符号路面速度；水平位移乘 cos(pitch)，坡向重力为 -6*sin(pitch)，加速/制动/阻力仍在固定1/60 tick积分。无输入且静止时，有限静摩擦保持坡上停车（staticHold=2）；双键主动制动可停车，反向输入先制动再换向。坡度超过支撑策略仍由B拒绝，不放宽阈值。

C 环境测量实际已接受的分段三维支撑路径，按本tick的路程预算截断并重查。distance 是累计有符号路程，继续直接供 CarVisuals 的轮转使用；滑动不把未执行的目标位移计入轮程，速度同时受实际接受比例和接触平面的切向投影约束；正撞墙在接触当tick去掉法向速度，不能把撞前已走距离当作撞后残余速度。旧环境接口继续可用，没有路径度量时使用三维首尾弦长；旧环境不因此获得连续滑动认证。

## 验收

`node scripts/verify-city-continuous-driving.mjs` 覆盖高速薄墙解析时刻/法线、旋转中途碰撞、双墙角与擦墙滑动、初始重叠、预算与失效回滚、倒车脱困、伪造轨迹、坡上制动/停车、正反坡面路程、真实C内核及独立复核、30/60/120Hz固定tick一致。输入变化必须提供相同tick序列；不承诺不同显示帧上采样的键盘事件天然等时。

补充实跑：24组斜墙解析时刻/法线、非正交双墙角、pitch旋转及稳定固体排序通过。`--cities` 的15个结构布局/30次合法出生/1800个tick均独立复核通过，无查询不确定、无接触；这不是城市接触覆盖证据。复杂非平面路面的预测支撑仍采用有界数值分段，不宣称无限精度轮胎/地形连续接触模型。性能与原生bundle属于后续宿主验收；没有改正式城市入口/HUD，也没有开放道路。

contacts 为每tick归一化时间区间、法线、固体id和worldRevision，仍是求解结果，B不能仅凭该标签生成道路阻塞证书。所有滑动片段都在trajectory中；审计观察器若依赖单tick直线门插值，必须结合分段轨迹检查门的顺序/方向，不能把折线终点的直连弦当真实运动。

内核最多接收2048个轨迹点，C世界复制前另有限制100万个几何元素。源码基数/每凸体顶点数/候选/轴数/时间区间/SAT测试均有界；超过限制不分配无限轴组合、不返回clear。source最多2万体、单体256顶点、每对1024轴，SAT每次事务默认20万次；实际C环境在整个tick累计预算。
