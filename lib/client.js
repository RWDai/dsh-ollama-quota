window.__ModuleLoader__.load({
	id: "dsh-ollama-quota",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const React = require("react");

		/** 浏览器半与 host 半约定的只读端点。 */
		const ENDPOINT = "/plugin/ollama-quota/state";

		//#region 样式
		/**
		 * 样式：尺寸/字号/圆角/配色逐条对齐原生输入框 dock（TodoDock、GoalBar 用的
		 * 同一套配方）——根容器 border-l1 + specific-tip + 12px 圆角 + overflow
		 * hidden，body padding 6px 12px，标题 13px/500，正文 13px 三级灰。
		 *
		 * 详情不再做成浮层：原生任务条就是「点标题在条内展开」，浮层既和它不一致，
		 * 也会踩到 overlay 层的层叠/裁剪。展开区用 inset 阴影做分隔线。
		 *
		 * calc 里只能用加减：`4 * var(...)` 是非法语法，整条声明会被丢弃。
		 */
		const CSS = `
.ollamaQuota_root{box-sizing:border-box;width:calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));max-width:calc(var(--dsh-composer-card-max-width) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-specific-tip);border-radius:12px;flex:none;margin:0 auto;overflow:hidden}
.ollamaQuota_body{display:flex;flex-direction:column;gap:8px;padding:6px 12px}
.ollamaQuota_header{display:flex;align-items:center;gap:10px;width:100%;min-height:24px;padding:0;text-align:left;background:0 0;border:none;cursor:pointer}
.ollamaQuota_header:focus-visible{outline:2px solid var(--dsw-alias-label-tertiary);outline-offset:-2px;border-radius:8px}
.ollamaQuota_lead{display:grid;place-items:center;width:16px;height:16px;flex:none;color:var(--dsw-alias-label-tertiary)}
.ollamaQuota_title{flex:none;color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:24px}
.ollamaQuota_summary{flex:auto;min-width:0;color:var(--dsw-alias-label-tertiary);font-size:13px;font-weight:400;line-height:20px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
.ollamaQuota_summary strong{color:var(--dsw-alias-label-primary-dimmed);font-weight:500;font-variant-numeric:tabular-nums}
.ollamaQuota_chevron{display:grid;place-items:center;width:14px;height:14px;flex:none;color:var(--dsw-alias-label-tertiary);transition:transform .15s ease}
.ollamaQuota_chevron[data-open="true"]{transform:rotate(180deg)}
.ollamaQuota_detail{display:flex;flex-direction:column;gap:8px;max-height:236px;overflow-y:auto;padding:8px 2px 0 0;box-shadow:inset 0 1px 0 var(--dsw-alias-border-l1);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2)}
.ollamaQuota_track{position:relative;height:6px;border-radius:999px;background:var(--dsw-alias-bg-skeleton);overflow:visible;margin:2px 0 0}
.ollamaQuota_fill{position:absolute;left:0;top:0;bottom:0;border-radius:999px;background:var(--dsw-alias-state-business-primary);min-width:2px}
.ollamaQuota_fill[data-verdict="ahead"]{background:var(--dsw-alias-state-error-primary)}
.ollamaQuota_fill[data-verdict="behind"]{background:var(--dsw-alias-state-success-primary)}
.ollamaQuota_marker{position:absolute;top:-3px;bottom:-3px;width:2px;border-radius:1px;background:var(--dsw-alias-label-tertiary)}
.ollamaQuota_legend{display:flex;flex-wrap:wrap;gap:4px 12px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.ollamaQuota_grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2px 16px}
.ollamaQuota_cell{display:flex;align-items:baseline;justify-content:space-between;gap:8px;font-size:13px;line-height:20px}
.ollamaQuota_cellLabel{flex:none;color:var(--dsw-alias-label-tertiary)}
.ollamaQuota_cellValue{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;text-align:right}
.ollamaQuota_cellValue[data-strong="true"]{color:var(--dsw-alias-label-primary);font-weight:500}
.ollamaQuota_section{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;margin-top:2px}
.ollamaQuota_chart{display:flex;align-items:flex-end;gap:3px;height:38px}
.ollamaQuota_chartBar{flex:1;min-width:2px;min-height:1px;border-radius:2px 2px 0 0;background:var(--dsw-alias-state-business-primary);opacity:.7}
.ollamaQuota_chartBar:last-child{opacity:1}
.ollamaQuota_chartAxis{display:flex;justify-content:space-between;color:var(--dsw-alias-label-caption);font-size:11px;line-height:16px}
.ollamaQuota_note{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}
.ollamaQuota_note[data-warn="true"]{color:var(--dsw-alias-state-error-primary)}
.ollamaQuota_foot{display:flex;align-items:center;gap:10px;padding-top:6px;box-shadow:inset 0 1px 0 var(--dsw-alias-border-l1);color:var(--dsw-alias-label-caption);font-size:12px;line-height:18px}
.ollamaQuota_refresh{margin-left:auto;padding:2px 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:0 0;color:var(--dsw-alias-label-secondary);font-size:12px;cursor:pointer}
.ollamaQuota_refresh:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.ollamaQuota_refresh:disabled{opacity:.45;cursor:default}
.ollamaQuota_skeleton{display:block;width:120px;height:14px;border-radius:6px;background:var(--dsw-alias-bg-skeleton)}
.ollamaQuota_error{flex:auto;min-width:0;color:var(--dsw-alias-state-error-primary);font-size:13px;line-height:20px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
`;
		const CSS_ID = "dsh-ollama-quota/quota.css";
		if (typeof document !== "undefined" && document.querySelector(`style[data-plugin-css=${JSON.stringify(CSS_ID)}]`) === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-ollama-quota";
			tag.dataset.pluginCss = CSS_ID;
			tag.textContent = CSS;
			document.head.appendChild(tag);
		}
		//#endregion

		//#region 文案
		/** 文案命名空间。 */
		const NS = "ollamaQuota";
		const zh = {
			"dock.title": "Ollama 额度",
			"dock.aria": "Ollama 套餐额度，点击展开详情",
			"dock.failed": "额度不可用",
			"dock.expires": "{date} 到期",
			"pace.ahead": "用得快",
			"pace.behind": "用得慢",
			"pace.onTrack": "节奏正常",
			"pace.unknown": "节奏未知",
			"card.plan": "套餐",
			"card.remaining": "剩余",
			"card.used": "已用",
			"card.allowance": "总额度",
			"card.purchased": "购买额度",
			"card.expires": "到期时间",
			"card.daysLeft": "剩余天数",
			"card.burnPerDay": "日均消耗",
			"card.tokens": "本周期 Token",
			"card.input": "输入",
			"card.cached": "缓存命中",
			"card.output": "输出",
			"card.requests": "请求数",
			"card.total": "合计",
			"card.daily": "最近消费（按日）",
			"card.projection": "节奏预测",
			"card.projected": "按当前速度，到期预计消耗 {cost}（{pct}）",
			"card.runway": "剩余额度约可支撑 {days} 天",
			"card.exhausts": "按当前速度会在到期前用完额度",
			"card.exhaustsOk": "按当前速度不会在到期前用完额度",
			"card.elapsed": "时间已过 {pct}",
			"card.updated": "更新于 {time}",
			"card.refresh": "刷新",
			"card.missingKey": "未配置 OLLAMA_API_KEY，无法读取额度",
			"card.unauthorized": "Ollama 拒绝了当前凭据，请重新登录或更换 key",
			"card.forbidden": "无权读取额度（会话未通过校验，请用带 token 的地址重新打开）",
			"card.upstream": "Ollama 接口暂时不可用",
			"card.network": "无法连接 ollama.com",
			"card.usageDegraded": "用量接口暂不可用，token 数据缺失",
			"common.days": "天"
		};
		const en = {
			"dock.title": "Ollama quota",
			"dock.aria": "Ollama plan quota, expand for details",
			"dock.failed": "quota unavailable",
			"dock.expires": "renews {date}",
			"pace.ahead": "burning fast",
			"pace.behind": "under pace",
			"pace.onTrack": "on pace",
			"pace.unknown": "pace unknown",
			"card.plan": "Plan",
			"card.remaining": "Remaining",
			"card.used": "Used",
			"card.allowance": "Allowance",
			"card.purchased": "Purchased",
			"card.expires": "Renews",
			"card.daysLeft": "Days left",
			"card.burnPerDay": "Burn/day",
			"card.tokens": "Tokens this period",
			"card.input": "Input",
			"card.cached": "Cached",
			"card.output": "Output",
			"card.requests": "Requests",
			"card.total": "Total",
			"card.daily": "Recent spend (daily)",
			"card.projection": "Pace forecast",
			"card.projected": "At this pace the period ends at {cost} ({pct})",
			"card.runway": "Remaining credit lasts about {days} days",
			"card.exhausts": "At this pace the credit runs out before renewal",
			"card.exhaustsOk": "At this pace the credit lasts to renewal",
			"card.elapsed": "{pct} of the period elapsed",
			"card.updated": "updated {time}",
			"card.refresh": "Refresh",
			"card.missingKey": "OLLAMA_API_KEY is not configured",
			"card.unauthorized": "Ollama rejected the credential",
			"card.forbidden": "not allowed to read quota (reopen the page with its tokenized URL)",
			"card.upstream": "Ollama API is temporarily unavailable",
			"card.network": "cannot reach ollama.com",
			"card.usageDegraded": "Usage endpoint unavailable; token data missing",
			"common.days": "days"
		};
		//#endregion

		//#region 状态
		/**
		 * 模块级小仓库：dock 与轮询共用同一份快照，用 useSyncExternalStore 订阅。
		 */
		const store = {
			snapshot: { status: "idle", payload: undefined, error: undefined, expanded: false, refreshing: false },
			listeners: new Set(),
			get() {
				return store.snapshot;
			},
			subscribe(listener) {
				store.listeners.add(listener);
				return () => {
					store.listeners.delete(listener);
				};
			},
			patch(next) {
				store.snapshot = { ...store.snapshot, ...next };
				for (const listener of store.listeners) listener();
			}
		};

		/** 订阅函数必须是稳定引用。 */
		function subscribe(listener) {
			return store.subscribe(listener);
		}

		let timer;
		let inflight;
		/**
		 * 本插件覆盖的供应商 id 列表；host 载荷到达后以载荷为准。
		 * 会话切到列表外的供应商时，dock 不渲染也不轮询。
		 */
		let activeProviders = ["ollama"];
		/** 当前挂载且处于生效状态的 dock 实例数（无会话可判断时算作生效）。 */
		let visibleInstances = 0;
		/** 最近一次刷新时间，用于判断是否值得在回到前台时立刻刷新。 */
		let lastAttempt = 0;

		/** 下次轮询间隔：优先采用 host 下发的 refreshMs，且不短于 15s。 */
		function nextDelay() {
			const fromHost = store.snapshot.payload && store.snapshot.payload.refreshMs;
			return Math.max(15_000, typeof fromHost === "number" && fromHost > 0 ? fromHost : 60_000);
		}

		/** 安排下一次轮询。 */
		function schedule() {
			clearTimeout(timer);
			timer = setTimeout(refresh, nextDelay());
		}

		/** 拉一次额度快照；失败保留上一次成功数据，只标记状态。 */
		async function refresh(options) {
			if (visibleInstances === 0 && !(options !== undefined && options.force === true)) return undefined;
			if (inflight !== undefined) return inflight;
			lastAttempt = Date.now();
			store.patch({ refreshing: true });
			inflight = (async () => {
				try {
					const response = await fetch(ENDPOINT, {
						headers: { accept: "application/json" },
						cache: "no-store",
						credentials: "same-origin"
					});
					if (!response.ok) {
						const statusError = new Error("HTTP " + response.status);
						statusError.code = response.status === 401 || response.status === 403 ? "forbidden" : "network";
						throw statusError;
					}
					const payload = await response.json();
					if (payload && payload.ok === true) {
						if (Array.isArray(payload.providers) && payload.providers.length > 0) activeProviders = payload.providers;
						store.patch({ status: "ready", payload, error: undefined, refreshing: false });
					} else {
						store.patch({ status: "error", error: payload, refreshing: false });
					}
				} catch (error) {
					store.patch({
						status: "error",
						error: {
							code: error && error.code === "forbidden" ? "forbidden" : "network",
							message: String(error && error.message ? error.message : error)
						},
						refreshing: false
					});
				} finally {
					inflight = undefined;
					if (visibleInstances > 0) schedule();
				}
			})();
			return inflight;
		}

		/**
		 * 记账 dock 的可见实例数。归零时停表，恢复时立刻补一次数据。
		 * @param {boolean} visible 挂载（true）还是卸载（false）。
		 */
		function setVisible(visible) {
			visibleInstances = Math.max(0, visibleInstances + (visible ? 1 : -1));
			if (visibleInstances > 0) refresh();
			else clearTimeout(timer);
		}

		/** 切回前台时立刻刷一次，避免长时间挂后台后显示过期数字。 */
		function onVisibility() {
			if (visibleInstances === 0) return;
			if (document.visibilityState === "visible" && Date.now() - lastAttempt > 10_000) refresh();
		}
		//#endregion

		//#region 格式化
		/** 美元金额。 */
		function money(value) {
			if (typeof value !== "number" || !Number.isFinite(value)) return "—";
			return "$" + value.toFixed(2);
		}

		/** 百分比（入参是 0..1 的比例）。 */
		function percent(value, digits) {
			if (typeof value !== "number" || !Number.isFinite(value)) return "—";
			return (value * 100).toFixed(digits === undefined ? 1 : digits) + "%";
		}

		/** Token 数的紧凑写法。 */
		function compactTokens(value) {
			if (typeof value !== "number" || !Number.isFinite(value)) return "—";
			if (value >= 1e9) return (value / 1e9).toFixed(2) + "B";
			if (value >= 1e6) return (value / 1e6).toFixed(2) + "M";
			if (value >= 1e3) return (value / 1e3).toFixed(1) + "k";
			return String(value);
		}

		/** 日期（MM-DD）。 */
		function shortDate(iso) {
			if (typeof iso !== "string") return "—";
			const ms = Date.parse(iso);
			if (!Number.isFinite(ms)) return "—";
			const date = new Date(ms);
			return String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
		}

		/** 时刻（HH:MM）。 */
		function clockTime(iso) {
			const ms = typeof iso === "string" ? Date.parse(iso) : NaN;
			if (!Number.isFinite(ms)) return "—";
			const date = new Date(ms);
			return String(date.getHours()).padStart(2, "0") + ":" + String(date.getMinutes()).padStart(2, "0");
		}

		/** 天数，一位小数。 */
		function days(value) {
			if (typeof value !== "number" || !Number.isFinite(value)) return "—";
			return value.toFixed(1);
		}

		/** 节奏措辞。 */
		function paceLabel(t, verdict) {
			if (verdict === "ahead") return t("pace.ahead");
			if (verdict === "behind") return t("pace.behind");
			if (verdict === "on-track") return t("pace.onTrack");
			return t("pace.unknown");
		}

		/** 错误码对应的落地文案。 */
		function errorLabel(t, error) {
			const code = error && error.code ? error.code : "network";
			if (code === "missing-key") return t("card.missingKey");
			if (code === "unauthorized") return t("card.unauthorized");
			if (code === "forbidden") return t("card.forbidden");
			if (code === "network") return t("card.network");
			return t("card.upstream");
		}

		/** 节奏色：超前红、落后绿、正常业务色、未知灰。 */
		function verdictColor(verdict) {
			if (verdict === "ahead") return "var(--dsw-alias-state-error-primary)";
			if (verdict === "behind") return "var(--dsw-alias-state-success-primary)";
			if (verdict === "on-track") return "var(--dsw-alias-state-business-primary)";
			return "var(--dsw-alias-label-caption)";
		}
		//#endregion

		//#region 组件
		/** 一格 key/value。 */
		function Cell({ label, value, strong }) {
			return React.createElement(
				"div",
				{ className: "ollamaQuota_cell" },
				React.createElement("span", { className: "ollamaQuota_cellLabel" }, label),
				React.createElement(
					"span",
					{ className: "ollamaQuota_cellValue", "data-strong": strong === true ? "true" : undefined },
					value
				)
			);
		}

		/** 日消费条形图。 */
		function DailyChart({ rows }) {
			const max = rows.reduce((acc, row) => Math.max(acc, typeof row.costUsd === "number" ? row.costUsd : 0), 0);
			return React.createElement(
				"div",
				null,
				React.createElement(
					"div",
					{ className: "ollamaQuota_chart" },
					rows.map((row, index) =>
						React.createElement("div", {
							key: String(row.from) + String(index),
							className: "ollamaQuota_chartBar",
							title: shortDate(row.from) + " · " + money(row.costUsd),
							style: { height: max > 0 ? Math.max(2, Math.round(((row.costUsd || 0) / max) * 100)) + "%" : "2%" }
						})
					)
				),
				React.createElement(
					"div",
					{ className: "ollamaQuota_chartAxis" },
					React.createElement("span", null, rows.length > 0 ? shortDate(rows[0].from) : "—"),
					React.createElement("span", null, rows.length > 0 ? shortDate(rows[rows.length - 1].from) : "—")
				)
			);
		}

		/**
		 * 展开后的明细区：进度条（已用 vs 时间进度）、关键数字、token、日消费、预测。
		 * @param {{t: Function, payload: object}} props 文案函数与已就绪载荷。
		 * @returns {object} React 元素。
		 */
		function QuotaDetail({ t, payload }) {
			const pace = payload.pace || { verdict: "unknown" };
			const period = payload.period || {};
			const tokens = payload.tokens || {};
			const rows = Array.isArray(payload.daily) ? payload.daily.slice(-30) : [];
			const verdict = pace.verdict || "unknown";
			const usedPct = typeof payload.usedPct === "number" ? payload.usedPct : 0;
			const elapsedPct = typeof period.elapsedPct === "number" ? period.elapsedPct : undefined;

			return React.createElement(
				"div",
				{ className: "ollamaQuota_detail", "data-ollama-quota-detail": true },
				React.createElement(
					"div",
					{ className: "ollamaQuota_track" },
					React.createElement("div", {
						className: "ollamaQuota_fill",
						"data-verdict": verdict,
						style: { width: Math.min(100, Math.max(0, usedPct * 100)) + "%" }
					}),
					elapsedPct === undefined
						? null
						: React.createElement("div", {
								className: "ollamaQuota_marker",
								title: t("card.elapsed", { pct: percent(elapsedPct) }),
								style: { left: Math.min(100, Math.max(0, elapsedPct * 100)) + "%" }
							})
				),
				React.createElement(
					"div",
					{ className: "ollamaQuota_legend" },
					React.createElement("span", null, t("card.used") + " " + percent(payload.usedPct)),
					elapsedPct === undefined
						? null
						: React.createElement("span", null, t("card.elapsed", { pct: percent(elapsedPct) })),
					React.createElement("span", null, paceLabel(t, verdict)),
					payload.plan ? React.createElement("span", null, t("card.plan") + " " + String(payload.plan)) : null
				),
				React.createElement(
					"div",
					{ className: "ollamaQuota_grid" },
					React.createElement(Cell, {
						label: t("card.remaining"),
						value: money(payload.remainingUsd),
						strong: true
					}),
					React.createElement(Cell, { label: t("card.allowance"), value: money(payload.allowanceUsd) }),
					React.createElement(Cell, {
						label: t("card.expires"),
						value: shortDate(period.until),
						strong: true
					}),
					React.createElement(Cell, {
						label: t("card.daysLeft"),
						value: days(period.remainingDays) + " " + t("common.days")
					}),
					React.createElement(Cell, { label: t("card.burnPerDay"), value: money(pace.burnPerDayUsd) }),
					React.createElement(Cell, { label: t("card.purchased"), value: money(payload.purchasedRemainingUsd) })
				),
				React.createElement("div", { className: "ollamaQuota_section" }, t("card.tokens")),
				React.createElement(
					"div",
					{ className: "ollamaQuota_grid" },
					React.createElement(Cell, { label: t("card.input"), value: compactTokens(tokens.inputTokens) }),
					React.createElement(Cell, { label: t("card.cached"), value: compactTokens(tokens.cachedInputTokens) }),
					React.createElement(Cell, { label: t("card.output"), value: compactTokens(tokens.outputTokens) }),
					React.createElement(Cell, {
						label: t("card.total"),
						value: compactTokens(tokens.totalTokens),
						strong: true
					}),
					React.createElement(Cell, { label: t("card.requests"), value: String(tokens.requests ?? 0) })
				),
				React.createElement("div", { className: "ollamaQuota_section" }, t("card.daily")),
				React.createElement(DailyChart, { rows }),
				React.createElement("div", { className: "ollamaQuota_section" }, t("card.projection")),
				React.createElement(
					"div",
					{ className: "ollamaQuota_note" },
					t("card.projected", {
						cost: money(pace.projectedCostUsd),
						pct: percent(pace.projectedPct)
					})
				),
				typeof pace.runwayDays === "number"
					? React.createElement(
							"div",
							{ className: "ollamaQuota_note", "data-warn": pace.exhaustsBeforeRenewal ? "true" : undefined },
							pace.exhaustsBeforeRenewal
								? t("card.exhausts")
								: t("card.exhaustsOk") + " · " + t("card.runway", { days: days(pace.runwayDays) })
						)
					: null,
				payload.degraded && payload.degraded.usage
					? React.createElement(
							"div",
							{ className: "ollamaQuota_note", "data-warn": "true" },
							t("card.usageDegraded")
						)
					: null,
				React.createElement(
					"div",
					{ className: "ollamaQuota_foot" },
					React.createElement("span", null, t("card.updated", { time: clockTime(payload.fetchedAt) })),
					React.createElement(
						"button",
						{
							type: "button",
							className: "ollamaQuota_refresh",
							onClick: () => refresh(),
							disabled: store.snapshot.refreshing === true
						},
						t("card.refresh")
					)
				)
			);
		}

		/**
		 * dock 条：常驻输入框上方的一行摘要，点标题在条内展开明细。
		 * 结构与原生 TodoDock 一致：root > body > header(+detail)。
		 * @param {{t: Function}} props 注入的文案函数。
		 * @returns {object} React 元素。
		 */
		function QuotaDock({ t, directory }) {
			const snapshot = React.useSyncExternalStore(subscribe, store.get, store.get);
			// 会话的模型选择服务（ui-model-selection 注册的 modelDirectories）。
			// 拿不到它时无法判断供应商，退回「总是显示」，避免插件在别的 DSH 里消失。
			const modelStore = directory === undefined ? undefined : directory.store ?? directory;
			const modelState = React.useSyncExternalStore(
				React.useCallback((listener) => (modelStore === undefined ? () => {} : modelStore.subscribe(listener)), [modelStore]),
				React.useCallback(() => (modelStore === undefined ? undefined : modelStore.getSnapshot()), [modelStore]),
				React.useCallback(() => (modelStore === undefined ? undefined : modelStore.getSnapshot()), [modelStore])
			);
			const providers =
				snapshot.payload !== undefined && Array.isArray(snapshot.payload.providers) && snapshot.payload.providers.length > 0
					? snapshot.payload.providers
					: activeProviders;
			const currentProvider = modelState && modelState.current ? modelState.current.provider : undefined;
			const active = directory === undefined ? true : typeof currentProvider === "string" && providers.includes(currentProvider);
			React.useEffect(() => {
				if (!active) return undefined;
				setVisible(true);
				return () => {
					store.patch({ expanded: false });
					setVisible(false);
				};
			}, [active]);
			if (!active) return null;
			const payload = snapshot.payload;
			const ready = payload !== undefined && payload.ok === true;
			const verdict = ready && payload.pace ? payload.pace.verdict : "unknown";
			const expanded = snapshot.expanded === true;

			// 摘要行：加载中是骨架，出错是红色一句话，正常是一条紧凑摘要。
			let summary;
			if (snapshot.status === "idle") {
				summary = React.createElement("span", { className: "ollamaQuota_skeleton" });
			} else if (!ready) {
				summary = React.createElement(
					"span",
					{ className: "ollamaQuota_error" },
					snapshot.error ? errorLabel(t, snapshot.error) : t("dock.failed")
				);
			} else {
				summary = React.createElement(
					"span",
					{ className: "ollamaQuota_summary" },
					React.createElement("strong", null, money(payload.remainingUsd)),
					" / " + money(payload.totalUsd),
					" · " + percent(payload.usedPct),
					" · " + paceLabel(t, verdict),
					" · " + compactTokens(payload.tokens ? payload.tokens.totalTokens : undefined) + " tok",
					" · " + t("dock.expires", { date: shortDate(payload.period ? payload.period.until : undefined) })
				);
			}

			return React.createElement(
				"div",
				{ className: "ollamaQuota_root", "data-ollama-quota": true },
				React.createElement(
					"div",
					{ className: "ollamaQuota_body" },
					React.createElement(
						"button",
						{
							type: "button",
							className: "ollamaQuota_header",
							"aria-label": t("dock.aria"),
							"aria-expanded": expanded ? "true" : "false",
							onClick: () => store.patch({ expanded: !expanded })
						},
						React.createElement(
							"span",
							{ className: "ollamaQuota_lead" },
							React.createElement("span", {
								style: {
									display: "block",
									width: "8px",
									height: "8px",
									borderRadius: "999px",
									background: verdictColor(verdict)
								}
							})
						),
						React.createElement("span", { className: "ollamaQuota_title" }, t("dock.title")),
						summary,
						React.createElement(
							"span",
							{ className: "ollamaQuota_chevron", "data-open": expanded ? "true" : "false" },
							React.createElement(
								"svg",
								{ width: 14, height: 14, viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true" },
								React.createElement("path", {
									d: "M4 6.5 8 10.5 12 6.5",
									stroke: "currentColor",
									strokeWidth: 1.5,
									strokeLinecap: "round",
									strokeLinejoin: "round"
								})
							)
						)
					),
					expanded && ready ? React.createElement(QuotaDetail, { t, payload }) : null
				)
			);
		}
		//#endregion

		//#region 插件体
		/** 依赖的客户端服务。 */
		const inject = ["slots", "locale"];

		/**
		 * 客户端插件体：注册文案与 dock 条，并启动轮询。
		 * @param {object} ctx 客户端根上下文。
		 */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "ollama-quota: dictionaries");

			// order 10：排在原生任务条（0）之后、队列条（20）之前。
			ctx.slots.inject("conversation.input.dock", () =>
				ctx.slots.register(
					{
						name: "conversation.input.dock",
						id: "ollama-quota",
						order: 10,
						locale: NS,
						/**
						 * 把会话的模型选择服务交给 dock，用来判断当前供应商。
						 * 服务缺失（例如没装 ui-model-selection）时返回空，组件按「总是显示」处理。
						 * @param {string} sessionId 会话 id。
						 * @returns {{directory?: object}} 注入的 props。
						 */
						inject: (sessionId) => {
							const directories = ctx.get("modelDirectories");
							if (directories === undefined) return { directory: undefined };
							try {
								return { directory: directories.directoryFor(sessionId) };
							} catch {
								return { directory: undefined };
							}
						}
					},
					QuotaDock
				)
			);

			document.addEventListener("visibilitychange", onVisibility);
			ctx.effect(() => () => {
				document.removeEventListener("visibilitychange", onVisibility);
				clearTimeout(timer);
			});
		}

		exports.QuotaDetail = QuotaDetail;
		exports.QuotaDock = QuotaDock;
		exports.apply = apply;
		exports.inject = inject;
		exports.refresh = refresh;
		exports.store = store;
		return module.exports;
	}
});
