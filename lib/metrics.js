/**
 * Ollama 额度指标的纯计算层。
 *
 * 这一层只做算术：输入是 `/api/balance` 与 `/api/usage` 的原始响应，输出是
 * 面板要展示的全部派生数字。放在这里而不是浏览器半，是因为它是唯一值得
 * 单测的部分——UI 只是渲染结果。
 *
 * 余额口径以 `/api/balance` 为唯一真相。`/api/usage` 的 `usage_usd` 与
 * 真实扣减存在已知偏差（该 meter 有滞后），因此它只用于 token 数与趋势，
 * 绝不参与「剩余额度」的计算。
 *
 * @module dsh-ollama-quota/metrics
 */

/** 一天的毫秒数。 */
const MS_PER_DAY = 86_400_000;

/**
 * 把一个可能是 undefined/null/NaN 的值收敛成有限数字。
 * @param {unknown} value 原始值。
 * @returns {number} 有限数字，否则 0。
 */
function num(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * 解析 ISO 时间戳为毫秒；无法解析时返回 undefined。
 * @param {unknown} value ISO 8601 字符串。
 * @returns {number | undefined} 毫秒时间戳。
 */
function parseIso(value) {
  if (typeof value !== 'string' || value === '') return undefined;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
}

/** 一个 token/费用桶的空态。 */
function emptyBucket() {
  return {
    requests: 0,
    costUsd: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
  };
}

/**
 * 把 usage 的 `buckets` 归一化成面板用的日/小时桶，并按起始时间过滤。
 *
 * 过滤规则是「桶的结束时间晚于下界」：跨下界的那个桶会被整桶计入，宁可
 * 略微高估本周期用量，也不静默丢掉边界内的真实消耗。
 *
 * @param {unknown} buckets `/api/usage` 的 buckets 数组。
 * @param {string | undefined} sinceIso 下界（账单周期起点）。
 * @returns {Array<object>} 归一化后的桶，按开始时间升序。
 */
export function normalizeBuckets(buckets, sinceIso) {
  if (!Array.isArray(buckets)) return [];
  const since = parseIso(sinceIso);
  const rows = [];
  for (const raw of buckets) {
    if (raw === null || typeof raw !== 'object') continue;
    const from = parseIso(raw.from);
    const until = parseIso(raw.until);
    if (from === undefined || until === undefined) continue;
    if (since !== undefined && until <= since) continue;
    // `group_by=model` 时每个日桶自带 top 分组；归一化后留给明细页的堆叠图。
    const groups = Array.isArray(raw.groups)
      ? raw.groups
          .filter((group) => group !== null && typeof group === 'object' && typeof group.model === 'string' && group.model !== '')
          .map((group) => ({
            model: group.model,
            requests: num(group.request_count),
            costUsd: num(group.usage_usd),
            inputTokens: num(group.input_tokens),
            cachedInputTokens: num(group.cached_input_tokens),
            outputTokens: num(group.output_tokens),
          }))
      : undefined;
    rows.push({
      from: raw.from,
      until: raw.until,
      fromMs: from,
      untilMs: until,
      partial: raw.partial === true,
      requests: num(raw.request_count),
      costUsd: num(raw.usage_usd),
      inputTokens: num(raw.input_tokens),
      cachedInputTokens: num(raw.cached_input_tokens),
      outputTokens: num(raw.output_tokens),
      groups,
    });
  }
  rows.sort((a, b) => a.fromMs - b.fromMs);
  return rows;
}

/**
 * 累加一组桶。
 * @param {Array<object>} rows {@link normalizeBuckets} 的输出。
 * @returns {object} 合计值。
 */
export function sumBuckets(rows) {
  const total = emptyBucket();
  for (const row of rows) {
    total.requests += row.requests;
    total.costUsd += row.costUsd;
    total.inputTokens += row.inputTokens;
    total.cachedInputTokens += row.cachedInputTokens;
    total.outputTokens += row.outputTokens;
  }
  total.totalTokens = total.inputTokens + total.outputTokens;
  return total;
}

//#region 峰谷时段

/** 峰时窗口的定义来自 ollama.com/pricing：工作日的 12:00–18:00 UTC，其余时间都是谷时。 */
export const PEAK_WINDOW = { startHour: 12, endHour: 18, rule: 'weekdays 12:00–18:00 UTC (off-peak otherwise)' };

/** 一个 UTC 时刻是不是工作日。 */
function isWeekday(date) {
  const day = date.getUTCDay();
  return day >= 1 && day <= 5;
}

/**
 * 判定一个时刻处于峰时还是谷时，并算出下一次档位切换。
 *
 * 计费口径是 UTC，与部署机的时区无关，所以判定只在 UTC 上做。谷时的范围包括
 * 工作日早晚与整个周末，因此「下一次切换」可能跨多天（周五晚上 → 周一 12:00）。
 *
 * @param {number} now 毫秒时间戳。
 * @returns {{tier: 'peak'|'off-peak'|'unknown', nextChangeAt: string|undefined, nextChangeInMs: number|undefined}} 档位与下次切换。
 */
export function peakTierAt(now) {
  if (typeof now !== 'number' || !Number.isFinite(now)) {
    return { tier: 'unknown', nextChangeAt: undefined, nextChangeInMs: undefined };
  }
  const time = new Date(now);
  const hours = time.getUTCHours();
  const peak = isWeekday(time) && hours >= PEAK_WINDOW.startHour && hours < PEAK_WINDOW.endHour;

  const dayStart = Date.UTC(time.getUTCFullYear(), time.getUTCMonth(), time.getUTCDate());
  const atHour = (base, hour) => base + hour * 3_600_000;
  let next;
  if (peak) {
    // 峰时 → 当天 18:00 转谷。
    next = atHour(dayStart, PEAK_WINDOW.endHour);
  } else if (isWeekday(time) && hours < PEAK_WINDOW.startHour) {
    // 工作日一早 → 当天 12:00 转峰。
    next = atHour(dayStart, PEAK_WINDOW.startHour);
  } else {
    // 其余谷时 → 下一个工作日的 12:00（周末整天都没有峰时）。
    let cursor = dayStart + MS_PER_DAY;
    while (!isWeekday(new Date(cursor))) cursor += MS_PER_DAY;
    next = atHour(cursor, PEAK_WINDOW.startHour);
  }
  return {
    tier: peak ? 'peak' : 'off-peak',
    nextChangeAt: new Date(next).toISOString(),
    nextChangeInMs: next - now,
  };
}

//#endregion

//#region 按模型

/**
 * 把 usage `totals.groups` 归一化成按模型行，并按费用降序（上游已排序，仅做防御）。
 * @param {unknown} groups `/api/usage?group_by=model` 的 groups。
 * @returns {Array<object>} 每模型的 requests/cost/tokens。
 */
export function normalizeGroups(groups) {
  if (!Array.isArray(groups)) return [];
  const rows = [];
  const seen = new Set();
  for (const raw of groups) {
    if (raw === null || typeof raw !== 'object') continue;
    const model = typeof raw.model === 'string' && raw.model !== '' ? raw.model : undefined;
    if (model === undefined || seen.has(model)) continue;
    seen.add(model);
    rows.push({
      model,
      requests: num(raw.request_count),
      costUsd: num(raw.usage_usd),
      inputTokens: num(raw.input_tokens),
      cachedInputTokens: num(raw.cached_input_tokens),
      outputTokens: num(raw.output_tokens),
    });
  }
  rows.sort((a, b) => b.costUsd - a.costUsd);
  return rows;
}

/**
 * 一段用量的「效率」派生量：缓存命中率、实际每百万 token 成本、单请求成本等。
 * @param {object} row requests/costUsd/input/cached/output。
 * @returns {object} 效率指标（输入不足以计算的字段为 undefined）。
 */
export function efficiencyOf(row) {
  const totalTokens = row.inputTokens + row.outputTokens;
  return {
    totalTokens,
    cacheHitRate: row.inputTokens > 0 ? row.cachedInputTokens / row.inputTokens : undefined,
    actualUsdPer1M: totalTokens > 0 ? (row.costUsd / totalTokens) * 1e6 : undefined,
    costPerRequest: row.requests > 0 ? row.costUsd / row.requests : undefined,
    avgOutputPerRequest: row.requests > 0 ? row.outputTokens / row.requests : undefined,
  };
}

/**
 * 价目表里找模型的条目。
 *
 * usage 分组名与会话模型 id 都可能带变体 tag（`deepseek-v4.1-flash:1017`），也可能
 * 本身就是含冒号的完整型号（`gpt-oss:120b`）。规则：先精确等值，再取「最长前缀
 * + 冒号」的匹配；两个方向都只接受冒号边界，避免 `gpt-oss:20b` 撞上 `gpt-oss:120b`。
 *
 * @param {Record<string, object> | undefined} models 价目表的 models 映射。
 * @param {string | undefined} id 模型 id。
 * @returns {object | undefined} 价目条目。
 */
export function matchPriceModel(models, id) {
  if (models === undefined || models === null || typeof id !== 'string' || id === '') return undefined;
  if (Object.prototype.hasOwnProperty.call(models, id)) return models[id];
  let best;
  for (const [key, value] of Object.entries(models)) {
    if (id.startsWith(`${key}:`)) {
      best = best === undefined || key.length > best[0].length ? [key, value] : best;
    }
  }
  return best === undefined ? undefined : best[1];
}

/**
 * 按当前档位挑价格：模型声明了谷时价才在谷时切到 offPeak，否则峰谷同价。
 * @param {object} entry 价目条目 { input, cached, output, offPeak? }。
 * @param {string} tier {@link peakTierAt} 的 tier。
 * @returns {object|undefined} { input, cached, output, tier, hasOffPeak }。
 */
export function priceForTier(entry, tier) {
  if (entry === undefined || entry === null) return undefined;
  const hasOffPeak = entry.offPeak !== undefined;
  const applied = hasOffPeak && tier === 'off-peak' ? entry.offPeak : entry;
  return {
    input: applied.input,
    cached: applied.cached,
    output: applied.output,
    tier: hasOffPeak ? tier : undefined,
    hasOffPeak,
  };
}

/**
 * 从 ollama.com/pricing 的 HTML 里解析模型价目表。
 *
 * 官方没有价格的 JSON API（/api/tags 不含价格），价目只存在于 pricing 页的表格里。
 * 模型行形如：
 *   <td><a href="/library/name">name</a></td><td>$0.30</td><td>$0.006</td><td>$1.20</td>
 * 名称带 `(Off-Peak)` 的行是谷时价，归并进对应模型的 offPeak 字段；`-` 单元格解析为
 * undefined（该模型没有这一档）。解析不出任何行时返回 undefined（上游改版）。
 *
 * @param {string} html pricing 页面 HTML。
 * @param {number} [now] 采集时刻，默认 Date.now()。
 * @returns {{fetchedAt: string, models: Record<string, object>} | undefined} 价目表。
 */
export function parsePricebookHtml(html, now = Date.now()) {
  if (typeof html !== 'string' || html === '') return undefined;
  // 只在 model-pricing 段里找（存在时），避免误吃其它表格。
  const head = html.indexOf('id="model-pricing"');
  const tail = head >= 0 ? html.indexOf('</section>', head) : -1;
  const scoped = head >= 0 && tail > head ? html.slice(head, tail) : html;

  const models = {};
  for (const row of scoped.split('<tr>')) {
    const link = /<a[^>]*href="\/library\/[^"]*"[^>]*>([^<]+)<\/a>/.exec(row);
    if (link === null) continue;
    const isOffPeakRow = /\(Off-Peak\)/.test(link[1]);
    const name = link[1].replace(/\s*\(Off-Peak\)\s*$/, '');
    if (name === '') continue;
    // 价格单元格都是纯文本（`$0.30` / `-`）；名称单元格里有 <a>，不会被这个匹配捕获。
    const cells = [...row.matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map((cell) => numberFromCell(cell[1]));
    if (cells.length < 3) continue;
    const prices = { input: cells[0], cached: cells[1], output: cells[2] };
    const entry = models[name] ?? (models[name] = {});
    if (isOffPeakRow) entry.offPeak = prices;
    else Object.assign(entry, prices);
  }
  if (Object.keys(models).length === 0) return undefined;
  return { fetchedAt: new Date(now).toISOString(), models };
}

/** 价格单元格 → 数字；`-`、空串、非数字解析为 undefined。 */
function numberFromCell(text) {
  const trimmed = text.trim();
  if (!/^[$]?[\d.,]+$/.test(trimmed)) return undefined;
  const value = Number.parseFloat(trimmed.replace(/[$,]/g, ''));
  return Number.isFinite(value) ? value : undefined;
}

//#endregion

/**
 * 计算一套完整的额度指标。
 *
 * @param {object} input 计算输入。
 * @param {unknown} input.balance `/api/balance` 原始响应。
 * @param {unknown} input.usage `/api/usage?range=30d&group_by=model` 原始响应。
 * @param {unknown} [input.plan] 套餐名（`/api/me` 的 Plan），仅用于展示。
 * @param {object} [input.pricebook] 价目表（{@link parsePricebookHtml} 的输出）。
 * @param {number} [input.now] 当前毫秒时间戳，便于测试注入。
 * @param {number} [input.paceWarnPct] 节奏判定阈值（百分点），默认 5。
 * @returns {object} 面板所需的全部派生指标。
 */
export function computeMetrics({ balance, usage, plan, pricebook, now = Date.now(), paceWarnPct = 5 }) {
  const included = balance?.included ?? {};
  const purchased = balance?.purchased ?? {};

  const allowanceUsd = num(included.allowance_usd);
  const includedRemainingUsd = num(included.balance_usd);
  const purchasedRemainingUsd = num(purchased.balance_usd);

  // 购买额度是「可用余额」，不计入赠费总额度：赠费额度用尽后仍可消耗购买额度。
  const totalUsd = allowanceUsd + purchasedRemainingUsd;
  const remainingUsd = includedRemainingUsd + purchasedRemainingUsd;
  const usedUsd = Math.max(0, totalUsd - remainingUsd);

  const usedPct = totalUsd > 0 ? usedUsd / totalUsd : undefined;

  const periodFromMs = parseIso(included.period?.from);
  const periodUntilMs = parseIso(included.period?.until);
  const periodKnown = periodFromMs !== undefined && periodUntilMs !== undefined && periodUntilMs > periodFromMs;
  const totalDays = periodKnown ? (periodUntilMs - periodFromMs) / MS_PER_DAY : undefined;
  const elapsedMs = periodKnown ? Math.min(Math.max(now - periodFromMs, 0), periodUntilMs - periodFromMs) : undefined;
  const elapsedDays = elapsedMs === undefined ? undefined : elapsedMs / MS_PER_DAY;
  const remainingDays = totalDays === undefined || elapsedDays === undefined ? undefined : Math.max(0, totalDays - elapsedDays);
  const elapsedPct = periodKnown ? elapsedMs / (periodUntilMs - periodFromMs) : undefined;

  const sinceIso = included.period?.from;
  const daily = normalizeBuckets(usage?.buckets, sinceIso);
  const tokens = daily.length > 0 ? sumBuckets(daily) : (() => {
    const totals = usage?.totals ?? {};
    const summed = {
      requests: num(totals.request_count),
      costUsd: num(totals.usage_usd),
      inputTokens: num(totals.input_tokens),
      cachedInputTokens: num(totals.cached_input_tokens),
      outputTokens: num(totals.output_tokens),
    };
    summed.totalTokens = summed.inputTokens + summed.outputTokens;
    return summed;
  })();

  // 按模型：`group_by=model` 的分组 + remainder 合计。明细页展示前 6 名，
  // 其余（含 remainder）折进 byModelMore，保证「合计」仍然对得上 totals。
  // byModelOther 是第 7–10 名的完整行（上游本身就按名给出），右窗页签里
  // 「其它」列表可以展开这些行；remainder 没有按名细分，只能保持合计。
  const peak = peakTierAt(now);
  const priceModels = pricebook?.models;
  const groups = normalizeGroups(usage?.totals?.groups);
  /** 一个归一化分组 → 明细行的映射（效率指标 + 当前档位的目录价）。 */
  const modelRowOf = (row) => {
    const entry = matchPriceModel(priceModels, row.model);
    return {
      model: row.model,
      requests: row.requests,
      costUsd: row.costUsd,
      inputTokens: row.inputTokens,
      cachedInputTokens: row.cachedInputTokens,
      outputTokens: row.outputTokens,
      ...efficiencyOf(row),
      price: priceForTier(entry, peak.tier === 'peak' ? 'peak' : 'off-peak'),
    };
  };
  const byModel = groups.slice(0, 6).map(modelRowOf);
  const byModelOther = groups.slice(6).map(modelRowOf);
  const rest = groups.slice(6);
  const remainder = usage?.totals?.remainder;
  let byModelMore;
  if (rest.length > 0 || num(remainder?.request_count) > 0) {
    const more = emptyBucket();
    for (const row of rest) {
      more.requests += row.requests;
      more.costUsd += row.costUsd;
      more.inputTokens += row.inputTokens;
      more.cachedInputTokens += row.cachedInputTokens;
      more.outputTokens += row.outputTokens;
    }
    if (remainder) {
      more.requests += num(remainder.request_count);
      more.costUsd += num(remainder.usage_usd);
      more.inputTokens += num(remainder.input_tokens);
      more.cachedInputTokens += num(remainder.cached_input_tokens);
      more.outputTokens += num(remainder.output_tokens);
    }
    more.totalTokens = more.inputTokens + more.outputTokens;
    Object.assign(more, efficiencyOf(more));
    byModelMore = { models: rest.length + (num(remainder?.request_count) > 0 ? 1 : 0), ...more };
  }

  let pace;
  if (usedPct === undefined || elapsedPct === undefined) {
    pace = { verdict: 'unknown', deltaPct: undefined };
  } else {
    const deltaPct = usedPct - elapsedPct;
    const tolerance = paceWarnPct / 100;
    const verdict = deltaPct > tolerance ? 'ahead' : deltaPct < -tolerance ? 'behind' : 'on-track';
    const burnPerDayUsd = elapsedDays !== undefined && elapsedDays > 0.01 ? usedUsd / elapsedDays : undefined;
    const projectedCostUsd =
      burnPerDayUsd === undefined || totalDays === undefined ? undefined : burnPerDayUsd * totalDays;
    const projectedPct = projectedCostUsd === undefined || totalUsd <= 0 ? undefined : projectedCostUsd / totalUsd;
    const runwayDays =
      burnPerDayUsd === undefined || burnPerDayUsd <= 0 ? undefined : remainingUsd / burnPerDayUsd;
    const exhaustsBeforeRenewal =
      runwayDays !== undefined && remainingDays !== undefined ? runwayDays < remainingDays : false;
    pace = {
      verdict,
      deltaPct,
      burnPerDayUsd,
      projectedCostUsd,
      projectedPct,
      runwayDays,
      exhaustsBeforeRenewal,
    };
  }

  return {
    plan: typeof plan === 'string' && plan !== '' ? plan : undefined,
    currency: 'USD',
    allowanceUsd,
    purchasedRemainingUsd,
    totalUsd,
    remainingUsd,
    usedUsd,
    usedPct,
    period: {
      from: included.period?.from,
      until: included.period?.until,
      known: periodKnown,
      totalDays,
      elapsedDays,
      remainingDays,
      elapsedPct,
    },
    tokens,
    /** 当前计费时段（UTC 规则）与下一次档位切换，供明细页展示。 */
    peak,
    /** 价目表透传（客户端要拿它对「当前会话模型」查价）。 */
    pricing: pricebook === undefined ? undefined : { fetchedAt: pricebook.fetchedAt, models: pricebook.models },
    /** 按模型用量与效率（费用降序，前 6 名），其余折进 byModelMore。 */
    byModel,
    /** 第 7–10 名的完整行（展开「其它」列表用）；上游 remainder 仍只在 byModelMore 里。 */
    byModelOther,
    byModelMore,
    daily: daily.map((row) => ({
      from: row.from,
      until: row.until,
      partial: row.partial,
      requests: row.requests,
      costUsd: row.costUsd,
      inputTokens: row.inputTokens,
      cachedInputTokens: row.cachedInputTokens,
      outputTokens: row.outputTokens,
      groups: row.groups,
    })),
    pace,
  };
}
