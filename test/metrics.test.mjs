/**
 * `lib/metrics.js` 的单测（node --test）。
 *
 * 只测纯计算：给定 balance/usage 原始响应与固定 now，派生的百分比、节奏
 * 判定、跑道天数必须是确定的。浏览器半与 host 半不在这里测。
 *
 * 运行：`node --test plugins/dsh-ollama-quota/test/`
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { computeMetrics, normalizeBuckets, sumBuckets } from '../lib/metrics.js';

/** 构造一份 balance 响应。 */
function balanceOf({ allowance, remaining, purchased = 0, from, until }) {
  return {
    included: {
      balance_usd: remaining,
      allowance_usd: allowance,
      period: { from, until },
    },
    purchased: { balance_usd: purchased },
  };
}

/** 一个月周期：2026-10-20 → 2026-11-20。 */
const PERIOD_FROM = '2026-10-20T00:00:00Z';
const PERIOD_UNTIL = '2026-11-20T00:00:00Z';

test('已用比例与剩余额度来自 balance，而不是 usage 的费用', () => {
  const now = Date.parse('2026-10-20T12:00:00Z');
  const metrics = computeMetrics({
    balance: balanceOf({ allowance: 60, remaining: 45, from: PERIOD_FROM, until: PERIOD_UNTIL }),
    usage: { totals: { usage_usd: 0.04, input_tokens: 10, output_tokens: 5, request_count: 2 } },
    now,
  });

  assert.equal(metrics.totalUsd, 60);
  assert.equal(metrics.remainingUsd, 45);
  assert.equal(metrics.usedUsd, 15);
  assert.equal(metrics.usedPct, 0.25);
});

test('购买额度计入总额度与剩余额度', () => {
  const metrics = computeMetrics({
    balance: balanceOf({ allowance: 60, remaining: 10, purchased: 20, from: PERIOD_FROM, until: PERIOD_UNTIL }),
    usage: {},
    now: Date.parse('2026-10-21T00:00:00Z'),
  });

  assert.equal(metrics.totalUsd, 80);
  assert.equal(metrics.remainingUsd, 30);
  assert.equal(metrics.usedUsd, 50);
  assert.equal(metrics.usedPct, 0.625);
});

test('节奏判定区分超前、落后与正常', () => {
  // 周期 31 天，时间过去一半（约 50%），用量 25% → 落后。
  const behind = computeMetrics({
    balance: balanceOf({ allowance: 100, remaining: 75, from: PERIOD_FROM, until: PERIOD_UNTIL }),
    usage: {},
    now: Date.parse('2026-11-04T12:00:00Z'),
    paceWarnPct: 5,
  });
  assert.equal(behind.pace.verdict, 'behind');
  assert.ok(behind.pace.deltaPct < 0);

  // 用量 90% 而时间只过一半 → 超前。
  const ahead = computeMetrics({
    balance: balanceOf({ allowance: 100, remaining: 10, from: PERIOD_FROM, until: PERIOD_UNTIL }),
    usage: {},
    now: Date.parse('2026-11-04T12:00:00Z'),
    paceWarnPct: 5,
  });
  assert.equal(ahead.pace.verdict, 'ahead');

  // 用量与时间进度几乎一致 → 正常。
  const onTrack = computeMetrics({
    balance: balanceOf({ allowance: 100, remaining: 50, from: PERIOD_FROM, until: PERIOD_UNTIL }),
    usage: {},
    now: Date.parse('2026-11-04T12:00:00Z'),
    paceWarnPct: 5,
  });
  assert.equal(onTrack.pace.verdict, 'on-track');
});

test('阈值可调：小偏差默认算正常，收紧阈值后算超前', () => {
  const args = {
    balance: balanceOf({ allowance: 100, remaining: 47, from: PERIOD_FROM, until: PERIOD_UNTIL }),
    usage: {},
    now: Date.parse('2026-11-04T12:00:00Z'),
  };
  assert.equal(computeMetrics({ ...args, paceWarnPct: 5 }).pace.verdict, 'on-track');
  assert.equal(computeMetrics({ ...args, paceWarnPct: 1 }).pace.verdict, 'ahead');
});

test('按当前速度算出的跑道天数与「到期前耗尽」判定', () => {
  const metrics = computeMetrics({
    balance: balanceOf({ allowance: 100, remaining: 40, from: PERIOD_FROM, until: PERIOD_UNTIL }),
    usage: {},
    // 周期 31 天已过 15.5 天，用掉 60 → 每天 3.87 美元 → 剩余 40 只能撑 10.3 天，早于周期结束。
    now: Date.parse('2026-11-04T12:00:00Z'),
  });

  assert.ok(metrics.pace.burnPerDayUsd > 3);
  assert.ok(metrics.pace.runwayDays > 10 && metrics.pace.runwayDays < 11);
  assert.equal(metrics.pace.exhaustsBeforeRenewal, true);
  assert.ok(metrics.pace.projectedPct > 1);
});

test('总额度为零时百分比与节奏都不可判定，不产生 NaN', () => {
  const metrics = computeMetrics({
    balance: balanceOf({ allowance: 0, remaining: 0, from: PERIOD_FROM, until: PERIOD_UNTIL }),
    usage: {},
    now: Date.parse('2026-10-21T00:00:00Z'),
  });

  assert.equal(metrics.usedPct, undefined);
  assert.equal(metrics.pace.verdict, 'unknown');
  assert.equal(Number.isNaN(metrics.usedUsd), false);
});

test('缺少账单周期时节奏不可判定，但余额仍然可读', () => {
  const metrics = computeMetrics({
    balance: { included: { balance_usd: 12, allowance_usd: 60 }, purchased: { balance_usd: 0 } },
    usage: {},
    now: Date.parse('2026-10-21T00:00:00Z'),
  });

  assert.equal(metrics.period.known, false);
  assert.equal(metrics.pace.verdict, 'unknown');
  assert.equal(metrics.usedPct, 0.8);
});

test('桶按周期起点过滤，跨边界桶整桶保留', () => {
  const buckets = [
    { from: '2026-10-18T00:00:00Z', until: '2026-10-19T00:00:00Z', input_tokens: 999, output_tokens: 1 },
    { from: '2026-10-19T00:00:00Z', until: '2026-10-20T00:00:00Z', input_tokens: 500, output_tokens: 1 },
    { from: '2026-10-20T00:00:00Z', until: '2026-10-21T00:00:00Z', input_tokens: 100, output_tokens: 10 },
  ];

  const rows = normalizeBuckets(buckets, '2026-10-19T12:00:00Z');
  // 19 日桶跨过下界 → 保留；18 日桶整桶早于下界 → 丢弃。
  assert.equal(rows.length, 2);
  assert.equal(sumBuckets(rows).inputTokens, 600);
});

test('buckets 为空时退回 usage.totals', () => {
  const metrics = computeMetrics({
    balance: balanceOf({ allowance: 60, remaining: 59, from: PERIOD_FROM, until: PERIOD_UNTIL }),
    usage: {
      buckets: [],
      totals: { request_count: 7, usage_usd: 1.5, input_tokens: 2000, cached_input_tokens: 1500, output_tokens: 300 },
    },
    now: Date.parse('2026-10-21T00:00:00Z'),
  });

  assert.equal(metrics.tokens.requests, 7);
  assert.equal(metrics.tokens.inputTokens, 2000);
  assert.equal(metrics.tokens.totalTokens, 2300);
});

test('日桶汇总取代滚动 30 天的 totals', () => {
  const metrics = computeMetrics({
    balance: balanceOf({ allowance: 60, remaining: 59, from: PERIOD_FROM, until: PERIOD_UNTIL }),
    usage: {
      totals: { input_tokens: 999999, output_tokens: 999999, request_count: 999 },
      buckets: [
        {
          from: PERIOD_FROM,
          until: '2026-10-21T00:00:00Z',
          input_tokens: 1000,
          cached_input_tokens: 800,
          output_tokens: 100,
          request_count: 3,
          usage_usd: 0.01,
          // group_by=model 时每个日桶自带分组：归一化后透传给堆叠图。
          groups: [{ model: 'glm-5.3-flash', request_count: 3, usage_usd: 0.01, input_tokens: 1000, cached_input_tokens: 800, output_tokens: 100 }],
        },
      ],
    },
    now: Date.parse('2026-10-21T00:00:00Z'),
  });

  assert.equal(metrics.tokens.inputTokens, 1000);
  assert.equal(metrics.tokens.cachedInputTokens, 800);
  assert.equal(metrics.tokens.requests, 3);
  assert.equal(metrics.daily.length, 1);
  assert.deepEqual(metrics.daily[0].groups, [
    {
      model: 'glm-5.3-flash',
      requests: 3,
      costUsd: 0.01,
      inputTokens: 1000,
      cachedInputTokens: 800,
      outputTokens: 100,
    },
  ]);
});

test('没有 group_by 的日桶（旧 host / 降级）不携带 groups', () => {
  const metrics = computeMetrics({
    balance: balanceOf({ allowance: 60, remaining: 59, from: PERIOD_FROM, until: PERIOD_UNTIL }),
    usage: {
      totals: { request_count: 3, usage_usd: 0.01, input_tokens: 1000, cached_input_tokens: 800, output_tokens: 100 },
      buckets: [{ from: PERIOD_FROM, until: '2026-10-21T00:00:00Z', input_tokens: 1000, output_tokens: 100, request_count: 3, usage_usd: 0.01 }],
    },
    now: Date.parse('2026-10-21T00:00:00Z'),
  });

  assert.equal(metrics.daily.length, 1);
  assert.equal(metrics.daily[0].groups, undefined);
});

test('余额高于总额度（退款场景）时不出现负用量', () => {
  const metrics = computeMetrics({
    balance: balanceOf({ allowance: 60, remaining: 61, from: PERIOD_FROM, until: PERIOD_UNTIL }),
    usage: {},
    now: Date.parse('2026-10-21T00:00:00Z'),
  });

  assert.equal(metrics.usedUsd, 0);
  assert.equal(metrics.usedPct, 0);
});

//#endregion

//#region 按模型用量与效率

/** 价目表（与 pricing 页一致的最小样本）。 */
const PRICEBOOK = {
  fetchedAt: '2026-10-21T06:00:00.000Z',
  models: {
    'deepseek-v4.1-flash': { input: 0.3, cached: 0.006, output: 1.2, offPeak: { input: 0.15, cached: 0.003, output: 0.6 } },
    'glm-5.3-flash': { input: 0.15, cached: 0.03, output: 0.5 },
  },
};

test('按模型分组：用量、效率与档位价都在行上，超出 6 名的折进 byModelMore', () => {
  const group = (model, request_count, usage_usd) => ({
    model,
    request_count,
    usage_usd,
    input_tokens: 1_000_000,
    cached_input_tokens: 900_000,
    output_tokens: 20_000,
  });
  const usage = {
    totals: {
      request_count: 4554,
      usage_usd: 5.9,
      input_tokens: 1_000_000,
      cached_input_tokens: 900_000,
      output_tokens: 20_000,
      groups: [
        group('deepseek-v4.1-flash:1017', 100, 5.9), // usage 分组名带变体 tag
        group('glm-5.3-flash', 57, 0.5),
        group('kimi-k3', 3, 0.1),
        group('kimi-k2.6', 2, 0.09),
        group('glm-5.3', 3, 0.08),
        group('glm-5.2', 3, 0.07),
        group('kimi-k2.7-code', 2, 0.06),
        group('minimax-m2.7', 4, 0.05),
        group('muse-spark-open', 3, 0.04),
      ],
      remainder: { request_count: 19, usage_usd: 0.001, input_tokens: 2000, cached_input_tokens: 0, output_tokens: 300 },
    },
  };

  const metrics = computeMetrics({
    balance: balanceOf({ allowance: 60, remaining: 59.76, from: PERIOD_FROM, until: PERIOD_UNTIL }),
    usage,
    pricebook: PRICEBOOK,
    // 周三 06:36 UTC —— 谷时。
    now: Date.parse('2026-10-21T06:36:00Z'),
  });

  // 计费时段透传给明细页。
  assert.equal(metrics.peak.tier, 'off-peak');
  assert.equal(metrics.peak.nextChangeAt, '2026-10-21T12:00:00.000Z');

  // 前 6 名：费用降序；行上有效率与档位价。
  assert.equal(metrics.byModel.length, 6);
  const head = metrics.byModel[0];
  assert.equal(head.model, 'deepseek-v4.1-flash:1017');
  assert.equal(head.costUsd, 5.9);
  assert.equal(head.totalTokens, 1_020_000);
  assert.equal(head.cacheHitRate, 0.9);
  assert.equal(head.actualUsdPer1M, (5.9 / 1_020_000) * 1e6);
  assert.equal(head.costPerRequest, 5.9 / 100);
  // 谷时 → 带谷时价的模型取 offPeak，且匹配容忍变体 tag。
  assert.deepEqual(
    {
      input: head.price.input,
      cached: head.price.cached,
      output: head.price.output,
      tier: head.price.tier,
      hasOffPeak: head.price.hasOffPeak,
    },
    { input: 0.15, cached: 0.003, output: 0.6, tier: 'off-peak', hasOffPeak: true },
  );
  // 峰谷同价的模型：不声明 tier，价格不变。
  const glm = metrics.byModel.find((row) => row.model === 'glm-5.3-flash');
  assert.deepEqual(
    { input: glm.price.input, tier: glm.price.tier, hasOffPeak: glm.price.hasOffPeak },
    { input: 0.15, tier: undefined, hasOffPeak: false },
  );

  // 第 7 名之后 + remainder 一起折进 byModelMore。
  assert.equal(metrics.byModelMore.models, 4);
  assert.equal(metrics.byModelMore.requests, 2 + 4 + 3 + 19);
  assert.ok(Math.abs(metrics.byModelMore.costUsd - (0.06 + 0.05 + 0.04 + 0.001)) < 1e-9);
});

test('没有 groups 时 byModel 为空数组，价目表完整透传', () => {
  const metrics = computeMetrics({
    balance: balanceOf({ allowance: 60, remaining: 59.76, from: PERIOD_FROM, until: PERIOD_UNTIL }),
    usage: { totals: { request_count: 1, usage_usd: 0.01, input_tokens: 10, output_tokens: 5 } },
    pricebook: PRICEBOOK,
    now: Date.parse('2026-10-21T06:36:00Z'),
  });

  assert.deepEqual(metrics.byModel, []);
  assert.equal(metrics.byModelMore, undefined);
  assert.deepEqual(metrics.pricing.models, PRICEBOOK.models);
  assert.equal(metrics.pricing.fetchedAt, PRICEBOOK.fetchedAt);
});

test('价目表缺席时 byModel 行仍有效率指标，price 为 undefined', () => {
  const metrics = computeMetrics({
    balance: balanceOf({ allowance: 60, remaining: 59.76, from: PERIOD_FROM, until: PERIOD_UNTIL }),
    usage: {
      totals: {
        groups: [{ model: 'glm-5.3-flash', request_count: 1, usage_usd: 0.01, input_tokens: 100, cached_input_tokens: 0, output_tokens: 10 }],
      },
    },
    now: Date.parse('2026-10-21T06:36:00Z'),
  });

  assert.equal(metrics.byModel.length, 1);
  assert.equal(metrics.byModel[0].price, undefined);
  assert.equal(metrics.byModel[0].actualUsdPer1M, (0.01 / 110) * 1e6);
  assert.equal(metrics.pricing, undefined);
});

//#endregion
