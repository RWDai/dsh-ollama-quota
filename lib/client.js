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
		 * 同一套配方）——根容器 specific-menu + backdrop-filter + elevation-panel +
		 * radius-lg + overflow hidden，body padding 6px 12px，标题 13px/500，正文
		 * 13px 三级灰；图标和折叠箭头也用原生那套 14px 线性图形。
		 *
		 * 详情不再做成浮层：原生任务条就是「点标题在条内展开」，浮层既和它不一致，
		 * 也会踩到 overlay 层的层叠/裁剪。展开区用 inset 阴影做分隔线。
		 *
		 * calc 里只能用加减：`4 * var(...)` 是非法语法，整条声明会被丢弃。
		 */
		const CSS = `
.ollamaQuota_root{box-sizing:border-box;width:calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));max-width:calc(var(--dsh-composer-card-max-width) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-lg);background:var(--dsw-specific-menu);backdrop-filter:var(--dsw-menu-backdrop-filter);box-shadow:var(--dsw-elevation-panel);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);border:0;flex:none;margin:0 auto;overflow:hidden}
.ollamaQuota_body{display:flex;flex-direction:column;gap:8px;padding:6px 12px}
.ollamaQuota_header{display:flex;align-items:center;gap:10px;width:100%;padding:0;text-align:left}
.ollamaQuota_headerMain{display:flex;align-items:center;gap:10px;flex:auto;min-width:0;padding:0;text-align:left;background:0 0;border:none;cursor:pointer;color:inherit;font:inherit}
.ollamaQuota_headerMain:focus-visible{outline:2px solid var(--dsw-alias-label-tertiary);outline-offset:-2px;border-radius:8px}
.ollamaQuota_headerOpen{display:grid;place-items:center;flex:none;padding:4px;border-radius:6px;background:0 0;border:none;cursor:pointer;color:var(--dsw-alias-label-tertiary)}
.ollamaQuota_headerOpen:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
.ollamaQuota_headerOpen:focus-visible{outline:2px solid var(--dsw-alias-label-tertiary);outline-offset:-1px}
.ollamaQuota_lead{display:grid;place-items:center;flex:none;color:var(--dsw-alias-label-tertiary)}
.ollamaQuota_title{flex:none;color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:24px}
.ollamaQuota_summary{flex:auto;min-width:0;color:var(--dsw-alias-label-tertiary);font-size:13px;font-weight:400;line-height:20px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
.ollamaQuota_chevron{display:grid;place-items:center;width:14px;height:14px;flex:none;color:var(--dsw-alias-label-tertiary)}
.ollamaQuota_detail{display:flex;flex-direction:column;gap:8px;max-height:236px;overflow-y:auto;padding:8px 2px 0 0;box-shadow:inset 0 1px 0 var(--dsw-alias-border-l1)}
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
.ollamaQuota_chart{display:flex;align-items:flex-end;justify-content:center;gap:5px}
.ollamaQuota_chartCell{flex:1 1 0;min-width:2px;max-width:26px;display:flex;flex-direction:column;align-items:stretch;gap:3px}
.ollamaQuota_chartBar{flex:none;display:flex;flex-direction:column-reverse;justify-content:flex-start;border:0;border-bottom:2px solid transparent;border-radius:2px 2px 0 0;overflow:hidden;padding:0;cursor:pointer;opacity:1;transition:opacity .15s}
.ollamaQuota_chartSeg{flex:none;width:100%;min-height:0}
.ollamaQuota_chartLabel{color:var(--dsw-alias-label-caption);font-size:11px;line-height:14px;text-align:center;white-space:nowrap;overflow:visible}
.ollamaQuota_note{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}
.ollamaQuota_note[data-warn="true"]{color:var(--dsw-alias-state-error-primary)}
.ollamaQuota_models{display:flex;flex-direction:column;gap:10px}
.ollamaQuota_legendChip{display:inline-block;width:10px;height:10px;border-radius:3px;flex:none}
.ollamaQuota_model{display:flex;flex-direction:column;gap:1px}
.ollamaQuota_modelLine{display:flex;align-items:center;gap:8px;font-size:13px;line-height:22px}
.ollamaQuota_modelLead{display:flex;align-items:center;gap:8px;flex:auto;min-width:0}
.ollamaQuota_modelName{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.ollamaQuota_modelCost{flex:none;color:var(--dsw-alias-label-primary);font-weight:500;font-variant-numeric:tabular-nums}
.ollamaQuota_modelMeta{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;font-variant-numeric:tabular-nums}
/* 移动端：窄屏下收紧留白、降低字号、加高明细滚动区，图例 meta 允许换行不断章。 */
@media (max-width:600px){.ollamaQuota_body{padding:6px 10px}.ollamaQuota_detail{max-height:320px}.ollamaQuota_grid{gap:2px 12px}.ollamaQuota_cell{font-size:12px}}
/* 右侧窗口（sidebar-right 页签）里的完整明细：占满页签体，宽幅可滚，图表加高。 */
.ollamaQuota_tab{box-sizing:border-box;display:flex;flex-direction:column;gap:10px;height:100%;overflow-y:auto;padding:14px 16px;--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2)}
.ollamaQuota_tab .ollamaQuota_detail{max-height:none;padding:0;box-shadow:none;overflow:visible}
.ollamaQuota_tab .ollamaQuota_chartCell{max-width:44px}
.ollamaQuota_tab .ollamaQuota_grid{grid-template-columns:repeat(3,minmax(0,1fr))}
/* 消费图交互：柱子是按钮（点选某几天）；有选中时未选中的柱淡显、选中的描边。 */
.ollamaQuota_chartBar{cursor:pointer;opacity:1;transition:opacity .15s}
.ollamaQuota_chart[data-selecting=true] .ollamaQuota_chartBar[data-selected=false]{opacity:.4}
.ollamaQuota_chartBar[data-selected=true]{border-bottom-color:var(--dsw-alias-state-business-primary);opacity:1}
.ollamaQuota_chartBar:focus-visible{outline:2px solid var(--dsw-alias-label-tertiary);outline-offset:1px}
/* 模型占比条：一根横条按费用比例分色，段与图例 chip 同一套配色。 */
.ollamaQuota_sectionRow{display:flex;align-items:baseline;gap:10px}
.ollamaQuota_clear{margin-left:auto;padding:2px 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:0 0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;cursor:pointer}
.ollamaQuota_clear:hover{color:var(--dsw-alias-label-primary)}
/* 模型行的占比背景条：半透明模型色铺在整行背后（宽度 = 占比），文字仍在上层。 */
.ollamaQuota_model{position:relative;border-radius:4px}
.ollamaQuota_modelBar{position:absolute;inset:0 auto 0 0;border-radius:4px;opacity:.16;pointer-events:none}
.ollamaQuota_modelLine,.ollamaQuota_modelMeta{position:relative}
/* 「其它」展开块：合计行是可点的说明（小三角 + 计数），展开后的模型行整体缩进。 */
.ollamaQuota_otherToggle{display:flex;align-items:center;gap:6px;padding:0;border:none;background:0 0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;cursor:pointer;text-align:left}
.ollamaQuota_otherToggle:hover{color:var(--dsw-alias-label-secondary)}
.ollamaQuota_otherChevron{display:inline-block;font-size:10px;transform:none;transition:transform .15s}
.ollamaQuota_otherChevron[data-open=true]{transform:rotate(90deg)}
.ollamaQuota_others{display:flex;flex-direction:column;gap:8px;margin-top:4px;padding:4px 0 0 10px;border-left:1px solid var(--dsw-alias-border-l1)}
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
			"card.loading": "正在获取额度…",
			"dock.openPanel": "在右侧窗口打开完整明细",
			"card.byModelSelected": "模型消费 · 已选 {days} 天 · 合计 {cost}",
			"card.clearSelection": "清除选择",
			"card.selectHint": "· 点击选中",
			"card.unattributed": "其它（Ollama 未细分）",
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
			"card.tier": "计费时段",
			"card.tier.peak": "峰时",
			"card.tier.offPeak": "谷时",
			"card.tierRule": "峰时＝工作日 12:00–18:00 UTC，其余为谷时；计费按 UTC 算",
			"card.nextTier": "{duration}后转{tier}",
			"card.currentModel": "当前模型",
			"card.priceThisTier": "目录价（{tier}）",
			"card.priceSameTier": "目录价（峰谷同价）",
			"card.priceOffPeakLabel": "谷时价",
			"card.hasOffPeak": "该模型有谷时价：谷时按上表价计",
			"card.noPrice": "价目表里没有这个模型，按用量计费",
			"card.pricingDegraded": "价目表暂不可用，只有实测口径的效率",
			"card.perMillion": "/1M tok",
			"card.byModelDaily": "模型消费 · 按日（近 30 天）",
			"card.otherModels": "（其它）",
			"card.cacheHitRate": "缓存命中 {pct}",
			"card.actualRate": "实测 ≈{price}/1M",
			"card.requestsShort": "{count} 次",
			"card.moreModels": "+{count} 个其它模型，合计 {cost}",
			"card.tokens": "本周期 Token",
			"card.input": "输入",
			"card.cached": "缓存命中",
			"card.output": "输出",
			"card.requests": "请求数",
			"card.actualTotal": "实测单价",
			"card.total": "合计",
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
			"common.days": "天",
			"common.hours": "小时",
			"common.minutes": "分钟"
		};
		const en = {
			"dock.title": "Ollama quota",
			"dock.aria": "Ollama plan quota, expand for details",
			"dock.failed": "quota unavailable",
			"card.loading": "Loading quota…",
			"dock.openPanel": "Open full details in the side panel",
			"card.byModelSelected": "Model spend · {days} selected · {cost}",
			"card.clearSelection": "Clear selection",
			"card.selectHint": "· click to select",
			"card.unattributed": "Other (unattributed)",
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
			"card.tier": "Billing tier",
			"card.tier.peak": "peak",
			"card.tier.offPeak": "off-peak",
			"card.tierRule": "Peak = 12:00–18:00 UTC on weekdays, off-peak otherwise; billed in UTC",
			"card.nextTier": "{tier} in {duration}",
			"card.currentModel": "Current model",
			"card.priceThisTier": "List price ({tier})",
			"card.priceSameTier": "List price (same all day)",
			"card.priceOffPeakLabel": "Off-peak rate",
			"card.hasOffPeak": "this model has a separate off-peak rate",
			"card.noPrice": "model not in the price book; billed by tokens",
			"card.pricingDegraded": "price book unavailable; measured rates only",
			"card.perMillion": "/1M tok",
			"card.byModelDaily": "Spend by model · daily (30d)",
			"card.otherModels": "(other)",
			"card.cacheHitRate": "cache hit {pct}",
			"card.actualRate": "measured ≈{price}/1M",
			"card.requestsShort": "{count} reqs",
			"card.moreModels": "+{count} more models, {cost} total",
			"card.tokens": "Tokens this period",
			"card.input": "Input",
			"card.cached": "Cached",
			"card.output": "Output",
			"card.requests": "Requests",
			"card.actualTotal": "Measured rate",
			"card.total": "Total",
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
			"common.days": "days",
			"common.hours": "hours",
			"common.minutes": "min"
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

		/**
		 * 每 1M token 的目录价：≥$0.01 两位小数，更小的价保留三位（0.006 不能丢精度）。
		 */
		function unitPrice(value) {
			if (typeof value !== "number" || !Number.isFinite(value)) return "—";
			return "$" + value.toFixed(value >= 0.01 ? 2 : 3);
		}

		/** 时长（毫秒）：「2.4 小时」/「45 分钟」。 */
		function duration(value, t) {
			if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "—";
			const minutes = Math.round(value / 60_000);
			if (minutes < 60) return Math.max(1, minutes) + " " + t("common.minutes");
			const hours = minutes / 60;
			return (hours >= 10 ? String(Math.round(hours)) : hours.toFixed(1)) + " " + t("common.hours");
		}

		/** 档位名；未知档位给 undefined（调用方决定怎么兜底）。 */
		function tierLabel(t, tier) {
			if (tier === "peak") return t("card.tier.peak");
			if (tier === "off-peak") return t("card.tier.offPeak");
			return undefined;
		}

		/**
		 * 价目表里找当前模型的条目。与 host 半 metrics.js 的 matchPriceModel 保持一致：
		 * 精确等值优先，其次「最长前缀 + 冒号」（`deepseek-v4.1-flash:1017` ↔
		 * `deepseek-v4.1-flash`），只认冒号边界，避免 `gpt-oss:20b` 撞上 `gpt-oss:120b`。
		 */
		function matchPriceModel(models, id) {
			if (models === undefined || models === null || typeof id !== "string" || id === "") return undefined;
			if (Object.prototype.hasOwnProperty.call(models, id)) return models[id];
			let best;
			for (const key of Object.keys(models)) {
				if (id.startsWith(key + ":")) best = best === undefined || key.length > best.length ? key : best;
			}
			return best === undefined ? undefined : models[best];
		}

		/** 按档位挑价格：声明了谷时价才在谷时切换，与 host 半的 priceForTier 保持一致。 */
		function priceForTier(entry, tier) {
			if (entry === undefined || entry === null) return undefined;
			const hasOffPeak = entry.offPeak !== undefined;
			const applied = hasOffPeak && tier === "off-peak" ? entry.offPeak : entry;
			return { input: applied.input, cached: applied.cached, output: applied.output, hasOffPeak };
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

		//#endregion

		//#region 组件
		/**
		 * 原生 dock 同款的 14px 线性图标（仪表盘 = 额度/用量）。
		 * 直接内联 SVG，避免为几个图标把 primitives 包加进客户端依赖。
		 */
		function GaugeGlyph() {
			return React.createElement(
				"svg",
				{
					width: 14,
					height: 14,
					viewBox: "0 0 16 16",
					fill: "none",
					xmlns: "http://www.w3.org/2000/svg",
					"aria-hidden": "true",
					strokeWidth: 1
				},
				React.createElement("path", {
					d: "M3.4041 13.096C2.49514 12.187 1.87614 11.0288 1.62537 9.76798C1.37459 8.50716 1.50331 7.20028 1.99525 6.01261C2.48719 4.82494 3.32025 3.80981 4.3891 3.09557C5.45795 2.38134 6.71458 2.00008 8.0001 2C9.28563 2.00008 10.5423 2.38134 11.6111 3.09557C12.68 3.80981 13.513 4.82494 14.005 6.01261C14.4969 7.20028 14.6256 8.50716 14.3748 9.76798C14.1241 11.0288 13.5051 12.187 12.5961 13.096",
					stroke: "currentColor"
				}),
				React.createElement("path", { d: "M8 8.49994L11.6114 4.88855", stroke: "currentColor" }),
				React.createElement("path", {
					d: "M8 9.75C8.69036 9.75 9.25 9.19036 9.25 8.5C9.25 7.80964 8.69036 7.25 8 7.25C7.30964 7.25 6.75 7.80964 6.75 8.5C6.75 9.19036 7.30964 9.75 8 9.75Z",
					fill: "currentColor"
				})
			);
		}

		/** 原生 dock 的折叠箭头：收起朝上、展开朝下（TodoPanel 同款）。 */
		function ChevronGlyph({ open }) {
			return React.createElement(
				"svg",
				{
					width: 14,
					height: 14,
					viewBox: "0 0 16 16",
					fill: "none",
					xmlns: "http://www.w3.org/2000/svg",
					"aria-hidden": "true",
					strokeWidth: 1
				},
				React.createElement("path", {
					d: open
						? "M4 6L7.29289 9.29289C7.68342 9.68342 8.31658 9.68342 8.70711 9.29289L12 6"
						: "M12 10L8.70711 6.70711C8.31658 6.31658 7.68342 6.31658 7.29289 6.70711L4 10",
					stroke: "currentColor"
				})
			);
		}

		/** 「在右侧窗口打开」的 14px 线性图标：右上角指向箭头 + 面板角（external-panel 同款语义）。 */
		function PanelGlyph() {
			return React.createElement(
				"svg",
				{
					width: 14,
					height: 14,
					viewBox: "0 0 16 16",
					fill: "none",
					xmlns: "http://www.w3.org/2000/svg",
					"aria-hidden": "true",
					strokeWidth: 1
				},
				React.createElement("path", { d: "M6 10L10.5 5.5", stroke: "currentColor" }),
				React.createElement("path", { d: "M6.5 5.5H10.5V9.5", stroke: "currentColor" }),
				React.createElement("path", { d: "M10.5 12.5V13M3 5.5V3.5M3 3.5H8M3 3.5V12.5H6.5", stroke: "currentColor" })
			);
		}

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

		/**
		 * 堆叠图的分类配色：取主题状态色（暗/亮色主题都经过校准），
		 * 超出前 6 名与 remainder 的量统一用骨架灰的「其它」。
		 */
		const SEGMENT_VARS = [
			"var(--dsw-alias-state-business-primary)",
			"var(--dsw-alias-state-warn-primary)",
			"var(--dsw-alias-state-success-primary)",
			"var(--dsw-alias-state-error-primary)",
			"var(--dsw-alias-state-business-tertiary)",
			"var(--dsw-alias-state-warn-tertiary)"
		];
		const OTHER_VAR = "var(--dsw-alias-bg-skeleton)";

		/** 模型序号 → 配色；越界（>5）与「其它」都用灰色。 */
		function segmentColor(index) {
			return index >= 0 && index < SEGMENT_VARS.length ? SEGMENT_VARS[index] : OTHER_VAR;
		}

		/**
		 * 一天的分段：按图例顺序（费用降序）堆叠各个模型，图例之外折进「其它」。
		 * 日桶没有 groups（旧 host 半 / 降级态）时退化为整条单色的旧样式。
		 */
		function segmentsOf(row, names) {
			if (!Number.isFinite(row.costUsd) || row.costUsd <= 0) {
				return [{ model: undefined, ratio: 100, color: OTHER_VAR }];
			}
			const groups = Array.isArray(row.groups) ? row.groups : undefined;
			if (groups === undefined || names.length === 0) {
				return [{ model: undefined, ratio: 100, color: SEGMENT_VARS[0] }];
			}
			const named = [];
			let other = 0;
			for (const group of groups) {
				const index = names.indexOf(group.model);
				if (index < 0) other += typeof group.costUsd === "number" ? group.costUsd : 0;
				else named.push([index, typeof group.costUsd === "number" ? group.costUsd : 0]);
			}
			const segments = named
				.sort((a, b) => a[0] - b[0])
				.map(([index, value]) => ({
					model: names[index],
					ratio: Math.round((value / row.costUsd) * 1000) / 10,
					color: segmentColor(index)
				}))
				.filter((segment) => segment.ratio > 0);
			if (other > 0) {
				segments.push({
					model: "other",
					ratio: Math.round((other / row.costUsd) * 1000) / 10,
					color: OTHER_VAR
				});
			}
			return segments;
		}

		/** 一天的悬浮提示：日期 · 合计，后面跟每个模型一截。 */
		function chartTitle(t, row, names) {
			const lines = [shortDate(row.from) + " · " + money(row.costUsd)];
			const groups = Array.isArray(row.groups) ? row.groups : [];
			for (const group of groups) {
				if ((group.costUsd || 0) <= 0) continue;
				const suffix = names.length > 0 && !names.includes(group.model) ? t("card.otherModels") : "";
				lines.push(group.model + " " + money(group.costUsd) + suffix);
			}
			return lines.join(" · ");
		}

		/**
		 * 把若干日桶的按模型分组聚合到一起：同名模型合并 token / 请求 / 费用，
		 * 费用降序，效率指标按聚合后的总量重算（沿用 metrics.js 里 efficiencyOf 的口径）。
		 * 选中「某几天」时图例与「其它」列表都从这里聚合，不依赖 host 半新算。
		 * @param {Array<object>} rows 日桶（带 groups）。
		 * @returns {Array<object>} 聚合后的模型行，费用降序。
		 */
		function aggregateGroups(rows) {
			const byModel = new Map();
			for (const row of Array.isArray(rows) ? rows : []) {
				if (row === null || typeof row !== "object" || !Array.isArray(row.groups)) continue;
				for (const group of row.groups) {
					if (group === null || typeof group !== "object" || typeof group.model !== "string" || group.model === "") continue;
					const found = byModel.get(group.model) ?? {
						model: group.model,
						requests: 0,
						costUsd: 0,
						inputTokens: 0,
						cachedInputTokens: 0,
						outputTokens: 0,
					};
					found.requests += typeof group.requests === "number" ? group.requests : 0;
					found.costUsd += typeof group.costUsd === "number" ? group.costUsd : 0;
					found.inputTokens += typeof group.inputTokens === "number" ? group.inputTokens : 0;
					found.cachedInputTokens += typeof group.cachedInputTokens === "number" ? group.cachedInputTokens : 0;
					found.outputTokens += typeof group.outputTokens === "number" ? group.outputTokens : 0;
					byModel.set(group.model, found);
				}
			}
			return [...byModel.values()]
				.map((row) => {
					row.totalTokens = row.inputTokens + row.outputTokens;
					row.cacheHitRate = row.inputTokens > 0 ? row.cachedInputTokens / row.inputTokens : undefined;
					row.actualUsdPer1M = row.totalTokens > 0 ? (row.costUsd / row.totalTokens) * 1e6 : undefined;
					return row;
				})
				.sort((a, b) => (b.costUsd || 0) - (a.costUsd || 0));
		}

		/**
		 * 「其它」的展开块：默认只显示合计的一行说明，点击展开第 7–10 名
		 * （选中天数时是聚合后的 6 名之外）的完整模型行，末尾补一行
		 * 「上游未细分」的 remainder 合计（它没有按名分桶，只能给总额）。
		 * @param {{t: Function, rows: Array, unattributedCostUsd?: number, costUsd: number, expanded: boolean, onToggle: Function}} props。
		 * @returns {object} React 元素。
		 */
		function OtherModels({ t, rows, unattributedCostUsd, expanded, onToggle }) {
			const listRows = Array.isArray(rows) ? rows : [];
			const count = listRows.length + (unattributedCostUsd !== undefined && unattributedCostUsd > 0.00005 ? 1 : 0);
			if (count === 0) return null;
			const cost = listRows.reduce((acc, row) => acc + (typeof row.costUsd === "number" ? row.costUsd : 0), 0) + (unattributedCostUsd ?? 0);
			return [
				React.createElement(
					"button",
					{ type: "button", key: "toggle", className: "ollamaQuota_otherToggle", "aria-expanded": expanded ? "true" : "false", onClick: onToggle },
					React.createElement("span", { className: "ollamaQuota_otherChevron", "data-open": expanded ? "true" : "false", "aria-hidden": "true" }, "▸"),
					t("card.moreModels", { count, cost: money(cost) })
				),
				expanded
					? React.createElement(
							"div",
							{ key: "list", className: "ollamaQuota_others" },
							listRows.map((row) =>
								React.createElement(ModelRow, { t, row, key: row.model, colorIndex: SegmentSlots.OTHER, totalCostUsd: undefined })
							),
							unattributedCostUsd !== undefined && unattributedCostUsd > 0.00005
								? React.createElement(
										"div",
										{ className: "ollamaQuota_model", key: "unattributed" },
										React.createElement(
											"div",
											{ className: "ollamaQuota_modelLine" },
											React.createElement(
												"span",
												{ className: "ollamaQuota_modelLead" },
												React.createElement("span", { className: "ollamaQuota_legendChip", "data-other": "" }),
												React.createElement("span", { className: "ollamaQuota_modelName" }, t("card.unattributed"))
											),
											React.createElement("span", { className: "ollamaQuota_modelCost" }, money(unattributedCostUsd))
										)
									)
								: null
						)
					: null
			];
		}

		/** ModelRow 的 colorIndex 约定：-1 = 图例之外（灰色 chip / 灰背景条，与「其它」分段同色）。 */
		const SegmentSlots = { OTHER: -1 };

		/**
		 * 消费图：一天一个「日单元格」（柱子在上、日期标签在下，同一格对齐），
		 * 柱内按模型分段堆叠（与图例同色序）。天数少时整组居中、不拉满全宽，
		 * 日期标签跟着柱子走（修掉「轴在两端、柱在中间」的错位）；
		 * 天数多时只在首尾（和每第 7 天）放标签，避免拥挤。
		 * 柱子可点选（选中后的图例/占比条/其它只统计选中的天）；
		 * 高度像素直算（chartPx 由容器给：条内 38、右窗 56），不依赖容器高度。
		 * @param {{t: Function, rows: Array, byModel: Array<object>, selected?: Set<string>, onSelectDay?: Function, chartPx?: number}} props。
		 * @returns {object} React 元素。
		 */
		function SpendChart({ t, rows, byModel, selected, onSelectDay, chartPx }) {
			const height = typeof chartPx === "number" && chartPx > 0 ? chartPx : 38;
			const names = (Array.isArray(byModel) ? byModel : []).map((row) => row.model);
			const max = rows.reduce((acc, row) => Math.max(acc, typeof row.costUsd === "number" ? row.costUsd : 0), 0);
			const selecting = selected instanceof Set && selected.size > 0;
			return React.createElement(
				"div",
				{ className: "ollamaQuota_chart", "data-selecting": selecting ? "true" : undefined },
				rows.map((row, index) => {
					const barPx = max > 0 ? Math.max(2, Math.round(((row.costUsd || 0) / max) * height)) : 2;
					const isChosen = selecting && selected.has(String(row.from));
					// 标签规则：首尾必显示；柱子少（≤12）逐天显示；柱子多则每第 7 天补一个刻度。
					const label =
						rows.length <= 12 || index === 0 || index === rows.length - 1 || index % 7 === 0
							? shortDate(row.from)
							: "";
					return React.createElement(
						"div",
						{ className: "ollamaQuota_chartCell", key: String(row.from) + String(index) },
						React.createElement(
							"button",
							{
								type: "button",
								className: "ollamaQuota_chartBar",
								title: chartTitle(t, row, names) + (onSelectDay && !selecting ? " · " + t("card.selectHint") : ""),
								"data-selected": isChosen ? "true" : selecting ? "false" : undefined,
								"aria-pressed": isChosen ? "true" : "false",
								style: { height: barPx + "px" },
								onClick: onSelectDay ? () => onSelectDay(String(row.from)) : undefined
							},
							segmentsOf(row, names).map((segment, segmentIndex) =>
								React.createElement("div", {
									key: (segment.model ?? "") + String(segmentIndex),
									className: "ollamaQuota_chartSeg",
									style: { height: segment.ratio + "%", background: segment.color }
								})
							)
						),
						React.createElement("span", { className: "ollamaQuota_chartLabel" }, label)
					);
				})
			);
		}

		/**
		 * 图例一行：整行背后铺一条**半透明模型色背景条**（宽度 = 该模型费用占比，
		 * 与图表分段同色；零成本的行不铺），文字浮在条上——占比可视化直接长在行里。
		 * 左侧色块 + 模型名（可能省略号截断），右侧「占比 · 金额」；
		 * 下一行是效率指标（token、缓存命中率、实测单价、次数），窄屏允许换行。
		 * colorIndex 对应堆叠图的分段颜色；-1 = 图例之外的灰条。
		 */
		function ModelRow({ t, row, colorIndex, totalCostUsd }) {
			const hasSegment = typeof colorIndex === "number" && colorIndex < SEGMENT_VARS.length;
			const barColor = hasSegment ? segmentColor(colorIndex) : OTHER_VAR;
			const meta = [compactTokens(row.totalTokens) + " tok"];
			if (typeof row.cacheHitRate === "number") meta.push(t("card.cacheHitRate", { pct: percent(row.cacheHitRate) }));
			if (typeof row.actualUsdPer1M === "number") meta.push(t("card.actualRate", { price: unitPrice(row.actualUsdPer1M) }));
			meta.push(t("card.requestsShort", { count: row.requests ?? 0 }));
			// 占比＝该模型费用 ÷ 作用域总费用（图例与占比条同源）；
			// 背景条只在有正费用时画，宽度是行宽的百分比。
			const shareRatio =
				typeof totalCostUsd === "number" && totalCostUsd > 0 && typeof row.costUsd === "number" && row.costUsd > 0
					? Math.min(1, row.costUsd / totalCostUsd)
					: undefined;
			return React.createElement(
				"div",
				{ className: "ollamaQuota_model", key: row.model },
				shareRatio !== undefined
					? React.createElement("span", {
							className: "ollamaQuota_modelBar",
							"aria-hidden": "true",
							style: { width: percent(shareRatio), background: barColor }
						})
					: null,
				React.createElement(
					"div",
					{ className: "ollamaQuota_modelLine" },
					React.createElement(
						"span",
						{ className: "ollamaQuota_modelLead" },
						React.createElement("span", { className: "ollamaQuota_legendChip", style: hasSegment ? { background: barColor } : undefined }),
						React.createElement("span", { className: "ollamaQuota_modelName" }, row.model)
					),
					React.createElement("span", { className: "ollamaQuota_modelCost" }, (shareRatio !== undefined ? percent(shareRatio) + " · " : "") + money(row.costUsd))
				),
				React.createElement("div", { className: "ollamaQuota_modelMeta" }, meta.join(" · "))
			);
		}

		/**
		 * 展开后的明细区：进度条（已用 vs 时间进度）、关键数字（含计费时段与当前模型）、
		 * 按模型用量/效率、token、日消费、预测。
		 * @param {{t: Function, payload: object, currentModel?: string}} props 文案函数、载荷与会话当前模型 id。
		 * @returns {object} React 元素。
		 */
		function QuotaDetail({ t, payload, currentModel, chartPx }) {
			const pace = payload.pace || { verdict: "unknown" };
			const period = payload.period || {};
			const tokens = payload.tokens || {};
			const peak = payload.peak || {};
			const rows = Array.isArray(payload.daily) ? payload.daily.slice(-30) : [];
			const byModel = Array.isArray(payload.byModel) ? payload.byModel : [];
			const more = payload.byModelMore;
			const verdict = pace.verdict || "unknown";
			const usedPct = typeof payload.usedPct === "number" ? payload.usedPct : 0;
			const elapsedPct = typeof period.elapsedPct === "number" ? period.elapsedPct : undefined;

			// 交互态：选中的日桶（键 = 桶起点 ISO 串）与「其它」列表展开。
			const [selection, setSelected] = React.useState(() => new Set());
			const [showOthers, setShowOthers] = React.useState(false);
			const onToggleDay = (key) =>
				setSelected((previous) => {
					const next = new Set(previous);
					if (next.has(key)) next.delete(key);
					else next.add(key);
					return next;
				});
			const onClearSelection = () => {
				setSelected((previous) => (previous.size === 0 ? previous : new Set()));
				setShowOthers(false);
			};
			const selectedDays = selection;
			const names = byModel.map((row) => row.model);

			// 图例作用域：默认显示整期（host 半算好的 byModel/byModelOther）；
			// 选中若干天后改成从这些日桶自带的 groups 现场聚合，效率指标重算。
			const selectedRows = selectedDays.size > 0 ? rows.filter((row) => selectedDays.has(String(row.from))) : [];
			let scope;
			if (selectedRows.length > 0) {
				const aggregated = aggregateGroups(selectedRows);
				const legend = aggregated.slice(0, 6);
				const otherRows = aggregated.slice(6);
				const totalCostUsd = selectedRows.reduce((acc, row) => acc + (typeof row.costUsd === "number" ? row.costUsd : 0), 0);
				const namedCostUsd =
					legend.concat(otherRows).reduce((acc, row) => acc + (typeof row.costUsd === "number" ? row.costUsd : 0), 0);
				scope = {
					legend,
					other: otherRows,
					totalCostUsd,
					// 上游每日只按名给 top 分组；差值是未细分的 remainder（浮点噪声按零处理）。
					unattributedCostUsd: Math.max(0, Math.round((totalCostUsd - namedCostUsd) * 1e6) / 1e6)
				};
			} else {
				const otherRows = Array.isArray(payload.byModelOther) ? payload.byModelOther : [];
				const otherNamedCostUsd = otherRows.reduce((acc, row) => acc + (typeof row.costUsd === "number" ? row.costUsd : 0), 0);
				const moreCostUsd = typeof more === "object" && more !== null && typeof more.costUsd === "number" ? more.costUsd : undefined;
				const unattributedCostUsd = moreCostUsd === undefined ? undefined : Math.max(0, Math.round((moreCostUsd - otherNamedCostUsd) * 1e6) / 1e6);
				const legendCostUsd = byModel.reduce((acc, row) => acc + (typeof row.costUsd === "number" ? row.costUsd : 0), 0);
				scope = {
					legend: byModel,
					other: otherRows,
					unattributedCostUsd,
					// 作用域合计 = 前 6 名 + 具名其它 + 未细分 remainder，占比条与图例 share 同源。
					totalCostUsd: legendCostUsd + (moreCostUsd ?? otherNamedCostUsd)
				};
			}

			// 计费时段：档位名 + 距下一次切换的倒计时。
			const tier = tierLabel(t, peak.tier);
			const tierValue =
				tier === undefined
					? "—"
					: tier + (typeof peak.nextChangeInMs === "number"
							? " · " + t("card.nextTier", {
									duration: duration(peak.nextChangeInMs, t),
									tier: tierLabel(t, peak.tier === "peak" ? "off-peak" : "peak")
								})
							: "");

			// 当前模型的目录价：价表在浏览器本地按模型 id 匹配、按档位取价。
			// 档位未知（旧 host 半的载荷没有 peak）时按峰价兜底，不猜谷价。
			const priceBook = payload.pricing && payload.pricing.models;
			const priceTier = peak.tier === "off-peak" ? "off-peak" : "peak";
			const priceEntry = currentModel === undefined ? undefined : matchPriceModel(priceBook, currentModel);
			const applied = priceEntry === undefined ? undefined : priceForTier(priceEntry, priceTier);

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
					React.createElement(Cell, { label: t("card.purchased"), value: money(payload.purchasedRemainingUsd) }),
					React.createElement(Cell, { label: t("card.tier"), value: tierValue, strong: tier !== undefined }),
					React.createElement(Cell, {
						label: t("card.currentModel"),
						value: currentModel ?? "—"
					})
				),
				tier !== undefined ? React.createElement("div", { className: "ollamaQuota_note" }, t("card.tierRule")) : null,
				// 当前模型的目录价（按当前档位取价；峰谷同价的模型只有一个价）。
				currentModel !== undefined
					? React.createElement(
							"div",
							null,
							React.createElement(
								"div",
								{ className: "ollamaQuota_section" },
								applied === undefined
									? t("card.currentModel")
									: tier !== undefined && applied.hasOffPeak
										? t("card.priceThisTier", { tier })
										: t("card.priceSameTier")
							),
							applied === undefined
								? React.createElement(
										"div",
										{ className: "ollamaQuota_note" },
										payload.pricing === undefined ? t("card.pricingDegraded") : t("card.noPrice")
									)
								: React.createElement(
										"div",
										{ className: "ollamaQuota_grid" },
										React.createElement(Cell, { label: t("card.input"), value: unitPrice(applied.input) + " " + t("card.perMillion") }),
										React.createElement(Cell, { label: t("card.cached"), value: unitPrice(applied.cached) + " " + t("card.perMillion") }),
										React.createElement(Cell, { label: t("card.output"), value: unitPrice(applied.output) + " " + t("card.perMillion"), strong: true }),
										React.createElement(Cell, {
											label: t("card.priceOffPeakLabel"),
											value: applied.hasOffPeak ? "✓" : "—"
										})
									)
						)
					: null,
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
					React.createElement(Cell, { label: t("card.requests"), value: String(tokens.requests ?? 0) }),
					// 平衡偶数行，也把「本期到底多贵」落在总数上：实测费用 ÷ 实测 token。
					typeof tokens.costUsd === "number" && typeof tokens.totalTokens === "number" && tokens.totalTokens > 0
						? React.createElement(Cell, {
								label: t("card.actualTotal"),
								value: unitPrice((tokens.costUsd / tokens.totalTokens) * 1e6) + " " + t("card.perMillion")
							})
						: null
				),
				// 模型消费 · 按日：一根柱 = 一天，柱内按图例顺序堆叠各模型的成本；
				// 柱子可点选：选中若干天后，下面的图例/其它列表只按选中天聚合；
				// 占比可视化 = 每行模型背后的半透明色条（宽度 = 占比），不再要独立占比条。
				byModel.length > 0 || rows.length > 0
					? React.createElement(
							"div",
							{ className: "ollamaQuota_models" },
							React.createElement(
								"div",
								{ className: "ollamaQuota_sectionRow" },
								React.createElement(
									"div",
									{ className: "ollamaQuota_section" },
									selectedDays.size > 0
										? t("card.byModelSelected", { days: selectedDays.size, cost: money(scope.totalCostUsd) })
										: t("card.byModelDaily")
								),
								selectedDays.size > 0
									? React.createElement("button", { type: "button", className: "ollamaQuota_clear", onClick: () => onClearSelection() }, t("card.clearSelection"))
									: null
							),
							React.createElement(SpendChart, { t, rows, byModel, selected: selection, onSelectDay: onToggleDay, chartPx }),
							scope.legend.map((row, index) =>
								React.createElement(ModelRow, {
									t,
									row,
									key: row.model,
									colorIndex: names.indexOf(row.model),
									totalCostUsd: scope.totalCostUsd
								})
							),
							React.createElement(OtherModels, {
								t,
								rows: scope.other,
								unattributedCostUsd: scope.unattributedCostUsd,
								expanded: showOthers,
								onToggle: () => setShowOthers(!showOthers)
							})
						)
					: null,
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
				React.createElement(QuotaFoot, { t, fetchedAt: payload.fetchedAt })
			);
		}

		/** 明细结尾：更新时间 + 手动刷新，dock 内展开和右窗页签共用。 */
		function QuotaFoot({ t, fetchedAt }) {
			return React.createElement(
				"div",
				{ className: "ollamaQuota_foot" },
				React.createElement("span", null, t("card.updated", { time: clockTime(fetchedAt) })),
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
			);
		}

		/**
		 * 右侧窗口（sidebar-right 页签）里的完整明细：复用 QuotaDetail 的全部内容，
		 * 只是容器换成占满页签体的宽幅滚动区（CSS 由 .ollamaQuota_tab 接管）。
		 * @param {{t: Function, directory?: object}} props 注入的文案与模型目录。
		 * @returns {object} React 元素。
		 */
		function QuotaTab({ t, directory }) {
			const snapshot = React.useSyncExternalStore(subscribe, store.get, store.get);
			const modelStore = directory === undefined ? undefined : directory.store ?? directory;
			const modelState = React.useSyncExternalStore(
				React.useCallback((listener) => (modelStore === undefined ? () => {} : modelStore.subscribe(listener)), [modelStore]),
				React.useCallback(() => (modelStore === undefined ? undefined : modelStore.getSnapshot()), [modelStore]),
				React.useCallback(() => (modelStore === undefined ? undefined : modelStore.getSnapshot()), [modelStore])
			);
			const currentModel = modelState && modelState.current ? modelState.current.model : undefined;
			const payload = snapshot.payload;
			const ready = payload !== undefined && payload.ok === true;
			let body;
			if (snapshot.status === "idle") {
				body = React.createElement("div", { className: "ollamaQuota_error" }, t("card.loading"));
			} else if (!ready) {
				body = React.createElement(
					"div",
					{ className: "ollamaQuota_error" },
					snapshot.error ? errorLabel(t, snapshot.error) : t("dock.failed")
				);
			} else {
				body = React.createElement(QuotaDetail, { t, payload, currentModel, chartPx: 56 });
			}
			return React.createElement(
				"div",
				{ className: "ollamaQuota_tab", "data-ollama-quota-tab": true },
				body
			);
		}

		/**
		 * dock 条：常驻输入框上方的一行摘要，点标题在条内展开明细。
		 * 结构与原生 TodoDock 一致：root > body > header(+detail)。
		 * @param {{t: Function}} props 注入的文案函数。
		 * @returns {object} React 元素。
		 */
		function QuotaDock({ t, directory, openDetail }) {
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
			const currentModel = modelState && modelState.current ? modelState.current.model : undefined;
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
					money(payload.remainingUsd),
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
						"div",
						{ className: "ollamaQuota_header" },
						// 主按钮：条内折叠展开（保持原行为）。
						React.createElement(
							"button",
							{
								type: "button",
								className: "ollamaQuota_headerMain",
								"aria-label": t("dock.aria"),
								"aria-expanded": expanded ? "true" : "false",
								onClick: () => store.patch({ expanded: !expanded })
							},
							React.createElement(
								"span",
								{ className: "ollamaQuota_lead", "aria-hidden": "true" },
								React.createElement(GaugeGlyph)
							),
							React.createElement("span", { className: "ollamaQuota_title" }, t("dock.title")),
							summary,
							React.createElement(
								"span",
								{
									className: "ollamaQuota_chevron",
									"data-open": expanded ? "true" : "false",
									"aria-hidden": "true"
								},
								React.createElement(ChevronGlyph, { open: expanded })
							)
						),
						// 右窗按钮：把完整明细开进 sidebar-right 页签；服务缺失或打开失败则退回条内展开。
						openDetail
							? React.createElement(
									"button",
									{
										type: "button",
										className: "ollamaQuota_headerOpen",
										title: t("dock.openPanel"),
										"aria-label": t("dock.openPanel"),
										onClick: (event) => {
											event.stopPropagation();
											if (!openDetail()) store.patch({ expanded: true });
										}
									},
									React.createElement(PanelGlyph)
								)
							: null
					),
					expanded && ready ? React.createElement(QuotaDetail, { t, payload, currentModel }) : null
				)
			);
		}
		//#endregion

		//#region 插件体
		/** 依赖的客户端服务。 */
		const inject = ["slots", "locale"];

		/** sidebar-right 页签的 kind（右窗里「Ollama 额度」一页）与实现 id（pane.tab 槽位的键）。 */
		const QUOTA_TAB_KIND = "ollama-quota";
		const QUOTA_TAB_ID = "dsh-ollama-quota";

		/** 模型目录注入：dock 与右窗页签共用，服务缺失时返回空目录。 */
		function directoryInject(ctx, sessionId) {
			const directories = ctx.get("modelDirectories");
			if (directories === undefined) return { directory: undefined };
			try {
				return { directory: directories.directoryFor(sessionId) };
			} catch {
				return { directory: undefined };
			}
		}

		/**
		 * 客户端插件体：注册文案、dock 条、右侧窗口页签，并启动轮询。
		 * sidebar-right 缺席（其它 DSH 发行形态）时静默降级：只保留条内展开。
		 * @param {object} ctx 客户端根上下文。
		 */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "ollama-quota: dictionaries");

			/**
			 * 打开右窗里的「Ollama 额度」页签。页是幂等的：再次调用只会聚焦已有页签。
			 * @returns {boolean} 服务存在且调用成功；false = 调用方应退回条内展开。
			 */
			const openQuotaPanel = () => {
				const sidebarRight = ctx.get("sidebarRight");
				if (sidebarRight === undefined) return false;
				try {
					sidebarRight.openTab(QUOTA_TAB_KIND);
					return true;
				} catch {
					return false;
				}
			};

			// order 10：排在原生任务条（0）之后、队列条（20）之前。
			ctx.slots.inject("conversation.input.dock", () =>
				ctx.slots.register(
					{
						name: "conversation.input.dock",
						id: "ollama-quota",
						order: 10,
						locale: NS,
						/**
						 * 把会话的模型选择服务交给 dock（判断供应商），把右窗打开器交给 dock（新按钮）。
						 * @param {string} sessionId 会话 id。
						 * @returns {{directory?: object, openDetail: Function}} 注入的 props。
						 */
						inject: (sessionId) => ({
							...directoryInject(ctx, sessionId),
							openDetail: openQuotaPanel
						})
					},
					QuotaDock
				)
			);

			// 右窗页签：两个服务都注册了才挂（缺 ui-sidebar-right 的 profile 只有 dock 条）。
			const sidebarRightTabs = ctx.get("sidebarRightTabs");
			if (ctx.get("sidebarRight") !== undefined && sidebarRightTabs !== undefined) {
				/** apply 作用域里的文案函数，给页签类型定义的 title / guide 用。 */
				const t = ctx.locale.bind(NS);
				ctx.effect(
					() =>
						sidebarRightTabs.register({
							id: QUOTA_TAB_ID,
							kind: QUOTA_TAB_KIND,
							priority: "extension",
							title: () => t("dock.title"),
							guide: [
								{
									id: "quota-detail",
									order: 95,
									title: () => t("dock.title"),
									description: () => t("panel.guideDescription")
								}
							]
						}),
					"ollama-quota: rightbar tab type"
				);
				ctx.slots.inject("sidebar.right.pane.tab", () =>
					ctx.slots.register(
						{
							name: "sidebar.right.pane.tab",
							key: QUOTA_TAB_ID,
							locale: NS,
							/**
							 * 页签体同样需要会话的模型目录来标注「当前模型」。
							 * @param {string} sessionId 会话 id。
							 * @returns {{directory?: object}} 注入的 props。
							 */
							inject: (sessionId) => directoryInject(ctx, sessionId)
						},
						QuotaTab
					)
				);
			}

			document.addEventListener("visibilitychange", onVisibility);
			ctx.effect(() => () => {
				document.removeEventListener("visibilitychange", onVisibility);
				clearTimeout(timer);
			});
		}

		exports.QuotaDetail = QuotaDetail;
		exports.QuotaDock = QuotaDock;
		exports.QuotaTab = QuotaTab;
		exports.OtherModels = OtherModels;
		exports.aggregateGroups = aggregateGroups;
		exports.apply = apply;
		exports.inject = inject;
		exports.refresh = refresh;
		exports.store = store;
		return module.exports;
	}
});
