// Hand-written client bundle — the artifact `exports["./client"]` points at.
//
// Same zero-build (pure JS) equivalent of the DSH tsdown client plugin, but the
// audit tab now renders the two host-computed projections with real presentation:
//   - `behaviorFindings` — the Rust behavior rules (SV601–SV614) folded over the
//     raw session events by the host half (index.js) and pushed here.
//   - `tokenUsage` — the host token-meter's cumulative provider usage (four
//     disjoint buckets).
//   - `tokenByModel` — the host's per-model token buckets: usage events folded
//     against the model active at the time (from `request/header`), plus the
//     model-switch sequence, so the client can price each segment with its own
//     rate instead of one model for the whole session.
// All come through the standard kit's `useProjection` hook; this bundle needs no
// extra service inject beyond `slots`.
//
// Presentation: human token numbers, severity summary chips, severity colour,
// critical-first ordering, long-path truncation, per-model DeepSeek price
// estimate. Colors/fonts/spacing all ride the `--dsw-alias-*` / `--dsw-font-*`
// design tokens the rest of the DSH client (DiffBlock, RiskConfirmation, Input,
// …) already uses — same tab, same system, theme-aware for free instead of a
// second hand-rolled palette. All computation stays client-side on top of the
// raw host projections; this file only formats.

window.__ModuleLoader__.load({
	id: "dsh-skill-vitals-audit",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		// `react` is a platform seed word (see web/src/platform.ts + web/src/seed.ts);
		// the shell shares its React instance through the frozen module table.
		var ReactNS = require("react");
		var createElement =
			ReactNS.createElement || (ReactNS.default && ReactNS.default.createElement);
		var useState = ReactNS.useState || (ReactNS.default && ReactNS.default.useState);

		// ── design tokens: reuse the DSH client's own alias tokens, not a second
		// hand-rolled palette — this is what makes the tab theme-aware (dark mode
		// included) with zero media queries here. `bg` is a low-opacity tint of
		// the state color for chip/pill backgrounds (color-mix keeps it live
		// against the CSS var, so it still tracks theme swaps at paint time).
		var T = {
			fg: "var(--dsw-alias-label-primary)",
			muted: "var(--dsw-alias-label-secondary)",
			dimmed: "var(--dsw-alias-label-tertiary)",
			border: "var(--dsw-alias-border-l1)",
			trackBg: "var(--dsw-alias-bg-layer-2)",
			accent: "var(--dsw-alias-state-business-primary)",
			success: "var(--dsw-alias-state-success-primary)",
			fontProse: "var(--dsw-font-s-14)",
			fontSmall: "var(--dsw-font-xs-13)",
			fontMono: "var(--dsw-font-markdown-code-block)",
			space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
		};

		function tint(colorVar, pct) {
			return "color-mix(in srgb, " + colorVar + " " + pct + "%, transparent)";
		}

		// ── severity → glyph + colour + label ──────────────────────────────────
		// Status colors are reserved: each severity always ships glyph + Chinese
		// label + color together, never color alone.
		var SEVERITY = {
			critical: { glyph: "✕", color: "var(--dsw-alias-state-error-primary)", label: "严重" },
			warning: { glyph: "⚠", color: "var(--dsw-alias-state-warn-primary)", label: "警告" },
			info: { glyph: "·", color: T.accent, label: "提示" },
		};
		var SEVERITY_ORDER = ["critical", "warning", "info"];

		// ── rule code → short human label ─────────────────────────────────────
		var RULE_LABEL = {
			SV601: "破坏性命令",
			SV602: "提权操作",
			SV603: "远程执行",
			SV604: "敏感文件写",
			SV605: "工作区外写",
			SV606: "内网/裸 IP 外联",
			SV607: "沙箱拒绝",
			SV608: "工具超时",
			SV609: "审批请求",
			SV610: "审批决定",
			// 轨迹级检测器（SV611–614）—— 跨事件/序列级模式
			SV611: "重复工具调用",
			SV612: "死循环",
			SV613: "进度停滞",
			SV614: "权限异常",
		};

		// ── human-readable token counts ────────────────────────────────────────
		function formatNumber(n) {
			if (n === undefined || n === null) return null;
			if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
			if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
			if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
			return String(n);
		}

		function formatTokens(usage) {
			if (!usage) return null;
			var rows = [];
			if (usage.uncachedInputTokens !== undefined) {
				rows.push("输入 " + formatNumber(usage.uncachedInputTokens));
			}
			if (usage.outputTokens !== undefined) {
				rows.push("输出 " + formatNumber(usage.outputTokens));
			}
			if (usage.cacheReadTokens !== undefined) {
				rows.push("缓存读 " + formatNumber(usage.cacheReadTokens));
			}
			if (usage.cacheWriteTokens !== undefined) {
				rows.push("缓存写 " + formatNumber(usage.cacheWriteTokens));
			}
			if (!rows.length) return null;
			var text = rows.join(" · ");
			// 输入主导成本时给一句洞察。
			var total =
				(usage.uncachedInputTokens || 0) +
				(usage.outputTokens || 0) +
				(usage.cacheReadTokens || 0) +
				(usage.cacheWriteTokens || 0);
			if (total > 0 && (usage.uncachedInputTokens || 0) / total >= 0.99) {
				text += "  — 输入主导成本";
			}
			return text;
		}

		// ── token composition bar ──────────────────────────────────────────────
		// Four buckets of the SAME metric (tokens), not four competing identities,
		// so this is a magnitude/composition job → one hue, four shades (sequential),
		// not a four-color categorical palette. Order = cost-weight order (input is
		// almost always priciest, cache-write cheapest/rarest). Native `title` gives
		// the per-segment hover value — the exact numbers already live in the text
		// line above, so the bar stays a supplementary at-a-glance read, never the
		// only place a number appears (accessibility: text truth beside the visual).
		var TOKEN_SEGMENTS = [
			{ key: "in", label: "输入", pick: function (u) { return u.uncachedInputTokens || 0; }, opacity: 1 },
			{ key: "out", label: "输出", pick: function (u) { return u.outputTokens || 0; }, opacity: 0.72 },
			{ key: "cr", label: "缓存读", pick: function (u) { return u.cacheReadTokens || 0; }, opacity: 0.46 },
			{ key: "cw", label: "缓存写", pick: function (u) { return u.cacheWriteTokens || 0; }, opacity: 0.24 },
		];

		function tokenCompositionBar(usage) {
			if (!usage) return null;
			var parts = TOKEN_SEGMENTS.map(function (seg) {
				return { key: seg.key, label: seg.label, value: seg.pick(usage), opacity: seg.opacity };
			}).filter(function (p) { return p.value > 0; });
			var total = parts.reduce(function (s, p) { return s + p.value; }, 0);
			if (total <= 0) return null;
			return createElement(
				"div",
				{
					key: "token-bar",
					style: {
						display: "flex",
						height: 6,
						borderRadius: 3,
						overflow: "hidden",
						gap: 2,
						background: T.trackBg,
						marginTop: T.space.xs,
					},
				},
				parts.map(function (p) {
					return createElement("div", {
						key: p.key,
						title: p.label + " " + formatNumber(p.value),
						style: {
							width: (p.value / total) * 100 + "%",
							minWidth: 2,
							background: T.accent,
							opacity: p.opacity,
						},
					});
				}),
			);
		}

		// ── DeepSeek 报价估算 ───────────────────────────────────────────────────
		// 单位：元 / 百万 tokens（用户提供的官方报价表）。空闲价是高峰价的一半；
		// 高峰时段为北京时间 9:00–12:00、14:00–18:00。报价表没有「缓存写入」行 →
		// cacheWriteTokens 按 0 计（不臆造价格）。tokenByModel 的 peak_* 子桶已经
		// 由 core 的 usage::token_by_model 按每笔请求自己的 time 精确标出高峰
		// 份额（不是猜的），所以这里能算出一个真实发生的费用：off-peak 份额
		// （全量 − peak_*）按空闲价、peak 份额按高峰价，两段相加——不再是旧版本
		// 那种「给空闲价和高峰价两个数，猜不出实际该按哪个算」的区间估算。
		var PRICING = {
			"deepseek-v4-flash": {
				inputUncached: { off: 1.5, peak: 3.0 },
				inputCached: { off: 0.05, peak: 0.10 },
				output: { off: 4.5, peak: 9.0 },
			},
			"deepseek-v4-pro": {
				inputUncached: { off: 4.5, peak: 9.0 },
				inputCached: { off: 0.15, peak: 0.30 },
				output: { off: 13.5, peak: 27.0 },
			},
		};

		// `config.model` 形如 "deepseek/deepseek-v4-pro-0813"（provider 前缀 + 版本
		// 后缀）。取最后一段、前缀匹配价格卡键；匹配不上返回 null → 分别按两卡估算。
		function normalizeModel(model) {
			if (!model) return null;
			var seg = String(model).split("/").pop();
			for (var key in PRICING) {
				if (seg === key || seg.indexOf(key) === 0) return key;
			}
			return null;
		}

		// 一个模型桶 → (真实总价, 其中高峰份额的价)。把每种 token 类型拆成高峰
		// 份额（peak_*）和空闲份额（全量 − peak_*），各按各自单价计价再相加——
		// 不是「全量按空闲价」和「全量按高峰价」两个假设性区间。
		function computePrice(usage, model) {
			if (!usage) return null;
			var card = PRICING[model];
			if (!card) return null;
			var uPeak = (usage.peak_uncached_input_tokens || 0) / 1e6;
			var cPeak = (usage.peak_cache_read_tokens || 0) / 1e6;
			var oPeak = (usage.peak_output_tokens || 0) / 1e6;
			var uOff = (usage.uncached_input_tokens || 0) / 1e6 - uPeak;
			var cOff = (usage.cache_read_tokens || 0) / 1e6 - cPeak;
			var oOff = (usage.output_tokens || 0) / 1e6 - oPeak;
			var off = uOff * card.inputUncached.off + cOff * card.inputCached.off + oOff * card.output.off;
			var peak = uPeak * card.inputUncached.peak + cPeak * card.inputCached.peak + oPeak * card.output.peak;
			return { total: off + peak, peak: peak };
		}

		function formatMoney(n) {
			if (n === null || n === undefined) return null;
			var s = n >= 100 ? n.toFixed(1) : n.toFixed(2);
			return "¥" + s.replace(/\.0+$/, "").replace(/(\.\d)0$/, "$1");
		}

		// 展示名：归一化成价格卡键；未知模型保留原始段（截断）。
		function modelShort(model) {
			var norm = normalizeModel(model);
			if (norm) return norm;
			return truncate(String(model || "").split("/").pop(), 24);
		}

		// 把 tokenByModel 投影折成渲染层要的结构化数据（不是预格式化字符串）：
		// 每模型桶 × 该模型单价，求和得全会话费用。tokenByModel 未就绪或尚无任何
		// 可分桶的 usage 时返回 null——与 findings 的 pending 逻辑同构，不显示假的 ¥0。
		function computeCost(tokenByModel) {
			if (tokenByModel === undefined || !tokenByModel.by_model) return null;
			var total = 0, peakTotal = 0, unpriced = 0;
			var perModel = [];
			for (var model in tokenByModel.by_model) {
				var b = tokenByModel.by_model[model];
				var norm = normalizeModel(model);
				if (!norm) {
					// 模型未知（含无 request/header 的 unknown 桶）：不臆测单价，
					// 单独列为「未计价」。
					unpriced += (b.uncached_input_tokens || 0) + (b.cache_read_tokens || 0) + (b.cache_write_tokens || 0);
					continue;
				}
				var p = computePrice(b, norm);
				if (!p) continue;
				total += p.total; peakTotal += p.peak;
				perModel.push({ label: modelShort(model), total: p.total });
			}
			if (perModel.length === 0 && unpriced === 0) return null;
			return { total: total, peakTotal: peakTotal, perModel: perModel, unpriced: unpriced, sequence: tokenByModel.sequence || [] };
		}

		// ── long path → prefix…suffix ──────────────────────────────────────────
		function truncate(s, max) {
			max = max || 48;
			if (!s || s.length <= max) return s;
			var head = Math.ceil((max - 1) * 0.6);
			var tail = max - 1 - head;
			return s.slice(0, head) + "…" + s.slice(-tail);
		}

		// ── critical-first, newest-first within a severity ────────────────────
		function orderSeverity(sev) {
			return sev === "critical" ? 0 : sev === "warning" ? 1 : 2;
		}
		function sortFindings(findings) {
			return findings.slice().sort(function (a, b) {
				var d = orderSeverity(a.severity) - orderSeverity(b.severity);
				if (d !== 0) return d;
				return (b.seq || 0) - (a.seq || 0);
			});
		}
		function groupBySeverity(findings) {
			var groups = { critical: [], warning: [], info: [] };
			sortFindings(findings).forEach(function (f) {
				(groups[f.severity] || groups.info).push(f);
			});
			return groups;
		}

		// ── severity summary chips ─────────────────────────────────────────────
		// Zero counts don't render (a red "0 critical" reads as a warning that
		// isn't there); each chip is its own colored pill (icon + count + label
		// together, never color alone) laid out with flex gap — no join(" ")
		// that white-space:normal would collapse back to one space.
		function summarizeNodes(findings) {
			var counts = { critical: 0, warning: 0, info: 0 };
			for (var i = 0; i < findings.length; i++) {
				var s = findings[i].severity;
				if (counts[s] !== undefined) counts[s]++;
			}
			var nodes = [];
			SEVERITY_ORDER.forEach(function (sev) {
				if (!counts[sev]) return;
				var cfg = SEVERITY[sev];
				nodes.push(
					createElement(
						"span",
						{
							key: sev,
							style: {
								display: "inline-flex",
								alignItems: "center",
								gap: 6,
								padding: "4px 10px",
								borderRadius: 999,
								background: tint(cfg.color, 14),
								color: cfg.color,
								fontWeight: 600,
								font: T.fontSmall,
							},
						},
						cfg.glyph + " " + counts[sev] + " " + cfg.label,
					),
				);
			});
			return nodes;
		}

		function findingRow(f) {
			var sev = SEVERITY[f.severity] || SEVERITY.info;
			var label = RULE_LABEL[f.rule] || f.rule;
			return createElement(
				"div",
				{
					key: f.seq + ":" + f.rule + ":" + f.evidence,
					style: {
						display: "flex",
						alignItems: "baseline",
						gap: 8,
						padding: "6px 2px",
						borderBottom: "1px solid " + T.border,
						font: T.fontSmall,
						color: T.fg,
					},
				},
				[
					createElement("span", { key: "glyph", style: { color: sev.color, fontWeight: 700, flexShrink: 0 } }, sev.glyph),
					createElement("span", { key: "rule", style: { color: sev.color, fontWeight: 600, flexShrink: 0, fontFamily: T.fontMono } }, f.rule),
					createElement("span", { key: "label", style: { color: T.muted, flexShrink: 0 } }, label),
					f.tool_name
						? createElement("span", { key: "tool", style: { color: T.dimmed, flexShrink: 0 } }, f.tool_name)
						: null,
					createElement(
						"span",
						{
							key: "evidence",
							title: f.evidence,
							style: {
								fontFamily: T.fontMono,
								color: T.muted,
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap",
								flex: "1 1 auto",
								minWidth: 0,
							},
						},
						truncate(f.evidence),
					),
					f.seq !== null && f.seq !== undefined
						? createElement(
								"span",
								{ key: "seq", style: { color: T.dimmed, fontFamily: T.fontMono, flexShrink: 0, marginLeft: "auto" } },
								"#" + f.seq,
							)
						: null,
				],
			);
		}

		// Own component (not a plain helper call) so its useState follows the
		// Rules of Hooks — each severity group mounts as its own createElement
		// call, not an inline function invocation. A long tail (188 findings from
		// one flooded rule is a real recorded case) collapses to the first 20 with
		// a "show all" toggle instead of either a silent truncation or a 4000px
		// wall of identical rows.
		var COLLAPSE_AT = 20;
		function FindingGroup(props) {
			var cfg = SEVERITY[props.sev];
			var items = props.items;
			var pair = useState(items.length > COLLAPSE_AT);
			var collapsed = pair[0];
			var setCollapsed = pair[1];
			var shown = collapsed ? items.slice(0, COLLAPSE_AT) : items;
			var children = [
				createElement(
					"div",
					{
						key: "gh",
						style: {
							display: "flex",
							alignItems: "center",
							gap: 6,
							color: cfg.color,
							fontWeight: 600,
							font: T.fontSmall,
							marginBottom: T.space.xs,
						},
					},
					cfg.glyph + " " + cfg.label + " · " + items.length,
				),
				createElement("div", { key: "rows" }, shown.map(findingRow)),
			];
			if (items.length > COLLAPSE_AT) {
				children.push(
					createElement(
						"button",
						{
							key: "toggle",
							onClick: function () { setCollapsed(!collapsed); },
							style: {
								marginTop: T.space.xs,
								padding: "6px 0",
								background: "none",
								border: "none",
								color: T.accent,
								cursor: "pointer",
								font: T.fontSmall,
							},
						},
						collapsed ? "显示全部 " + items.length + " 条 ▾" : "收起 ▴",
					),
				);
			}
			return createElement("div", { style: { marginBottom: T.space.lg } }, children);
		}

		function sectionHeading(key, text) {
			return createElement(
				"div",
				{
					key: key,
					style: {
						font: T.fontSmall,
						color: T.muted,
						fontWeight: 600,
						textTransform: "uppercase",
						letterSpacing: "0.04em",
						marginBottom: T.space.sm,
					},
				},
				text,
			);
		}

		function divider(key) {
			return createElement("div", { key: key, style: { height: 1, background: T.border, margin: T.space.lg + "px 0" } });
		}

		function costSection(cost) {
			if (!cost) return null;
			var children = [sectionHeading("cost-h", "费用估算")];
			// tokenByModel 的 peak_* 子桶已经按每笔请求自己的时间精确标出高峰份额
			// （见 computePrice），所以这是一个真实发生的费用，不是「猜不出你半夜
			// 发的请求该按哪个价算」的空闲/高峰区间——一个数就够了。只有当这次
			// 会话确实横跨了高峰时段（peakTotal > 0）才补一句它占了多少。
			var headlineParts = [
				createElement("span", { key: "total", style: { fontWeight: 700, fontSize: 16, color: T.fg, fontVariantNumeric: "tabular-nums" } }, formatMoney(cost.total)),
			];
			if (cost.peakTotal > 0) {
				headlineParts.push(
					createElement("span", { key: "peak-note", style: { color: T.dimmed, font: T.fontSmall } }, "其中高峰时段 " + formatMoney(cost.peakTotal)),
				);
			}
			children.push(
				createElement("div", { key: "headline", style: { display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" } }, headlineParts),
			);

			if (cost.sequence.length === 1) {
				children.push(
					createElement("div", { key: "single-model", style: { color: T.muted, font: T.fontSmall, marginTop: 2 } }, modelShort(cost.sequence[0])),
				);
			} else if (cost.sequence.length > 1) {
				children.push(
					createElement(
						"div",
						{ key: "seq", style: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4, marginTop: T.space.xs } },
						cost.sequence.map(function (m, i) {
							return createElement(
								"span",
								{ key: "seq-" + i, style: { display: "inline-flex", alignItems: "center", gap: 4 } },
								[
									createElement(
										"span",
										{
											key: "chip",
											style: {
												padding: "2px 8px",
												borderRadius: 999,
												border: "1px solid " + T.border,
												color: T.muted,
												font: T.fontSmall,
											},
										},
										modelShort(m),
									),
									i < cost.sequence.length - 1 ? createElement("span", { key: "arrow", style: { color: T.dimmed } }, "→") : null,
								],
							);
						}),
					),
				);
			}

			if (cost.perModel.length > 1) {
				children.push(
					createElement(
						"div",
						{ key: "per-model", style: { marginTop: T.space.sm, display: "flex", flexDirection: "column", gap: 4 } },
						cost.perModel.map(function (r, i) {
							return createElement(
								"div",
								{
									key: "pm-" + i,
									style: { display: "flex", justifyContent: "space-between", gap: 12, font: T.fontSmall, color: T.muted },
								},
								[
									createElement("span", { key: "l" }, r.label),
									createElement("span", { key: "v", style: { fontVariantNumeric: "tabular-nums" } }, formatMoney(r.total)),
								],
							);
						}),
					),
				);
			}

			if (cost.unpriced > 0) {
				children.push(
					createElement(
						"div",
						{ key: "unpriced", style: { marginTop: T.space.xs, color: T.dimmed, font: T.fontSmall } },
						"另有 " + formatNumber(cost.unpriced) + " tokens 模型未知，未计价",
					),
				);
			}

			return createElement("div", { key: "cost", "data-audit-cost": "" }, children);
		}

		function AuditView(props) {
			var useProjection = props.useProjection;
			var findings = useProjection ? useProjection("behaviorFindings") : undefined;
			var tokenUsage = useProjection ? useProjection("tokenUsage") : undefined;
			var tokenByModel = useProjection ? useProjection("tokenByModel") : undefined;

			var tokenText = formatTokens(tokenUsage);
			var cost = computeCost(tokenByModel);

			var containerStyle = {
				padding: T.space.xl + "px " + T.space.xl + "px",
				color: T.fg,
				font: T.fontProse,
				lineHeight: 1.5,
			};

			if (findings === undefined && tokenText === null && !cost) {
				return createElement(
					"div",
					{ "data-audit-view": "", style: containerStyle },
					createElement("span", { style: { color: T.muted } }, "审计：暂无数据（宿主投影尚未就绪）"),
				);
			}

			var children = [];
			var dividerNeeded = false;

			// 汇总头：严重级 chips
			if (findings !== undefined && findings.length > 0) {
				children.push(
					createElement("div", { key: "summary", style: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: T.space.lg } }, summarizeNodes(findings)),
				);
			}

			// token 用量 + 占比条
			if (tokenText !== null) {
				children.push(
					createElement("div", { key: "tokens", "data-audit-tokens": "" }, [
						sectionHeading("tokens-h", "Token 用量"),
						createElement("div", { key: "tokens-text", style: { color: T.muted, fontVariantNumeric: "tabular-nums" } }, tokenText),
						tokenCompositionBar(tokenUsage),
					]),
				);
				dividerNeeded = true;
			}

			// 价格估算
			if (cost) {
				if (dividerNeeded) children.push(divider("div-cost"));
				children.push(costSection(cost));
				dividerNeeded = true;
			}

			if (dividerNeeded) children.push(divider("div-findings"));

			if (findings === undefined) {
				children.push(createElement("div", { key: "pending", style: { color: T.muted } }, "行为审计：计算中…"));
			} else if (findings.length === 0) {
				children.push(
					createElement(
						"div",
						{ key: "clean", style: { display: "flex", alignItems: "center", gap: 6, color: T.success, fontWeight: 600 } },
						"✓ 行为审计：未命中高危规则",
					),
				);
			} else {
				var groups = groupBySeverity(findings);
				children.push(
					createElement(
						"div",
						{ key: "findings", "data-audit-findings": "" },
						[sectionHeading("findings-h", "行为审计 · " + findings.length + " 条")].concat(
							SEVERITY_ORDER.filter(function (sev) { return groups[sev].length > 0; }).map(function (sev) {
								return createElement(FindingGroup, { key: sev, sev: sev, items: groups[sev] });
							}),
						),
					),
				);
			}

			return createElement("div", { "data-audit-view": "", style: containerStyle }, children);
		}

		function apply(ctx) {
			// The registration rides the slot service's effect wrapper so plugin
			// unload removes the tab (same pattern as ui-trajectory's client index).
			ctx.slots.inject("conversation.view", function () {
				return ctx.slots.register(
					{
						name: "conversation.view",
						id: "audit",
						order: 20,
						// Registration-time text as a thunk, so it follows the active
						// locale without re-registration.
						label: function () {
							return "审计";
						},
						// Business inject face: receives the framework-resolved sessionId;
						// the standard kit (sessionId/useProjection) arrives on props.
						inject: function () {
							return {};
						},
					},
					AuditView,
				);
			});
		}

		exports.apply = apply;
		exports.inject = ["slots"];

		return module.exports;
	},
});
