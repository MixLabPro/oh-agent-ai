# Agent City 游戏模式 UAT 证据基线（G3.4 证据包）

日期：2026-10-09 05:16 CST。分支 `worktree-city-game-mode`，HEAD `33219e955d9cae878f18e5e3ad58095eeb130355`（工作区零未提交差异——本文件除外，随证据提交生成）。上位文档：[CITY_GAME_MODE_IMPLEMENTATION_PLAN.md](CITY_GAME_MODE_IMPLEMENTATION_PLAN.md) §12。

## 1. 二进制标识

| 项 | 值 |
| --- | --- |
| bundle | `apps/desktop/src-tauri/target/release/bundle/macos/agent-vitals.app` |
| 主二进制 | `Contents/MacOS/agent-vitals-menubar` |
| SHA-256 | `888b1813aa3df921b7970dd8cbf5c836b93594d4896a4bb40344c17268cae6e1` |
| 构建命令 | `cargo tauri build --bundles app`（退出码 0，日志含 `tauri-exit=0`） |
| Rust 门禁 | `cargo test --release`：166 通过 / 1 失败（`manifest_catalog_http_*`，main 上同样失败的环境性网络测试）；`clippy --release --all-targets -- -D warnings`：0 告警 |

## 2. 版本化配置快照

| 常量 | 值 | 位置 |
| --- | --- | --- |
| `PHYSICS_VERSION` | 1 | `apps/agent-city/ui/src/game/FlightSimulation.ts` |
| `COURSE_VERSION` | 1 | `apps/agent-city/ui/src/game/RaceCourse.ts` |
| 档案 schema | `flight-profile:v1`（plugins.json `stateKeys`） | `apps/desktop/plugins.json` |
| 校准基线 | `calibration-replay/p1`（verify-city-game-flight 单行输出） | `scripts/verify-city-game-flight.mjs` |
| 入口开关 | 开发预览：`?cityGame=1` 或 `localStorage.cityGameDev=1`，经城市设置进入 | 未开放默认入口 |

## 3. 已记录的量化测量（2026-10-09，浏览器 1280×720，合成数据 3 会话，quality 0 自动档）

| 项 | 值 | 预算 | 结论 |
| --- | --- | --- | --- |
| 练习模式 draw call 增量 | +8（493→501；造型重建后按对象数 13 计为 ≈+14，待面板可见复测） | ≤20 | 通过（重建后数值待复测记录） |
| 穿环模式 draw calls | 视野相关，追尾视角低于城市基线（环 = 1 次 instanced 绘制） | ≤20 新增 | 通过 |
| 20 次进入/退出 | 0 失败、0 页面错误、JS 堆增长 0.8MB | 无增长性泄漏 | 通过（造型重建后待同规复测一次） |
| 退出后绘制数 | 稳定回到纯城市基线 493（无游戏对象残留） | 归零 | 通过 |
| `?cityDebug` 性能行 | 正常工作（此前"不渲染"为浏览器面板合成器停摆，非缺陷） | — | 已澄清 |

## 4. 验证覆盖（本分支新增脚本，均入 verify:city 链）

`verify-city-game-controller / -world / -flight（含校准回放六场景）/ -race / -profile / -session`：状态机全表、80 布局路线、帧率确定性、穿环规则、档案解析合并与原生修复写、会话生命周期与输入端到端。浏览器冒烟：进入→飞行（遥测变化）→暂停/继续（含焦点门槛与继续自动回焦）→退出恢复→换路线→重试。

## 5. 已知未覆盖项（UAT 必须补）

1. **原生 bundle 全流程 UAT 未执行**：练习→挑战→暂停→成功/失败→重试→换路线→退出→切 Overview→重启 App 验证成绩仍在（§12 主体）；`open` 该 `.app` 执行，禁止裸跑二进制（AGENTS.md 托盘纪律）。
2. R3 造型重建后的**浏览器视觉截图与 20 次进出复测**（编写时浏览器面板未渲染，环境原因；面板可见后一次截图 + 一次循环脚本即可完成）。
3. 帧时间增量 P95 ≤4ms 与省电画质 30 FPS / 正常画质 60 FPS 目标的**分档实测**（需真机与画质档，本次仅记录 quality 0 单档）。
4. 侧栏开关/连续 resize/中英文布局矩阵（§12 布局行）未系统执行。

## 6. 瞬时闪白事项

现有 City 瞬时闪白为独立已知问题（见计划 §12 注），游戏完成报告不得悄悄标记为已解决。
