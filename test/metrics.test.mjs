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
        { from: PERIOD_FROM, until: '2026-10-21T00:00:00Z', input_tokens: 1000, cached_input_tokens: 800, output_tokens: 100, request_count: 3, usage_usd: 0.01 },
      ],
    },
    now: Date.parse('2026-10-21T00:00:00Z'),
  });

  assert.equal(metrics.tokens.inputTokens, 1000);
  assert.equal(metrics.tokens.cachedInputTokens, 800);
  assert.equal(metrics.tokens.requests, 3);
  assert.equal(metrics.daily.length, 1);
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
