/**
 * 供应商预置的单测：不打网络，用 settings 服务替身验证幂等与失败降级。
 *
 * 运行：`node --test test/*.test.mjs`
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { provisionProvider } from '../lib/index.js';
import { OLLAMA_PROVIDER_ID, OLLAMA_PROVIDER_PRESET } from '../lib/preset.js';

/** 造一个 settings 替身。 */
function fakeSettings({ provider, revision = 7, failMutate = false }) {
  const calls = [];
  return {
    calls,
    describe: () => [
      { ns: 'llm-pi-ai', revision, value: provider === undefined ? { providers: {} } : { providers: { [OLLAMA_PROVIDER_ID]: provider } } },
    ],
    async mutate(ns, ops, expectedRevision) {
      if (failMutate) throw new Error('settings provider is read-only');
      calls.push({ ns, ops, expectedRevision });
    },
  };
}

/** 造一个只带 logger 的 ctx。 */
function fakeCtx(settings) {
  const logs = [];
  return {
    logs,
    logger: {
      info: (message) => logs.push(['info', message]),
      warn: (message) => logs.push(['warn', message]),
      debug: (message) => logs.push(['debug', message]),
    },
    get: (service) => (service === 'settings' ? settings : undefined),
  };
}

test('供应商不存在时，把 preset 写进 llm-pi-ai 分节', async () => {
  const settings = fakeSettings({ provider: undefined });
  await provisionProvider(fakeCtx(settings));
  assert.equal(settings.calls.length, 1);
  const [call] = settings.calls;
  assert.equal(call.ns, 'llm-pi-ai');
  assert.equal(call.expectedRevision, 7, '写回必须带上读到的 revision');
  assert.deepEqual(call.ops, [
    { op: 'set', path: ['providers', OLLAMA_PROVIDER_ID], value: OLLAMA_PROVIDER_PRESET },
  ]);
});

test('供应商已存在时一个字都不写', async () => {
  const settings = fakeSettings({ provider: { baseURL: 'https://example.invalid/v1' } });
  await provisionProvider(fakeCtx(settings));
  assert.equal(settings.calls.length, 0, '用户已有配置时不得覆盖');
});

test('写失败只告警，不抛错', async () => {
  const settings = fakeSettings({ provider: undefined, failMutate: true });
  const ctx = fakeCtx(settings);
  await provisionProvider(ctx);
  assert.equal(settings.calls.length, 0);
  const warn = ctx.logs.find(([, message]) => message.includes('供应商预置写入失败'));
  assert.ok(warn, '失败必须留一条可读的告警');
  assert.match(warn[1], /provisionProvider: false/, '告警要告诉用户怎么关掉');
});

test('settings 服务缺失时静默跳过', async () => {
  const ctx = {
    logs: [],
    logger: { info: () => {}, warn: (m) => ctx.logs.push(m), debug: () => {} },
    get: () => undefined,
  };
  await provisionProvider(ctx);
  assert.equal(ctx.logs.length, 0, '没有 settings 服务不是用户的问题，不该报警');
});

test('preset 自身满足 llm-pi-ai 的 profile 约束', () => {
  assert.equal(typeof OLLAMA_PROVIDER_PRESET.baseURL, 'string');
  assert.match(OLLAMA_PROVIDER_PRESET.baseURL, /^https:\/\/ollama\.com\/v1$/);
  assert.equal(OLLAMA_PROVIDER_PRESET.api, 'openai-responses');
  assert.equal(OLLAMA_PROVIDER_PRESET.apiKeyEnv, 'OLLAMA_API_KEY');
  assert.ok(OLLAMA_PROVIDER_PRESET.models.length > 0);
  const ids = new Set();
  for (const model of OLLAMA_PROVIDER_PRESET.models) {
    assert.equal(typeof model.id, 'string');
    assert.ok(model.id.length > 0);
    assert.ok(!ids.has(model.id), `重复的模型 id: ${model.id}`);
    ids.add(model.id);
    if (model.input !== undefined) {
      assert.deepEqual(model.input, ['text', 'image'], 'input 只允许 text/image，且 image 必须在后');
    }
    if (model.reasoningEfforts !== undefined) {
      for (const [level, wire] of Object.entries(model.reasoningEfforts)) {
        assert.ok(['minimal', 'low', 'medium', 'high', 'max'].includes(level), `未知档位 ${level}`);
        assert.equal(typeof wire, 'string');
      }
      assert.equal(model.reasoningEfforts.off, undefined, '不声明 off：会让默认请求变成关闭思考');
    }
  }
});
