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

/**
 * 计算一套完整的额度指标。
 *
 * @param {object} input 计算输入。
 * @param {unknown} input.balance `/api/balance` 原始响应。
 * @param {unknown} input.usage `/api/usage?range=30d` 原始响应。
 * @param {unknown} [input.plan] 套餐名（`/api/me` 的 Plan），仅用于展示。
 * @param {number} [input.now] 当前毫秒时间戳，便于测试注入。
 * @param {number} [input.paceWarnPct] 节奏判定阈值（百分点），默认 5。
 * @returns {object} 面板所需的全部派生指标。
 */
export function computeMetrics({ balance, usage, plan, now = Date.now(), paceWarnPct = 5 }) {
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
    daily: daily.map((row) => ({
      from: row.from,
      until: row.until,
      partial: row.partial,
      requests: row.requests,
      costUsd: row.costUsd,
      inputTokens: row.inputTokens,
      cachedInputTokens: row.cachedInputTokens,
      outputTokens: row.outputTokens,
    })),
    pace,
  };
}
