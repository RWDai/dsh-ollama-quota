/**
 * 只读端点准入的回归测试。
 *
 * 事故背景：`dsh web` 只能绑一个具体地址，浏览器访问 `http://<lan-ip>:3080`
 * 时 socket 对端不是 127.0.0.1，端点原先那句「只认 loopback」直接 403；浏览器
 * 半又把 403 归成 network，额度条于是永远显示「无法连接 ollama.com」。
 *
 * 这里用 fetch 替身 + 假 ctx/req/res 驱动真实的 `apply()` handler，不启动
 * DSH、不联网。重点是：放行必须真的打到上游，拒绝必须一次上游都不打，且
 * 响应里永远不出现 key。
 *
 * 运行：`node --test test/*.test.mjs`
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { apply, inject } from '../lib/index.js';

/** 只应出现在 host 进程出站请求头里的测试 key。 */
const API_KEY = 'ollama-test-key-never-in-the-response';

/** 假上游根地址。 */
const BASE_URL = 'https://ollama-quota.test';

const BALANCE = {
  included: {
    allowance_usd: 60,
    balance_usd: 59.5,
    period: { from: '2026-10-01T00:00:00.000Z', until: '2026-11-01T00:00:00.000Z' },
  },
  purchased: { balance_usd: 0 },
};

const USAGE = {
  totals: {
    request_count: 42,
    usage_usd: 0.5,
    input_tokens: 1_000,
    cached_input_tokens: 0,
    output_tokens: 200,
  },
};

/**
 * 一个 JSON 200 响应替身。
 * @param {unknown} body JSON 体。
 * @returns {object} fetch Response 的子集。
 */
function jsonResponse(body) {
  return { ok: true, status: 200, json: async () => body };
}

/**
 * 装上只认三个上游端点的 fetch 替身，并记录每一次出站请求。
 * @returns {{calls: Array<{url: string, init: object}>, restore: () => void}} 调用记录与还原函数。
 */
function installUpstream() {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    const { pathname } = new URL(url);
    if (pathname === '/api/balance') return jsonResponse(BALANCE);
    if (pathname === '/api/usage') return jsonResponse(USAGE);
    if (pathname === '/api/me') return jsonResponse({ Plan: 'pro' });
    throw new Error(`unexpected upstream request: ${url}`);
  };
  return {
    calls,
    restore() {
      globalThis.fetch = original;
    },
  };
}

/**
 * 用假 ctx 跑一次 `apply()`，返回注册出来的 handler。
 * @param {object} [services] 可选服务替身。
 * @param {object} [services.connection] `connection` 服务替身。
 * @param {Function} [services.get] 自定义 `ctx.get`。
 * @returns {Function} 路由 handler。
 */
function makeApp({ connection, get: getService } = {}) {
  let handler;
  const ctx = {
    effect: (fn) => fn(),
    get: getService ?? ((name) => (name === 'connection' ? connection : undefined)),
    credentials: { resolve: async () => ({ value: API_KEY }) },
    webServer: {
      register: (definition) => {
        handler = definition.handler;
        return () => {};
      },
    },
    logger: { info() {}, warn() {}, debug() {} },
  };
  apply(ctx, {
    baseURL: BASE_URL,
    apiKeyEnv: 'OLLAMA_API_KEY',
    path: '/plugin/ollama-quota/state',
    refreshMs: 60_000,
    timeoutMs: 1_000,
    paceWarnPct: 5,
    providers: ['ollama'],
    provisionProvider: false,
  });
  assert.equal(typeof handler, 'function', 'apply() must register the endpoint handler');
  return handler;
}

/**
 * 造一个请求。
 * @param {object} [options] 请求选项。
 * @param {string} [options.method] HTTP 方法。
 * @param {string} [options.address] socket 对端地址。
 * @param {object} [options.headers] 请求头。
 * @returns {object} IncomingMessage 的子集。
 */
function makeRequest({ method = 'GET', address = '192.168.31.170', headers = {} } = {}) {
  return { method, socket: { remoteAddress: address }, headers };
}

/**
 * 造一个最小响应，记录状态码、响应头与响应体。
 * @returns {object} ServerResponse 的子集。
 */
function makeResponse() {
  return {
    statusCode: undefined,
    headers: undefined,
    body: '',
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(chunk) {
      if (chunk !== undefined) this.body += chunk;
    },
  };
}

/**
 * 驱动 handler 直到响应结束。
 * @param {Function} handler 路由 handler。
 * @param {object} req 请求替身。
 * @returns {Promise<object>} 响应替身。
 */
async function call(handler, req) {
  const res = makeResponse();
  await handler(req, res);
  return res;
}

/**
 * 断言这是统一的拒绝响应。
 * @param {object} res 响应替身。
 * @param {number} status 期望状态码。
 */
function assertRejected(res, status) {
  assert.equal(res.statusCode, status);
  assert.equal(res.headers['content-type'], 'application/json; charset=utf-8');
  assert.equal(res.headers['cache-control'], 'no-store');
  const payload = JSON.parse(res.body);
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'forbidden');
  assert.ok(!res.body.includes(API_KEY), 'rejection body must not contain the key');
}

/**
 * 假 connection 服务：记录被查验的请求，按预设结果回答。
 * @param {number | undefined | Error} rejection 拒绝码、放行（undefined）或要抛出的错误。
 * @returns {object} `connection` 服务替身。
 */
function makeConnection(rejection) {
  const seen = [];
  return {
    seen,
    requestRejection(req) {
      seen.push(req);
      if (rejection instanceof Error) throw rejection;
      return rejection;
    },
  };
}

test('loopback is admitted without the optional connection service', async () => {
  assert.deepEqual(
    [...inject],
    ['webServer', 'credentials'],
    'connection must stay out of inject: it is an optional service',
  );
  for (const address of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
    const handler = makeApp();
    const upstream = installUpstream();
    try {
      const res = await call(handler, makeRequest({ address }));
      assert.equal(res.statusCode, 200, `${address} must be admitted`);
      assert.equal(res.headers['cache-control'], 'no-store');
      const payload = JSON.parse(res.body);
      assert.equal(payload.ok, true);
      assert.deepEqual(payload.providers, ['ollama']);
      assert.equal(payload.plan, 'pro');
      assert.equal(payload.remainingUsd, 59.5);
      assert.equal(upstream.calls.length, 3, 'an admitted read must reach all three upstream endpoints');
      assert.ok(!res.body.includes(API_KEY), 'response must not contain the key');
    } finally {
      upstream.restore();
    }
  }
});

test('a LAN peer without the connection service keeps loopback-only', async () => {
  const handler = makeApp();
  const upstream = installUpstream();
  try {
    const res = await call(handler, makeRequest());
    assertRejected(res, 403);
    assert.equal(upstream.calls.length, 0, 'a rejected request must never touch the upstream');
  } finally {
    upstream.restore();
  }
});

test('the connection service decides 401/403 rejections for LAN peers', async () => {
  for (const status of [401, 403]) {
    const connection = makeConnection(status);
    const handler = makeApp({ connection });
    const upstream = installUpstream();
    try {
      const req = makeRequest({ headers: { host: '192.168.31.170:3080' } });
      const res = await call(handler, req);
      assertRejected(res, status);
      assert.equal(connection.seen.length, 1, 'the gate must consult connection.requestRejection');
      assert.equal(connection.seen[0], req);
      assert.equal(upstream.calls.length, 0, 'a rejected request must never touch the upstream');
    } finally {
      upstream.restore();
    }
  }
});

test('an authenticated browser session is admitted and still never sees the key', async () => {
  const connection = makeConnection(undefined);
  const handler = makeApp({ connection });
  const upstream = installUpstream();
  try {
    const req = makeRequest({
      headers: { host: '192.168.31.170:3080', cookie: 'dsh-auth-test=stub' },
    });
    const res = await call(handler, req);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'application/json; charset=utf-8');
    const payload = JSON.parse(res.body);
    assert.equal(payload.ok, true);
    assert.equal(payload.plan, 'pro');
    assert.equal(connection.seen.length, 1);
    assert.equal(upstream.calls.length, 3);
    for (const { init } of upstream.calls) {
      assert.equal(init.headers.authorization, `Bearer ${API_KEY}`, 'the key travels only in the outbound header');
    }
    assert.ok(!res.body.includes(API_KEY), 'response must not contain the key');
  } finally {
    upstream.restore();
  }
});

test('a broken connection service fails closed without touching the upstream', async () => {
  const broken = [
    { connection: makeConnection(new Error('boom')) },
    { connection: { requestRejection: 'not-a-function' } },
    { connection: { requestRejection() { return '403'; } } },
    { connection: null },
    { get() { throw new Error('service lookup failed'); } },
  ];
  const upstream = installUpstream();
  try {
    for (const services of broken) {
      const handler = makeApp(services);
      const res = await call(handler, makeRequest());
      assertRejected(res, 403);
    }
    assert.equal(upstream.calls.length, 0, 'a rejected request must never touch the upstream');
  } finally {
    upstream.restore();
  }
});

test('only GET/HEAD pass the method guard, and HEAD carries no body', async () => {
  const handler = makeApp();
  const upstream = installUpstream();
  try {
    const post = await call(handler, makeRequest({ method: 'POST', address: '127.0.0.1' }));
    assert.equal(post.statusCode, 405);
    assert.equal(post.headers.allow, 'GET, HEAD');
    assert.equal(post.body, '');
    assert.equal(upstream.calls.length, 0, 'a wrong method must never touch the upstream');

    const head = await call(handler, makeRequest({ method: 'HEAD', address: '127.0.0.1' }));
    assert.equal(head.statusCode, 200);
    assert.equal(head.body, '', 'HEAD must not carry a body');
    assert.ok(Number(head.headers['content-length']) > 0, 'HEAD should advertise the GET body length');
    assert.equal(upstream.calls.length, 3);
  } finally {
    upstream.restore();
  }
});
