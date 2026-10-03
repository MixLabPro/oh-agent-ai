# App-Layer City 迁移功能回归审计（2026-10-03）

审计对象：`codex/app-layer-city` worktree（`~/.codex/worktrees/app-layer-city/skill-vitals`，827 个未提交文件，+11660/−50413）。
基线：main `3bbaf21f`（City 两条流全部工作，含当日「3D 扇翼鸟 + 街区行人」）。
目的：新方案（City 抽离为 `apps/agent-city/` 插件层）落地前，核对 City 功能模块与逻辑相对基线是否退化，并给出闭合清单。

## 结论速览

- **渲染 / 世界层：无实质退化。** 天气、生长模型、布局、城市部件、生命感、昼夜与生长动画全部完好迁移；引擎差异属「所有权外移」重构，非功能删除。
- **数据层：三处实质退化**（其一为 MVP 有意为之）：真实数据被 3 条合成 fixture 替身；时间轴起点退回窗口常量；3D 扇翼鸟与行人未吸收。
- 一处第一轮误判已修正：会话下钻**存在**，形态从内嵌面板改为宿主代理调用。

## 逐项证据

### A. 无损迁移（附证据）

| 模块 | 证据 |
| --- | --- |
| 天气系统（雨/阴/晨虹/确定性哈希） | `engine/cityWeather.ts` 与基线 **diff = 0** |
| 城市模型（生长节奏 pace、聚合溢出、token 高度映射） | `engine/cityModel.ts` **diff = 0** |
| 布局（确定性、地址复用、花园向外的生长序） | `cityLayout.ts` diff 24 行，均为 import/术语适配 |
| 城市部件（夜灯、岸线涟漪、船尾迹、旗帜、碎光、水面） | `cityParts.ts` diff 38 行，逐行核对为 `createRenderCanvas()` 注入、canvas 创建替换、host→harness 术语替换——零功能删除 |
| 生命感（极光/水龙卷/热气球/浮灯/流星/火山/萤火虫/船队） | `cityWildlife.ts` 与基线前一天（`564c6726`）**diff = 0**；特征标记全部命中 |
| 昼夜与生长动画机器 | `snapToTargets` / `displaySnapshot` / `paceMsPerSec` 全部在位 |
| 航拍与胶片导出 | 代码在且结构升级（`export/film.worker.ts` + `filmProtocol.ts`，编码移入独立 worker）；宿主工具栏接线状态见 C-3 |
| 引擎差异的性质 | `CityEngine.ts` diff 366 行，删除侧全部是 canvas/OrbitControls/pointer 事件/画质管理的**所有权外移**（迁至 `renderCanvas.ts` 与 `CityExperience.tsx`） |

### B. 实质退化（闭合清单，按严重度）

| # | 退化 | 现状 | 基线行为 | 闭合要求 |
| --- | --- | --- | --- | --- |
| 1 | **真实数据 → 合成 fixture** | `data/provider.ts` 内 `fixtureProjection()`：3 条硬编码会话（`fixture-session-001~003`） | 523 条真实 authority 会话；`oldest-first` 分页（`--order oldest` 全链）；LOAD_CAP 截断 + 最近 2 天补抓；两阶段发布（首屏页 + 终态页） | `city:v1` 投影接到真实 authority 查询；分页 / 上限 / 补抓语义需要在投影协议或分批请求里找回 |
| 2 | **时间轴起点退回窗口常量** | `window.from` = 窗口天数前（366 天窗从 2025-10-03 起），回放前 9 个月为死时间 | `timelineStartMs`：起点 = 已装载最早会话的本地当天零点（数据驱动） | 投影返回首个数据日，或由 UI 从 sessions 推导起点 |
| 3 | **3D 扇翼鸟 + 街区行人未吸收** | `cityWildlife.ts` 停在 `564c6726`（扁平剪影鸟、无行人） | `3bbaf21f`：3D 身体 + 双侧独立扇翼 + 扇/滑翔交替；街区人行道行人（内缩环线、双向行走、220 上限） | 在新路径吸收 `3bbaf21f`（cherry-pick 后适配 import 路径与 harness 术语） |

### C. 形态变化（非退化，但验收需知）

1. **会话下钻**：内嵌 SessionDetail 面板 → 「查看会话详情」dialog + 宿主代理打开（`session_ref` 经 host 命令传递，失败有可见错误文案）。功能在；宿主侧命令链路按其计划文档「未恢复」项处理。
2. **工具栏**：City 自有控件 → 宿主统一工具栏原生链路，已接 5 项（时间窗/画质/标签/重置视角/航拍）；**种子切换、照片/视频导出未接线**（导出代码已在 `export/` 下）。
3. **authority schema v30 → v31** + host/harness 全量改名（不留兼容别名，旧库可重建不自动删除）——与主工作区 E06 轮（仍在 v30）存在协调点。

## 方法与勘误

- 方法：文件清单差集 → 特征标记扫描 → 逐文件 diff（含量化行数与内容核对）→ 定点取证（fixture 代码、windowStart 推导、下钻 dialog）。
- 勘误：第一轮标记扫描的正则转义错误（`-E` 模式下 `\|` 匹配字面竖线）曾致流星/火山/极光等误报为缺失，重扫后修正；「下钻只剩 tooltip」的初判经深查修正为「宿主代理式存在」。本表所有结论以第二轮硬证据为准。

## 合并协调建议

1. E06 后端轮先提交（与 codex 重构在 29 个文件上有未提交交集，改动面最小者优先落盘）；
2. codex 分支吸收 `3bbaf21f`（新路径适配）后落盘 827 文件；
3. B 表三项闭合后统一跑 verify 门 + 重建安装。在此之前，**新方案不可替代现有 City 页**（fixture 无真实数据）。
