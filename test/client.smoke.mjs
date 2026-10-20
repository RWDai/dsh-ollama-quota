/**
 * 浏览器半的离线冒烟：不启动浏览器，用最小 DOM/loader 替身把 bundle 跑起来。
 *
 * 验证五件事：`__ModuleLoader__.load` 契约能被消费、`apply` 注册了两个 slot、
 * ready 态下 dock/卡片都能渲染且数字格式正确、collapsed 态不渲染卡片、
 * error 态渲染降级文案而不是抛错或输出 undefined/NaN。
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

/** 最小 window 替身。 */
globalThis.window = globalThis;

/** 记录注入的 <style>，证明 CSS 只注入一次。 */
const styles = [];
/** 最小 document 替身。 */
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

/** 一份贴近真实响应的载荷。 */
const payload = {
  ok: true,
  fetchedAt: '2026-10-20T04:37:25.783Z',
  refreshMs: 60000,
  plan: 'pro',
  allowanceUsd: 60,
  purchasedRemainingUsd: 0,
  totalUsd: 60,
  remainingUsd: 59.89125,
  usedUsd: 0.10875,
  usedPct: 0.0018125,
  period: {
    from: '2026-10-20T03:06:42Z',
    until: '2026-11-20T03:06:42Z',
    known: true,
    totalDays: 31,
    elapsedDays: 0.063,
    remainingDays: 30.937,
    elapsedPct: 0.002,
  },
  tokens: {
    requests: 177,
    costUsd: 0.10785,
    inputTokens: 8869576,
    cachedInputTokens: 8722728,
    outputTokens: 92025,
    totalTokens: 8961601,
  },
  daily: [
    {
      from: '2026-10-19T00:00:00Z',
      until: '2026-10-20T00:00:00Z',
      requests: 12,
      costUsd: 0.02,
      inputTokens: 1000,
      cachedInputTokens: 900,
      outputTokens: 200,
    },
    {
      from: '2026-10-20T00:00:00Z',
      until: '2026-10-20T05:00:00Z',
      partial: true,
      requests: 177,
      costUsd: 0.10785,
      inputTokens: 8869576,
      cachedInputTokens: 8722728,
      outputTokens: 92025,
    },
  ],
  pace: {
    verdict: 'on-track',
    deltaPct: -0.0002,
    burnPerDayUsd: 1.726,
    projectedCostUsd: 53.5,
    projectedPct: 0.891,
    runwayDays: 34.7,
    exhaustsBeforeRenewal: false,
  },
};

globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => payload });

/** 捕获 bundle 的 exports。 */
let bundle;
globalThis.__ModuleLoader__ = {
  load: ({ id, factory }) => {
    assert.equal(id, 'dsh-ollama-quota');
    bundle = factory((spec) => {
      assert.equal(spec, 'react');
      return loadModule('react');
    });
  },
};

await import('../lib/client.js');
assert.ok(bundle, 'bundle must self-register through __ModuleLoader__');
assert.equal(typeof bundle.apply, 'function');
assert.deepEqual([...bundle.inject], ['slots', 'locale']);

const registered = [];
const ctx = {
  effect: (fn) => fn(),
  locale: {
    register: (ns, dicts) => {
      assert.equal(ns, 'ollamaQuota');
      assert.deepEqual(Object.keys(dicts.zh).sort(), Object.keys(dicts.en).sort(), 'zh/en key sets must match');
    },
  },
  slots: {
    inject: (_name, fn) => fn(),
    register: (def, component) => {
      registered.push({ def, component });
      return () => {};
    },
  },
};

bundle.apply(ctx);
assert.equal(registered.length, 1);
assert.equal(registered[0].def.name, 'conversation.input.dock');
assert.equal(registered[0].def.id, 'ollama-quota');
assert.equal(registered[0].def.order, 10);
assert.equal(styles.length, 1, 'CSS must be injected exactly once');

const React = loadModule('react');
const { renderToStaticMarkup } = loadModule('react-dom/server');

/** 文案函数替身：无参回显 key，带参回显 key+JSON，便于断言参数被填上。 */
const t = (key, params) => (params === undefined ? key : `${key}${JSON.stringify(params)}`);

const dock = registered[0];

/** 等异步 refresh 落定。 */
async function settle() {
  for (let index = 0; index < 20; index += 1) await new Promise((resolve) => setImmediate(resolve));
}

const noPlaceholders = (html, label) => {
  assert.doesNotMatch(html, /undefined|NaN/, `${label} must not contain undefined/NaN`);
};

// 闸门：默认没有可见实例就不轮询，测试显式拉一次（浏览器里由 dock 挂载触发）。
assert.equal(bundle.store.get().status, 'idle');
await bundle.refresh({ force: true });
await settle();
assert.equal(bundle.store.get().status, 'ready');

// 折叠态：只有标题行，没有明细区。
const collapsed = renderToStaticMarkup(React.createElement(dock.component, { t }));
assert.match(collapsed, /ollamaQuota_root/);
assert.doesNotMatch(collapsed, /ollamaQuota_detail/, 'detail must stay collapsed');
assert.equal((collapsed.match(/<svg/g) ?? []).length, 2, 'lead glyph + collapse chevron');
assert.match(collapsed, /M12 10L8\.70711 6\.70711/, 'collapsed dock uses the native up chevron');
assert.doesNotMatch(collapsed, /<strong>/, 'summary is plain tertiary text, like the native docks');

// 展开态：点标题展开（等价于 store.expanded=true）。
bundle.store.patch({ expanded: true });
const expandedHtml = renderToStaticMarkup(React.createElement(dock.component, { t }));
assert.match(expandedHtml, /ollamaQuota_detail/);
assert.match(expandedHtml, /M4 6L7\.29289 9\.29289/, 'expanded dock uses the native down chevron');
assert.match(expandedHtml, /\$59\.89/);
assert.match(expandedHtml, /11-20/);
assert.match(expandedHtml, /8\.96M/);
assert.match(expandedHtml, /53\.5/);
assert.equal((expandedHtml.match(/ollamaQuota_chartBar/g) ?? []).length, 2, 'one bar per daily bucket');
noPlaceholders(expandedHtml, 'expanded dock');

// dock 摘要。
bundle.store.patch({ expanded: false });
const dockHtml = renderToStaticMarkup(React.createElement(dock.component, { t }));
assert.match(dockHtml, /\$59\.89/);
assert.match(dockHtml, /8\.96M tok/);
// 渲染后的 HTML 会把参数里的引号转义成 &quot;，这里只断言值被填进去了。
assert.match(dockHtml, /· 0\.2% · pace\.onTrack/);
assert.match(dockHtml, /dock\.expires\{[^}]*11-20/);
noPlaceholders(dockHtml, 'dock');

console.log('dock markup:\n' + dockHtml + '\n');

// 错误态：上游 401 时必须渲染降级文案。
bundle.store.patch({
  expanded: true,
  status: 'error',
  payload: undefined,
  error: { ok: false, code: 'unauthorized', message: 'HTTP 401' },
});
const errorDock = renderToStaticMarkup(React.createElement(dock.component, { t }));
assert.match(errorDock, /card\.unauthorized/);
assert.doesNotMatch(errorDock, /ollamaQuota_detail/, 'no detail area without data');
noPlaceholders(errorDock, 'error dock');

// 准入失败：401/403 是「会话没通过校验」，不能冒充 network 让用户去查网络。
// 旧版把任何非 2xx 都标成 network，绑局域网地址时额度条永远显示「无法连接
// ollama.com」，而宿主机到上游其实完全正常。
const okFetch = globalThis.fetch;
globalThis.fetch = async () => ({ ok: false, status: 403, json: async () => ({}) });
bundle.store.patch({ expanded: true, status: 'ready', payload: undefined, error: undefined });
await bundle.refresh({ force: true });
await settle();
assert.equal(bundle.store.get().status, 'error');
assert.equal(bundle.store.get().error.code, 'forbidden', '403 must map to code=forbidden');
const forbiddenDock = renderToStaticMarkup(React.createElement(dock.component, { t }));
assert.match(forbiddenDock, /card\.forbidden/);
assert.doesNotMatch(forbiddenDock, /card\.network/, '403 must not be reported as a network failure');
noPlaceholders(forbiddenDock, 'forbidden dock');
globalThis.fetch = okFetch;

// CSS 里不能出现 calc 乘法（非法语法会让整条声明失效）。
assert.doesNotMatch(styles[0].textContent, /calc\([^)]*\*/, 'no calc multiplication in the stylesheet');
assert.match(styles[0].textContent, /ollamaQuota_root/);
// 表面材质跟原生 dock 一致：半透明菜单 + 模糊 + elevation 阴影 + 大圆角，
// 而不是旧版不透明的 tip 底 + 1px 边框 + 12px 圆角。
assert.match(styles[0].textContent, /background:var\(--dsw-specific-menu\)/);
assert.match(styles[0].textContent, /backdrop-filter:var\(--dsw-menu-backdrop-filter\)/);
assert.match(styles[0].textContent, /box-shadow:var\(--dsw-elevation-panel\)/);
assert.match(styles[0].textContent, /border-radius:var\(--dsw-radius-lg\)/);
assert.doesNotMatch(styles[0].textContent, /var\(--dsw-specific-tip\)/, 'do not use the opaque tip surface');

// 供应商闸门：目录快照里当前供应商不在 providers 列表时整条不渲染。
const snapshotStore = (provider) => {
  const state = { current: { provider, model: 'm' }, routable: true, groups: [], failures: [], status: 'ready', error: null };
  return { getSnapshot: () => state, subscribe: () => () => {}, update: () => {} };
};
const offProvider = renderToStaticMarkup(
  React.createElement(dock.component, { t, directory: { store: snapshotStore('openai') } }),
);
assert.equal(offProvider, '', 'dock must not render for a foreign provider');
const onProvider = renderToStaticMarkup(
  React.createElement(dock.component, { t, directory: { store: snapshotStore('ollama') } }),
);
assert.match(onProvider, /ollamaQuota_root/, 'dock renders for the gated provider');

console.log('client smoke OK: loader contract, dock slot, collapsed/expanded/error states, css injection');

// 插件会按 refreshMs 递归安排轮询，Node 的事件循环因此不会自然退出。
// 冒烟只关心一次性渲染结果，断言完成后直接结束进程。
process.exit(0);
