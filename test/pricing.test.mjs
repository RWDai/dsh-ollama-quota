/**
 * 峰谷时段、价目表解析与模型匹配的单测（node --test）。
 *
 * 这些逻辑都在 lib/metrics.js（纯函数）：不联网、不碰 DOM，给定输入必须得到
 * 确定输出。峰谷规则来自 ollama.com/pricing 的官方说明；解析器的输入是从真实
 * pricing 页截下来的结构。
 *
 * 运行：`node --test test/pricing.test.mjs`
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { peakTierAt, parsePricebookHtml, matchPriceModel, priceForTier } from '../lib/metrics.js';

//#region 峰谷判定

test('峰时＝工作日 12:00–18:00 UTC：边界两侧各验一次', () => {
  // 周三 11:59:59 —— 谷时，下一次切换是 12:00。
  const before = peakTierAt(Date.parse('2026-10-21T11:59:59Z'));
  assert.equal(before.tier, 'off-peak');
  assert.equal(before.nextChangeAt, '2026-10-21T12:00:00.000Z');
  // 周三 12:00 —— 峰时，下一次切换是 18:00。
  const inside = peakTierAt(Date.parse('2026-10-21T12:00:00Z'));
  assert.equal(inside.tier, 'peak');
  assert.equal(inside.nextChangeAt, '2026-10-21T18:00:00.000Z');
  // 周三 17:59:59 仍是峰时；18:00 起是谷时。
  assert.equal(peakTierAt(Date.parse('2026-10-21T17:59:59Z')).tier, 'peak');
  const after = peakTierAt(Date.parse('2026-10-21T18:00:00Z'));
  assert.equal(after.tier, 'off-peak');
  // 谷时下一次切换＝次日 12:00。
  assert.equal(after.nextChangeAt, '2026-10-22T12:00:00.000Z');
});

test('周末整天都是谷时：下一次切换跳到周一 12:00', () => {
  // 周五 18:00 之后 → 下一个工作日是周一。
  const fridayNight = peakTierAt(Date.parse('2026-10-23T19:00:00Z'));
  assert.equal(fridayNight.tier, 'off-peak');
  assert.equal(fridayNight.nextChangeAt, '2026-10-26T12:00:00.000Z');
  // 周六中午也是谷时，切换同样是周一。
  const saturday = peakTierAt(Date.parse('2026-10-24T12:00:00Z'));
  assert.equal(saturday.tier, 'off-peak');
  assert.equal(saturday.nextChangeAt, '2026-10-26T12:00:00.000Z');
  // 周日深夜 → 仍是周一 12:00。
  const sundayNight = peakTierAt(Date.parse('2026-10-25T23:59:59Z'));
  assert.equal(sundayNight.nextChangeAt, '2026-10-26T12:00:00.000Z');
});

test('工作日清晨的谷时，切换是当天 12:00', () => {
  const morning = peakTierAt(Date.parse('2026-10-21T03:30:00Z'));
  assert.equal(morning.tier, 'off-peak');
  assert.equal(morning.nextChangeAt, '2026-10-21T12:00:00.000Z');
});

test('非法输入返回 unknown，不抛错', () => {
  assert.equal(peakTierAt(undefined).tier, 'unknown');
  assert.equal(peakTierAt(Number.NaN).tier, 'unknown');
  assert.equal(peakTierAt(undefined).nextChangeAt, undefined);
});

//#endregion

//#region 价目表解析

/** 从真实 ollama.com/pricing 截取的最小化片段（结构未改）。 */
const PRICING_HTML = `
  <section id="model-pricing" class="flex flex-col w-full max-w-xl mx-auto mt-16 scroll-mt-24">
    <h2 class="text-2xl font-semibold mb-3">Model pricing</h2>
    <table class="w-full text-sm border-separate border-spacing-0">
      <thead>
        <tr>
          <th class="px-4 py-3 text-left font-semibold">Model</th>
          <th class="border-l border-neutral-200 px-4 py-3 text-right font-semibold">Input</th>
          <th class="border-l border-neutral-200 px-4 py-3 text-right font-semibold">Cached input</th>
          <th class="border-l border-neutral-200 px-4 py-3 text-right font-semibold">Output</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="border-t border-neutral-200 px-4 py-3"><a href="/library/clef" class="hover:underline">clef</a></td>
          <td class="border-l border-t border-neutral-200 px-4 py-3 text-right">$0.24</td>
          <td class="border-l border-t border-neutral-200 px-4 py-3 text-right">-</td>
          <td class="border-l border-t border-neutral-200 px-4 py-3 text-right">-</td>
        </tr>
        <tr>
          <td class="border-t border-neutral-200 px-4 py-3"><a href="/library/deepseek-v4.1-flash" class="hover:underline">deepseek-v4.1-flash</a></td>
          <td class="border-l border-t border-neutral-200 px-4 py-3 text-right">$0.30</td>
          <td class="border-l border-t border-neutral-200 px-4 py-3 text-right">$0.006</td>
          <td class="border-l border-t border-neutral-200 px-4 py-3 text-right">$1.20</td>
        </tr>
        <tr>
          <td class="border-t border-neutral-200 px-4 py-3"><a href="/library/deepseek-v4.1-flash" class="hover:underline">deepseek-v4.1-flash (Off-Peak)</a></td>
          <td class="border-l border-t border-neutral-200 px-4 py-3 text-right">$0.15</td>
          <td class="border-l border-t border-neutral-200 px-4 py-3 text-right">$0.003</td>
          <td class="border-l border-t border-neutral-200 px-4 py-3 text-right">$0.60</td>
        </tr>
        <tr>
          <td class="border-t border-neutral-200 px-4 py-3"><a href="/library/gpt-oss" class="hover:underline">gpt-oss:120b</a></td>
          <td class="border-l border-t border-neutral-200 px-4 py-3 text-right">$0.15</td>
          <td class="border-l border-t border-neutral-200 px-4 py-3 text-right">$0.014</td>
          <td class="border-l border-t border-neutral-200 px-4 py-3 text-right">$0.60</td>
        </tr>
      </tbody>
    </table>
    <!-- 上方还有订阅套餐的区块，里面不该被误解析 -->
    <div>Free $0 / Pro $20 / Max $300</div>
  </section>
`;

test('解析 pricing 页表格：峰谷行归并、`-` 解析为 undefined', () => {
  const book = parsePricebookHtml(PRICING_HTML, Date.parse('2026-10-21T06:00:00Z'));

  assert.ok(book, 'pricing fixture must parse');
  assert.equal(book.fetchedAt, '2026-10-21T06:00:00.000Z');

  const deepseek = book.models['deepseek-v4.1-flash'];
  assert.deepEqual(deepseek, { input: 0.3, cached: 0.006, output: 1.2, offPeak: { input: 0.15, cached: 0.003, output: 0.6 } });

  const clef = book.models['clef'];
  assert.deepEqual(clef, { input: 0.24, cached: undefined, output: undefined });

  // 含冒号的型号必须整体成为键，不能被拆开。
  assert.deepEqual(book.models['gpt-oss:120b'], { input: 0.15, cached: 0.014, output: 0.6 });

  // 订阅套餐文字不会进模型表。
  assert.equal(book.models['Free $0 / Pro $20 / Max $300'], undefined);
  assert.equal(Object.keys(book.models).length, 3);
});

test('解析失败（改版/空页）返回 undefined，由 host 降级', () => {
  assert.equal(parsePricebookHtml(''), undefined);
  assert.equal(parsePricebookHtml('<html><body>moved</body></html>'), undefined);
  assert.equal(parsePricebookHtml(undefined), undefined);
});

//#endregion

//#region 模型匹配与档位取价

const models = parsePricebookHtml(PRICING_HTML, 0).models;

test('匹配接受变体 tag，但不搞错带冒号的型号', () => {
  // usage 分组名带变体 tag → 归到基础名。
  assert.equal(matchPriceModel(models, 'deepseek-v4.1-flash:1017'), models['deepseek-v4.1-flash']);
  // 会话 id 与价表键完全一致（含冒号型号）。
  assert.equal(matchPriceModel(models, 'gpt-oss:120b'), models['gpt-oss:120b']);
  // 完全不同的 token 档不互相冒认。
  assert.equal(matchPriceModel(models, 'gpt-oss:20b'), undefined);
  assert.equal(matchPriceModel(models, 'glm-5.3'), undefined);
  // 非法入参安全返回。
  assert.equal(matchPriceModel(undefined, 'gpt-oss:120b'), undefined);
  assert.equal(matchPriceModel(models, ''), undefined);
});

test('档位取价：谷时才切换，且只对声明了谷时价的模型生效', () => {
  const deepseek = models['deepseek-v4.1-flash'];
  assert.deepEqual(priceForTier(deepseek, 'off-peak'), {
    input: 0.15,
    cached: 0.003,
    output: 0.6,
    tier: 'off-peak',
    hasOffPeak: true,
  });
  assert.deepEqual(
    { ...priceForTier(deepseek, 'peak'), tier: undefined, hasOffPeak: true },
    { input: 0.3, cached: 0.006, output: 1.2, hasOffPeak: true, tier: undefined },
  );

  // 没有谷时价的模型（峰谷同价）：offPeak 未声明，任何档位都用同一个价。
  const clef = models['clef'];
  const applied = priceForTier(clef, 'off-peak');
  assert.equal(applied.hasOffPeak, false);
  assert.equal(applied.tier, undefined);
  assert.equal(applied.input, 0.24);

  assert.equal(priceForTier(undefined, 'peak'), undefined);
});

//#endregion