# Agent City 模块（MVP 架构记录）

把真实 Agent 工作数据映射为一座持续生长的 3D 微缩城市。核心原则：**Simulate the data, fake the city** —— 实时维护的只有 Session / Progress / Finding 等业务状态，城市观感全部由廉价视觉手段（instancing、程序化纹理、视觉欺骗）制造。

## 分层

```
Vitals Data (lib/tauri.ts: readSessions / readFindings / 失效事件)
    ↓
cityData.ts   装载：分页(500/页, ≤12 页)、首页即渲染、revision 门刷新、90s 活跃轮询
    ↓
cityModel.ts  纯映射（无渲染依赖）：CityModel { districts, buildings, stats, rows }
    ↓
engine/       Three.js 渲染引擎（可整体替换）
  cityNoise.ts   seeded 值噪声/fBm/ridged——地貌的唯一随机源
  cityLayout.ts  地形场（有机海岸/丘陵/山脊/河流/可建性）+ 有机落位 + 道路
  cityTextures.ts canvas 程序化纹理（地形高度着色/河流/道路）+ host 配色
  cityParts.ts    全 instanced 城市部件 + 每帧增量动画（建筑贴地）
  CityEngine.ts   场景所有权/相机/拾取/休眠渲染/自适应画质
    ↓
CityPage.tsx  React 壳：HUD / 时间轴 / 钻取面板（复用 SessionDetail）
```

业务数据与 3D 对象解耦：React 只通过 CityEngine 的窄 API（applyModel / setTimeCursor / setQualityMode / focusBuilding / 事件回调）驱动渲染。

## 地形（seeded 随机地理）

每个 host 城区是一片由 `hash(district.id)` 做 seed 的随机地理，同一份数据永远长出同一片地貌：

- **海岸线**：噪声场等值线（`mask = fbm − 径向衰减`，海岸是 mask 的零等值线）——半岛、深湾、近岸小岛/礁石由场的形状自然产生，岛形真正随机（每岛 256 方位的海岸半径预烘焙成查找表，落位/道路/桥端点 O(1) 查询）。
- **地形起伏**：fBm 丘陵（城区缓坡可建）+ 背海侧 ridged 山脊（草→深草→岩石→高岩色带，坡度暗化）；城区内圈只做轻度压制，楼座落在真实海拔上（楼基/吊车/选中环以 `grounds[id]` 为基准）。
- **河流**：约 80% 的岛有一条自山脚蜿蜒入海的河（河谷下切 + 纹理水面 + 岸滩过渡），河中段有小桥。
- **密度与呼吸感**：岛半径 ≈ 8.2√n（密度约每 74 单位²一栋）；建筑带只占岛内 2/3（外圈是丘陵/绿带/海岸）；低频角度噪声做"方位簇聚"——约四分之一方位是绿楔空地，城市长成多瓣聚落而非实心圆饼。
- **道路**：有机等高环线 + 放射小径（纹理与车行同源折线），车辆贴地形高度行驶；不是方格路网。
- **建筑朝向**：以广场为参照的切向 + hash 抖动，无正交网格感。
- **装饰远山**：地图外围 3 座纯视觉山岛（顶点色低模），构成天际线地理背景。
- **性能**：地形 mesh 每岛 128² 段高度场位移（一次性生成，静态），纹理像素高度从 128² 烘焙网格双线性采样（不逐像素跑噪声）——120fps 不变。

## 数据映射（与数据诚实性）

| 数据 | 城市语义 | 实现 |
| --- | --- | --- |
| Session | 一栋楼 | `session_ref` 哈希决定外观；超出 RENDER_CAP(1400) 的按区聚合为背景楼群（massing），HUD 如实标注聚合数 |
| Host | 一座岛/城区 | 岛体量 ∝ 会话数；配色/立面语言按 host（claude-code 暖米 / codex 冷灰蓝 / zcode 淡紫 / dsh 灰绿） |
| Token | 建筑材料/规模 | 对数幂曲线映射高度（1e3→6 … 1e7→64）；token 总量恒等于数据源，不做任何缩放 |
| Progress | 施工进度 | 会话关闭=封顶；活跃会话=工地（吊车+脚手架+警示灯），完成度 = tokens/区内已关闭会话 P95 的估算值，面板标注"估算" |
| Active Agent | 正在施工的建筑 | last_event 距今 ≤10min 的会话；吊车转速 ∝ token 吞吐；90s 轮询驱动楼体生长动画 |
| Finding | 区域异常 | findings 只到 host 粒度 → 区广场上空气浮信标（severity 配色）+ 地面脉冲环 + 图例计数；不落到具体楼 |
| Time | 生长与 Replay | 楼按 first_event 落在"日环带"（老会话在内环）；时间轴可回放，token 在会话首末事件间线性插值（HUD 声明为可视化近似） |
| Landmark | 天际线焦点 | 全城 token 前 12 名：加高 + 天线 + 闪烁航空灯 |

## 布局确定性

楼位只依赖 `(startedAt, hash(session_ref))`，不依赖加载顺序 —— 增量分页/后台刷新不会搬动已存在的建筑；地貌由 `hash(district.id)` 决定，同样与加载顺序无关。楼坐落在"时间环带"上（老会话在内圈、新会话向外生长，含少量跳环形成卫星聚落），落位时做坡度/河谷/间距检查，不可建则确定性外扩重试。

## 常驻成本控制

- 全场景 ~30-60 draw calls：建筑=3 个立面变体 InstancedMesh（每楼 1-2 实例）+ podium/roof/scaffold/crane/antenna 各 1 mesh；车/船/云/树各 1 mesh；水面/天穹自写轻量 shader。
- 楼层密度用实例属性 `aFloors` 在着色器里拉伸立面纹理 v 轴（onBeforeCompile 注入），一根 mesh 覆盖所有高度。
- 接触阴影烘焙在区地面纹理里；实时阴影只有一张 1024/2048 贴图。
- 休眠：页面切走 → 引擎 dispose（几何/材质/纹理/renderer 全释放）；document.hidden → 停 rAF；无输入且相机静止 12s → 环境帧率（~20fps）。
- 自适应画质（auto 档）：连续 <27fps 降档（阴影→像素比→生命感部件），>52fps 升档；用户可钉死 高/省电。
- three.js 通过 React.lazy 独立 chunk（~167KB gzip），不进工作台首屏。

## 已知边界

- Progress 是估算：数据面没有会话完成度字段，完成度=材料量相对区内 P95 的比例，产品文案已标注。
- Finding 无法定位到具体 session（DTO 无 session 引用），只做区级标记。
- Replay 的 token 累计是线性插值近似，非逐事件重放。
- 浏览器预览数据来自 tauri-mock 的确定性合成集（≥100 页请求走 `city-page-N` 游标）；打包 app 走真实 authority。
