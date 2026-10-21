/**
 * 浏览器半的离线冒烟（刻意保持最小——前端不搞逐字符的结构断言）。
 *
 * 只验证四件真正防回归的事：
 * 1. `__ModuleLoader__.load` 契约能被消费，exports/依赖列表正确；
 * 2. zh/en 两个词典键集完全一致；
 * 3. CSS 只注入一次、样式表里没有 calc 乘法这种会让整条声明失效的语法；
 * 4. ready 态渲染不出现 undefined/NaN，供应商闸门依旧生效。
 *
 * 运行：`node test/client.smoke.mjs`
 */

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';

const requireFromRepo = createRequire(import.meta.url);

/**
 * 解析 react / react-dom：优先仓库自己的 node_modules（CI 用），
 * 没有就回退到本机 DSH profile 的 node_modules（开发时没装 devDeps 也能跑）。
 * @param {string} specifier 模块说明符。
 * @returns {unknown} 模块导出。
 */
function loadModule(specifier) {
  try {
    return requireFromRepo(specifier);
  } catch {
    const home = process.env.DSH_HOME ?? join(homedir(), '.dsh');
    for (const anchor of [join(home, 'profiles/web/package.json'), join(home, 'profiles/package.json')]) {
      try {
        return createRequire(anchor)(specifier);
      } catch {
        // 换下一个候选锚点
      }
    }
  }
  throw new Error(`cannot resolve ${specifier}: run "npm install" in this repo, or install DSH locally`);
}

const React = loadModule('react');
const { renderToStaticMarkup } = loadModule('react-dom/server');

/** 加载被测 bundle（与浏览器相同的 loader 形状）。 */
function loadBundle() {
  let bundle;
  globalThis.window = globalThis;
  globalThis.__ModuleLoader__ = {
    load: ({ id, factory }) => {
      assert.equal(id, 'dsh-ollama-quota');
      bundle = factory((spec) => {
        assert.equal(spec, 'react');
        return React;
      });
    },
  };
  requireFromRepo('../lib/client.js');
  delete globalThis.__ModuleLoader__;
  return bundle;
}

/** 最小 document 替身：只记录注入的 <style>。 */
const styles = [];
globalThis.document = {
  visibilityState: 'visible',
  querySelector: (selector) => styles.find((style) => style.selector === selector) ?? null,
  createElement: () => ({ dataset: {}, textContent: '' }),
  head: {
    appendChild: (tag) => {
      tag.selector = `style[data-plugin-css=${JSON.stringify(tag.dataset.pluginCss)}]`;
      styles.push(tag);
    },
  },
  addEventListener: () => {},
  removeEventListener: () => {},
};

const bundle = loadBundle();

// 1. 契约：插槽/依赖清单。
assert.equal(bundle.inject.length, 2);
assert.deepEqual([...bundle.inject], ['slots', 'locale']);
assert.equal(typeof bundle.apply, 'function');
assert.equal(typeof bundle.refresh, 'function');
assert.equal(typeof bundle.QuotaDock, 'function');
assert.equal(typeof bundle.QuotaTab, 'function');

// 2. zh/en 键集一致。
let parityOk = false;
{
  const zhKeys = new Set();
  const enKeys = new Set();
  const ctx = {
    effect: (fn) => fn(),
    get: () => undefined,
    locale: {
      register: (ns, dicts) => {
        assert.equal(ns, 'ollamaQuota');
        for (const key of Object.keys(dicts.zh)) zhKeys.add(key);
        for (const key of Object.keys(dicts.en)) enKeys.add(key);
        parityOk = true;
      },
    },
    slots: {
      inject: (_name, fn) => fn(),
      register: () => () => {},
    },
  };
  bundle.apply(ctx);
  assert.ok(parityOk, 'locale.register must be called from apply');
  assert.deepEqual([...zhKeys].sort(), [...enKeys].sort(), 'zh/en key sets must match');
  assert.ok(zhKeys.size > 40, 'the dictionary should be reasonably complete');
}

// 3. CSS：只注入一次，且没有 calc 乘法。
assert.equal(styles.length, 1, 'CSS must be injected exactly once');
assert.doesNotMatch(styles[0].textContent, /calc\([^)]*\*/, 'no calc multiplication (it invalidates the whole declaration)');

// 4. ready 态渲染。
const payload = {
  ok: true,
  remainingUsd: 52.88,
  totalUsd: 60,
  usedPct: 0.119,
  providers: ['ollama'],
  period: { from: '2026-10-20T03:06:42Z', until: '2026-11-20T03:06:42Z', elapsedPct: 0.002 },
  tokens: { requests: 5160, costUsd: 0.10785, inputTokens: 8_742_000, cachedInputTokens: 8_520_000, outputTokens: 219_601, totalTokens: 8_961_601 },
  peak: { tier: 'off-peak', nextChangeInMs: 2.4 * 3_600_000 },
  pricing: { fetchedAt: '2026-10-21T06:00:00Z', models: {} },
  byModel: [
    { model: 'deepseek-v4.1-flash:1017', requests: 4880, costUsd: 0.07, inputTokens: 7_800_000, cachedInputTokens: 7_600_000, outputTokens: 260_000, totalTokens: 8_060_000, cacheHitRate: 0.975, actualUsdPer1M: 0.58 },
    { model: 'glm-5.3-flash', requests: 280, costUsd: 0.04, inputTokens: 800_000, cachedInputTokens: 700_000, outputTokens: 20_000, totalTokens: 820_000, cacheHitRate: 0.875, actualUsdPer1M: 0.31 },
  ],
  byModelMore: { models: 2, requests: 13, costUsd: 0.05 },
  byModelOther: [{ model: 'kimi-k2.6', requests: 10, costUsd: 0.02, inputTokens: 200_000, cachedInputTokens: 150_000, outputTokens: 5_000, totalTokens: 205_000, cacheHitRate: 0.75, actualUsdPer1M: 0.0976 }],
  daily: [
    { from: '2026-10-20T00:00:00Z', until: '2026-10-21T00:00:00Z', partial: false, requests: 4880, costUsd: 0.078, inputTokens: 5_700_000, cachedInputTokens: 5_550_000, outputTokens: 150_000, groups: [{ model: 'deepseek-v4.1-flash:1017', requests: 4800, costUsd: 0.07, inputTokens: 5_600_000, cachedInputTokens: 5_500_000, outputTokens: 100_000 }] },
    { from: '2026-10-21T00:00:00Z', until: '2026-10-22T00:00:00Z', partial: true, requests: 280, costUsd: 0.03, inputTokens: 3_042_000, cachedInputTokens: 2_970_000, outputTokens: 69_601, groups: [{ model: 'deepseek-v4.1-flash:1017', requests: 80, costUsd: 0.01, inputTokens: 2_200_000, cachedInputTokens: 2_100_000, outputTokens: 160_000 }, { model: 'glm-5.3-flash', requests: 200, costUsd: 0.02, inputTokens: 842_000, cachedInputTokens: 870_000, outputTokens: 9_601 }] },
  ],
  pace: { verdict: 'ahead', deltaPct: 0.117, projectedCostUsd: 53.5, projectedPct: 0.891 },
  fetchedAt: '2026-10-21T16:30:00Z',
};

/** 文案替身：无参回显 key，带参回显 key+JSON（只用于「出现过」级别的检查）。 */
const t = (key, params) => (params === undefined ? key : `${key}${JSON.stringify(params)}`);

// 4a. 展开明细渲染：直接渲染 QuotaDetail，不出现 undefined/NaN。
const detailHtml = renderToStaticMarkup(
  React.createElement(bundle.QuotaDetail, { t, payload, chartPx: 38 }),
);
assert.match(detailHtml, /ollamaQuota_detail/);
assert.doesNotMatch(detailHtml, /undefined|NaN/, 'expanded detail must not leak undefined/NaN');

// 4b. dock 与供应商闸门：非 ollama 会话整条不渲染（idle 态下也如此）。
const snapshotStore = (provider) => ({
  getSnapshot: () => ({ current: { provider, model: 'm' }, routable: true, groups: [], failures: [], status: 'ready', error: null }),
  subscribe: () => () => {},
});
const off = renderToStaticMarkup(
  React.createElement(bundle.QuotaDock, { t, directory: { store: snapshotStore('openai') } }),
);
assert.equal(off, '', 'dock must not render for a foreign provider');
const on = renderToStaticMarkup(
  React.createElement(bundle.QuotaDock, { t, directory: { store: snapshotStore('ollama') } }),
);
assert.match(on, /ollamaQuota_root/, 'dock renders for the gated provider');

console.log('client smoke OK: loader contract, i18n parity, css injection, render sanity, provider gate');

// 轮询定时器会让事件循环不退出；冒烟只关心上面的一次性断言。
process.exit(0);