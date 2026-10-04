# Agent City：Vice City 致敬强化 SPEC（2026-10-05）

状态：草案，待评审。范围：Miami 主题的符号级强化——目标用户反馈「致敬 GTA Vice City 但不够明显、不能一眼就懂」。只动渲染/文案层（cityParts / cityTheme / cityTextures / i18n / landing 文案），不改 cityModel / cityLayout 契约、不动数据面。

现状分层见 `docs/CITY_MODULE.md`； Miami 主题定义在 `engine/cityTheme.ts`（唯一皮肤）。

## 1. 背景与诊断

现有致敬是**氛围级**：粉彩楼身、珊瑚/青/薄荷/紫屋顶、紫粉渐变天、棕榈树、水色、屋顶霓虹描边——色板正确但全是「环境色」，缺少专属符号。识别度差距定位：Vice City 一眼可辨靠的是**符号**（日光条纹救生塔、霓虹招牌、游艇、棋盘格、片头字体），氛围只是底色。用户无解码线索时把当前城市读作「热带海滨」而非「致敬」。

**边界（硬约束）**：只致敬不复刻——不使用 GTA 商标/字体/城市名/载具型号；元素为公共文化符号（救生塔/霓虹/游艇本身不属于任何版权方）。

## 1.5 外部依据（2026-10-05 网络检索三轮）

网络对「Vice City 记忆点」的高频共识与本地诊断一致，并补充三个元素：
1. **霓虹粉/青夜景**为最高频记忆点——夜晚比白天更「一眼懂」（"neon-soaked"、招牌映湿地面的意象反复出现）；
2. **Ocean Drive 海滨大道 + Art Deco 粉彩酒店**是被引最多的单一地标（对称立面、横阳台排、Colony Hotel 式竖霓虹牌）；
3. **"Welcome to Vice City" 入城牌**在现实-游戏地标对照报道中被点名——最直白的解码线索；
4. **加载画面公式**（粉紫日落 + 棕榈剪影）是 synthwave 时代「Vice City 风」的通用视觉语言——天空浓度本身就是记忆点而非背景。

依据：[GTA Wiki – Vice City](https://gta.fandom.com/zh/wiki/Vice_City_(3D%E4%B8%96%E7%95%8C))、[Rockstar 官网](https://www.rockstargames.com/zh/games/vicecity)、[Miami New Times – 现实地标对照](https://www.miaminewtimes.com/location/map-these-20-miami-spots-are-in-gta-vice-city-10557459)、[IGN 中国 – GTA6 预告 99 细节](https://www.ign.com.cn/grand-theft-auto-vi/47542/feature/gta-6-yu-gao-pian-zhong-de-99-ge-xi-jie)、[vicehubx](https://vicehubx.com)、[GetStarrd](https://www.getstarrd.app/blog/gta-6-poster)。

据此修订：新增 F8（Ocean Drive 街段）、F9（Welcome 招牌），F7 天空浓度升入第一批。版权边界重申：招牌文字不用 "Vice City" 字样（用 "MIAMI 1986" 或纯图形），Art Deco 为公共建筑风格。

## 2. 目标与非目标

**目标**
- 「一眼就懂」：白天与夜晚各有 ≥3 个无需解释的 Vice 符号可见。
- 现有氛围资产（粉彩/棕榈/霓虹描边/水色/黄昏天）全部保留，只做强度与符号叠加。
- 新增 draw call ≤ 2；新增几何全部走现有 instancing/静态城缓存体系；确定性摆放（seed 驱动）。

**非目标**
- 法拉利式跑车型车辆（建模成本不成比例）；真实商标/字体复刻（版权红线）；
- 微观细节（街景级店铺招牌——产品方向是宏观优先，interior mapping 已降级）；
- 新主题切换（保持唯一皮肤；文案层面点明致敬即可）。

## 3. 改动清单（分两批）

### 第一批：三个一眼懂的符号（日/夜均可见）

**F1 海滩日光条纹救生塔**（单件识别度最高）
- 数量 2–3 座，摆在南向沙滩（`cityPlan` 的 sand 带上、离水线 8–14 单位，确定性 `hashSeed` 选点；不压任何地块/道路/码头）。
- 造型：窄高圆柱（底半径 ~1.2、高 ~7）+ 顶部小檐 + 短梯（装饰级）。塔身由 **4–6 段交替色环**组成：粉 `#ff5fa8` × 白 `#fff4ec`（一塔）、青 `#00c2d1` × 白（另一塔）——daylight 横条纹是 Lifeguard Tower 的第一特征，夜里由现有路灯体系自然照亮。
- 实现：`cityParts.buildPublicSites` 或独立 `buildLifeguardTowers()`；**每塔 1 实例、每色环 1 段**，全部进 2 个 instanced 通道（粉塔组/青塔组）或复用现有 BOX/CYLINDER + 实例色——预算 ≤+1 draw call。
- 高度净空：塔底落在沙面地形高度；不进拾取、不进碰撞（装饰，与高架同规则）。

**F2 立面霓虹升级（描边 → 招牌感）**
- 现状：`neonMesh` 屋顶描边（暖白 `#ffffff` 实例色 + `nightLights.neon` 统一亮度）。
- 改动 a（调色，一行级）：霓虹实例色从暖白改为**品红 `#ff2fb2` / 青 `#00e5ff` 双色系**（按楼 seed 哈希二选一，夜间高强度、白天熄灭沿用现有 nightGlow 门控）。
- 改动 b（竖管阵列）：选取 3–5 栋最高楼（landmark/塔类优先），沿腰线（~60% 高度）布置一圈**竖向霓虹灯管**（细长 BOX，间距 ~0.8，高 ~2.5 单位，品红/青交替）——远景读作「楼上有一圈霓虹招牌」，不必真字形。进现有 instanced 体系，+1 draw call 上限。
- 强度分级：描边维持现状亮度；竖管亮度 ×1.4（进 bloom 的主体）。

**F3 UI 命名线索（零渲染成本）**
- 城市设置里的主题项文案：「Miami」→「Vice City 致敬 · 迈阿密 1986」（en: "Vice City tribute · Miami 1986"）。
- landing 页 City 预览卡片补一句副标："A love letter to 1986 Vice City"（与 §1 边界一致：只提文化致敬，不提商标）。
- i18n 双语键同步增改；不影响任何契约（纯展示字符串）。

**F7 天空浓度**（依 §1.5-4 从第二批升入）：`skyGrade.amount 0.62 → 0.72–0.78`、天顶紫加深一档——粉紫日落 + 棕榈剪影本身即加载画面级记忆点（数值试调，验收时防压过黄昏读数与水色）。

**F8 Ocean Drive 海滨大道段**（依 §1.5-2，第二梯队中优先）：南向滨海带选一段，3–4 栋**粉彩 Art Deco 风**中低楼（对称立面、横阳台排线条、楼顶竖霓虹牌——Colony Hotel 意象），沿弧形大道排布；把 F2 的竖霓虹从「个别楼」升级为「一条街的连续意象」，记忆密度最高。建筑为程序几何组合（阳台=横条板阵列），不建贴图。

**F9 Welcome 招牌**（依 §1.5-3）：入口视线方向（主桥/机场路来向）一块 "WELCOME TO MIAMI 1986" 霓虹牌（牌架 + 双色霓虹描边字带；**不用 Vice City 字样**），日暗夜亮沿用 nightGlow 门控。一句话成本，解码效率最高。

### 第二批：追加符号（第一批验收后按效果排期）

**F4 游艇改造**：船队实例中 1–2 艘换白色飞桥游艇（现有双盒船身 + 飞桥层 + 桅杆细柱），沿用现有航道与尾迹——比斯坎湾意象。
**F5 滨海棋盘格步道**：一段滨海步行道铺粉/白棋盘格（地面图集加一版棋盘通道，纹理级改动）。
**F6 霓虹拱门地标**：地标体系加一座半圆拱（Torus 半圆 + 双色霓虹 + 拱下光斑），进入 `landmarks` 确定性布点。
（F7 已升入第一批，见下。）

## 4. 不变契约

- 布局确定性 / 刷新不搬家 / 输入顺序无关不受影响（F1 选点只读 plan 数据，不写布局）。
- 18:00 渐亮、19:00 全亮时刻表语义不变；霓虹白天熄灭沿用 nightGlow 门控。
- 素材预算：`verify-react-city-assets.mjs`（≤5 MB、全部 CC0/MIT 许可）不变——F1–F6 全部程序几何/实例色，不新增贴图资产（F5 为图集内新绘制通道，不增文件）。
- verify:city 六项、verify:react 全项继续绿；golden / Python / Rust 零影响。
- 拾取/统计边界：F1/F6 为装饰，不进 Session 拾取与统计（与高架、港口同规则）。

## 5. 性能预算

| 项 | 预算 |
| --- | --- |
| F1 救生塔 | ≤+1 draw call（≤3 塔 × 6 色环段，instanced） |
| F2a 调色 | 0 |
| F2b 竖管 | ≤+1 draw call（3–5 楼 × 每楼 ≤40 管，instanced） |
| F3 文案 | 0 |
| F7 天空 | 0（uniform 值） |
| F8 大道段 | ≤+1 draw call（3–4 栋组合楼，instanced；阳台线条并入楼体几何） |
| F9 招牌 | ≤+1 draw call |
| 第二批各项 | 各 ≤1 draw call |
| 帧率底线 | 集显 30fps 不变（当前实测 64–120fps，余量充足） |

## 6. 验收

- **一眼测试（主验收）**：白天与夜晚各一张全景截图，不加以任何文字说明给未参与开发者看，能说出「Vice City / 迈阿密 80 年代」即通过——这正是本次的目标度量。
- F1：塔在沙带上、条纹日夜可见、无穿模、不压地块。
- F2：黄昏/夜晚霓虹读作招牌而非描边；白天无霓虹残留；bloom 不过曝（检查天际线无白色糊块）。
- F3：主题文案与 landing 副标双语正确。
- F7：黄昏相紫罗兰浓度提升且不压过水色/楼色（对照调参前后截图）。
- F8：大道段日夜均读作「一条粉彩霓虹街」；建筑不压地块/道路；与现有滨海布景（码头/渔市）不重叠。
- F9：牌面从主入口方向可见；文字为 MIAMI 1986（非 Vice City）；夜间进 bloom 但字形可辨。
- 回归：verify:city 六项 + verify:react 全绿；20 种子 geography 契约不涉及（F1 不动布局）。

## 7. 分期与提交

- 批次一：F1 + F2 + F3 + F7 + F8 + F9（一次视觉验收——六个符号齐了才可能过「一眼测试」；F8 是其中工作量最大的单件）。提交 `feat(city): vice-city symbols — lifeguard towers, ocean drive, neon signage, welcome sign`。
- 批次二：F4（游艇）+ F5（棋盘格）+ F6（霓虹拱门）按验收效果逐个追加，各独立提交。
- 署名：本 spec 为原创设计决策（公共文化符号 + 现有自建资产），无第三方代码引入；若 F4/F6 参考 tinyskies Boat/地标实现，按移植台账纪律标注。
