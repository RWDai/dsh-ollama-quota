/**
 * host 半的连通性冒烟（不打上游 mock，直接打真实 Ollama 云）。
 *
 * 它用一对假的 ctx/req/res 跑 `apply` 里注册的真实 handler，验证三件事：
 * 凭据解析、三个上游端点的采集、以及派生指标落到 JSON 上。
 *
 * 需要本机已配置 OLLAMA_API_KEY（与运行中的 dsh 用同一份凭据存储）。
 * 运行：`node test/host.smoke.mjs`（不计入 `node --test` 的 glob）。
 */

import assert from 'node:assert/strict';

import { apply } from '../lib/index.js';

/** 与 profile 里的配置保持一致的默认值。 */
const config = {
  baseURL: 'https://ollama.com',
  apiKeyEnv: 'OLLAMA_API_KEY',
  path: '/plugin/ollama-quota/state',
  refreshMs: 60_000,
  timeoutMs: 8_000,
  paceWarnPct: 5,
};

/** 收集注册的路由。 */
const routes = [];

/** 最小可用的凭据 seam 替身：读取真实的本地凭据存储。 */
const credentials = {
  async resolve(ref) {
    const { readFileSync } = await import('node:fs');
    const { homedir } = await import('node:os');
    const { join } = await import('node:path');
    let text = '';
    try {
      text = readFileSync(join(homedir(), '.dsh', '.credentials.yaml'), 'utf8');
    } catch {
      return undefined;
    }
    const pattern = new RegExp(`^\\s+${String(ref)}:\\s*(.+)$`, 'm');
    const match = text.match(pattern);
    return match === null ? undefined : { value: match[1].trim(), source: 'smoke' };
  },
};

const ctx = {
  webServer: {
    register(route) {
      routes.push(route);
      return () => {};
    },
  },
  credentials,
  logger: { warn: (message) => console.error('[warn]', message) },
  effect(fn) {
    return fn();
  },
};

apply(ctx, config);
assert.equal(routes.length, 1);

const route = routes[0];
assert.equal(route.path, '/plugin/ollama-quota/state');

/** 一个够用的 res 替身。 */
function makeRes() {
  const res = {
    status: undefined,
    headers: undefined,
    body: undefined,
    writeHead(status, headers) {
      res.status = status;
      res.headers = headers;
    },
    end(body) {
      res.body = body;
    },
  };
  return res;
}

const res = makeRes();
await route.handler({ method: 'GET', socket: { remoteAddress: '127.0.0.1' } }, res);

assert.equal(res.status, 200);
const payload = JSON.parse(res.body);
console.log(JSON.stringify(payload, null, 1));

assert.equal(payload.ok, true, `expected ok payload, got ${payload.code}: ${payload.message}`);
assert.ok(payload.totalUsd > 0);
assert.ok(payload.remainingUsd >= 0 && payload.remainingUsd <= payload.totalUsd);
assert.ok(payload.period.known);
assert.ok(typeof payload.tokens.totalTokens === 'number');
assert.deepEqual(payload.providers, ['ollama'], 'payload carries the gated provider list');

// 非本机连接必须被拒绝：额度聚合数字不该被局域网读走。
const denied = makeRes();
await route.handler({ method: 'GET', socket: { remoteAddress: '192.168.1.20' } }, denied);
assert.equal(denied.status, 403);

// 非 GET/HEAD 必须被拒绝。
const notAllowed = makeRes();
await route.handler({ method: 'POST', socket: { remoteAddress: '127.0.0.1' } }, notAllowed);
assert.equal(notAllowed.status, 405);

console.log('\nhost smoke OK: route, payload, loopback guard, method guard');
