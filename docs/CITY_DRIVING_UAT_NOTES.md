# 城市汽车试驾入口（UAT）

2026-10-17。此入口用于冻结当前真实渲染城市后的人工驾驶诊断。候选未确认，不写入正式出生点、不发布道路开放结论。

## 运行

浏览器：

```sh
cd apps/agent-city/ui
AGENT_VITALS_CITY_GAME_UAT=1 npm run dev -- --port 5181
```

访问 `http://127.0.0.1:5181/`，选择工具栏“试驾汽车 · UAT”。独立浏览器使用合成会话数据，场景和路面均由实际 CityEngine/CityParts 生成。

原生 UAT 构建：

```sh
cd apps/desktop/src-tauri
AGENT_VITALS_CITY_GAME_UAT=1 cargo tauri build --bundles app
open target/release/bundle/macos/agent-vitals.app
```

普通构建不开此开关，工具栏不提供汽车试驾入口。原生只运行 `.app`；不直接启动 menubar 裸二进制。

## 行为与边界

- `createCityCarDiagnosticSession` 在同一冻结快照内，用既有路面区域、整车覆盖和完整固体索引验证候选。候选搜索最多 512 个姿态，只从地面 carriageway 取点；没有安全候选则拒绝，不移动障碍、不缩车、不放宽道路约束。
- `useCityDrivingUat` 只在明确 UAT 开关下发起诊断入场；正式 `createCityCarSession` 仍要求调用方提供出生点。诊断点不会流入正式 `DrivingSpawnSpecV1`。
- 入场暂停。WASD/方向键驾驶，空格暂停/继续，Esc 退出。失焦或页面隐藏时清输入并暂停；WebGL 丢失或宿主暂停时退出。准备中可以取消。
- `CarVisuals` 和跟车镜头消费同一插值车位。宿主唯一帧循环推进内核，驾驶期间禁用轨道相机与场景点击，退出恢复入场视角及轨道控制状态。HUD 最多 10 Hz，空闲无轮询。
- 飞机、航拍、拍照/导出、规划修复与试驾互斥；试驾期间延后应用新数据投影。工具栏保留独立退出入口。
- 完整冻结索引总量上限为 60,000（沿用建筑转换器上限），单次 BVH 查询候选上限仍为 4,096。两者含义不同；未增加查询预算。坏数据/任何构建超预算仍拒绝。
- 有效零实例网格、空绘制范围不生成碰撞体；保留快照的 freshness 语义。非法数组、索引、非仿射矩阵及变换后溢出均拒绝。

## 本轮证据

- 浏览器实际页面：入场暂停、油门速度 HUD（先后见 8.2 / 4.9 世界单位每秒）、倒车输入、暂停、Esc 退出恢复城市总览，再次入场；车模与跟车画面可见。测试页为合成 3 会话、默认 seed 74031，不能代表所有道路已通过审计。
- `node scripts/verify-city-driving-entry.mjs --cities`：实际 CityParts 的 0/1、90/42、500/7 均可入场并推进 120 个运行时 tick。建筑实例分别为 367、1,547、5,941；覆盖均为 `structures-and-buildings-and-scene-proxies`。此为入口/运行链路回归，不是逐路开放证明。
- 入场守卫补安全候选与全路面被固体覆盖时拒绝；建筑碰撞守卫补零实例/空绘制范围及空实例也不能掩盖坏索引。
- car-session / car-runtime / continuous-driving / car-rendered-collision 守卫与 typecheck 通过。普通前端 build 通过；`verify-city-suite.mjs module game` 16 阶段全过（约 306 秒）。普通构建的浏览器页面已验证不提供 UAT 汽车按钮。

## 尚未闭环

正式出生点仍须开放图约束、完整校验与产品确认入库；当前试驾按钮不能替代正式发布流程。完整收尾状态见 `CITY_DRIVING_COMPLETION_TRACKER.md`，其中桥头工程几何、最终版本 D1 证据、审计界面和故障定位路线仍有未完事项。

2026-10-17 最新共享运行时 UAT `.app` 已构建成功（日志 `/tmp/city-shared-runtime-native-build-final.log`）。解锁后退出旧进程并通过 `open` 启动最新 bundle，在实际 548 会话城市完成飞机→汽车→飞机切换、起步、暂停/继续和退出恢复总览的原生功能冒烟。汽车 HUD 实测起步至 4.6 世界单位/秒，三源碰撞覆盖已加载；截图 `/tmp/city-native-shared-car.png`。详细过程见 `CITY_SHARED_VEHICLE_RUNTIME_NOTES.md`。复测发现出生朝向缺陷后，`diagnosticSpawn` 已加入道路主轴估算、多点候选以及前后各 2.5 世界单位的连续扫掠净空检查。方向受阻合成回归与 0/1、90/42、500/7 CityParts 120 tick 通过；最新原生包出生视角与车道对齐，首次 800ms 起步达到 4.2 世界单位/秒并推进到路口。重复操作出现“帧间隔过长，已自动暂停”，触发来源待查；长程道路、稳定帧率和资源增长仍未验收。旧出生复现 `/tmp/city-native-shared-spawn-blocked.png`，修复后出生截图 `/tmp/city-native-shared-spawn-aligned.png`。
