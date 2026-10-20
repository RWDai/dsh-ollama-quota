/**
 * Ollama 额度面板，host 半。
 *
 * 职责有四件：
 * 1. 从凭据 seam 读出 `OLLAMA_API_KEY`（每次请求重新解析，换 key 不用重启）；
 * 2. 并发抓 `/api/balance`、`/api/usage`、`/api/me`，做一个短 TTL 缓存把
 *    轮询压扁；
 * 3. 在 `/plugin/ollama-quota/state` 上把派生指标以 JSON 交给浏览器半；
 * 4. 首次加载时把 `lib/preset.js` 里的 ollama 供应商 profile 装进 settings，
 *    让 Models 页直接出现一条 ollama 路由（模型、推理档位、vision 全预填）。
 *
 * 刻意不走 `/api/*`：那是 `api-gateway` 的鉴权域，本插件只需要一个只读的
 * 本机端点。也刻意不把 key 带给浏览器——它只出现在本进程的出站请求头里。
 *
 * @module @local/dsh-ollama-quota
 */

import z from '@deepseek-ai/schemastery';
import { credentialRef } from '@deepseek-ai/dsh-credentials';

import { computeMetrics } from './metrics.js';
import { OLLAMA_PROVIDER_ID, OLLAMA_PROVIDER_PRESET } from './preset.js';

/** Cordis 插件名。 */
export const name = 'ollama-quota';

/** 只依赖路由表与凭据 seam；两者缺失时这个插件的意义为零。 */
export const inject = ['webServer', 'credentials'];

/** 配置。 */
export const Config = z.object({
  /** 上游根地址，不带尾部斜杠。 */
  baseURL: z.string().default('https://ollama.com'),
  /** 凭据引用名（环境变量式引用，不是密钥本身）。 */
  apiKeyEnv: z.string().default('OLLAMA_API_KEY'),
  /** 端点路径。 */
  path: z.string().default('/plugin/ollama-quota/state'),
  /** 缓存 TTL（毫秒）。浏览器轮询比这个快时也不会重复打上游。 */
  refreshMs: z.number().step(1).min(1_000).default(60_000),
  /** 单次上游请求超时（毫秒）。 */
  timeoutMs: z.number().step(1).min(500).default(8_000),
  /** 节奏判定的容差（百分点）：差值超过它才算「用多了」或「用少了」。 */
  paceWarnPct: z.number().step(0.1).min(0).default(5),
  /**
   * 生效的供应商 id 列表（llm provider 名，不是模型名）。会话切到列表外的
   * 供应商时浏览器半不渲染 dock，也不轮询；这样同一个 profile 里挂了多个
   * 供应商时，额度条只在自己的账期里出现。
   */
  providers: z.array(z.string()).default(['ollama']),
  /**
   * 首次加载时把 ollama 供应商 profile 写进 settings（模型、推理档位、vision
   * 全预填）。已经能解析到同 id 的供应商时什么都不做，所以手写在
   * cordis.patch.yml 里的配置不会被覆盖。设成 false 可完全关掉这次写入。
   */
  provisionProvider: z.boolean().default(true),
});

/**
 * 生效供应商列表的兜底：schema 会补默认值，但直接调用 apply 的集成方可能没给。
 * @param {string[] | undefined} value 配置里的 providers。
 * @returns {string[]} 至少一个供应商 id。
 */
function normalizeProviders(value) {
  return Array.isArray(value) && value.length > 0 ? value : ['ollama'];
}

/** 认为请求来自本机的地址集合。 */
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * 判断连接是否来自本机。
 *
 * 端点会暴露账号额度的聚合数字，虽然不含密钥，也不该在有人把 web 服务
 * 绑到 0.0.0.0 时被局域网读走。
 *
 * @param {import('node:http').IncomingMessage} req 请求。
 * @returns {boolean} 是否本机连接。
 */
function isLoopback(req) {
  const address = req.socket?.remoteAddress;
  return typeof address === 'string' && LOOPBACK_ADDRESSES.has(address);
}

/**
 * 带上鉴权头请求一个上游端点，并把失败归一化成可判定的结果。
 * @param {string} url 完整地址。
 * @param {object} options 请求选项。
 * @param {string} [options.method] HTTP 方法。
 * @param {string} options.apiKey 凭据值。
 * @param {number} options.timeoutMs 超时。
 * @returns {Promise<{ok: true, body: unknown} | {ok: false, code: string, message: string}>} 结果。
 */
async function requestJson(url, { method = 'GET', apiKey, timeoutMs }) {
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        authorization: `Bearer ${apiKey}`,
        accept: 'application/json',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const timeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    return {
      ok: false,
      code: timeout ? 'upstream-timeout' : 'network',
      message: timeout ? `upstream request timed out after ${timeoutMs}ms` : String(error?.message ?? error),
    };
  }

  if (response.status === 401 || response.status === 403) {
    return { ok: false, code: 'unauthorized', message: `upstream rejected the credential (HTTP ${response.status})` };
  }
  if (!response.ok) {
    return { ok: false, code: 'upstream', message: `upstream responded HTTP ${response.status}` };
  }
  try {
    return { ok: true, body: await response.json() };
  } catch (error) {
    return { ok: false, code: 'upstream-format', message: `upstream body was not JSON: ${String(error?.message ?? error)}` };
  }
}

/**
 * 把一次完整采集收拢成面板载荷。
 *
 * 余额缺失是致命错误（面板的核心数字没了），用量缺失只降级为无 token 数据。
 *
 * @param {object} input 采集上下文。
 * @param {object} input.config 已校验配置。
 * @param {string} input.apiKey 凭据值。
 * @param {number} input.now 采集时刻。
 * @returns {Promise<object>} 供浏览器半渲染的载荷。
 */
async function collect({ config, apiKey, now }) {
  const base = config.baseURL.replace(/\/+$/, '');
  const balancePromise = requestJson(`${base}/api/balance`, {
    apiKey,
    timeoutMs: config.timeoutMs,
  });
  const usagePromise = requestJson(`${base}/api/usage?range=30d`, {
    apiKey,
    timeoutMs: config.timeoutMs,
  });
  const mePromise = requestJson(`${base}/api/me`, {
    apiKey,
    method: 'POST',
    timeoutMs: config.timeoutMs,
  });

  const [balance, usage, me] = await Promise.all([balancePromise, usagePromise, mePromise]);

  if (!balance.ok) {
    return { ok: false, code: balance.code, message: balance.message, fetchedAt: new Date(now).toISOString() };
  }

  const metrics = computeMetrics({
    balance: balance.body,
    usage: usage.ok ? usage.body : undefined,
    plan: me.ok ? me.body?.Plan : undefined,
    now,
    paceWarnPct: config.paceWarnPct,
  });

  return {
    ok: true,
    fetchedAt: new Date(now).toISOString(),
    refreshMs: config.refreshMs,
    providers: normalizeProviders(config.providers),
    degraded: usage.ok ? undefined : { usage: usage.code },
    ...metrics,
  };
}

/**
 * 把 ollama 供应商 profile 装进 settings 的 `llm-pi-ai` 分节。
 *
 * 为什么走 settings 而不是 `cordis.patch.yml`：settings 是 Models 页真正读写
 * 的那一层，写进去以后用户只要在页面上贴一个 key，模型列表、推理档位、图片
 * 输入能力都是现成的；patch 层只能表达静态配置，页面上改不动。
 *
 * 幂等：已经能解析到同 id 的供应商（不管来自 settings 还是 patch）就直接
 * 放弃，绝不覆盖用户已有的配置。settings 不可用（只读部署、插件没装）时
 * 静默跳过——额度条本身不依赖这次写入。
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx 主机上下文。
 * @returns {Promise<void>} 完成。
 */
export async function provisionProvider(ctx) {
  // settings / llm-pi-ai 都是别的插件注册的，加载顺序没有保证，这里重试几次。
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const settings = ctx.get('settings');
    if (settings === undefined) {
      ctx.logger?.debug?.('ollama-quota: settings 服务不可用，跳过供应商预置');
      return;
    }
    let descriptor;
    try {
      descriptor = settings.describe().find((entry) => entry.ns === 'llm-pi-ai');
    } catch (error) {
      ctx.logger?.warn?.(`ollama-quota: 读取 settings 失败：${String(error?.message ?? error)}`);
      return;
    }
    if (descriptor === undefined) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      continue;
    }
    const existing = descriptor.value?.providers?.[OLLAMA_PROVIDER_ID];
    if (existing !== undefined) {
      ctx.logger?.debug?.(`ollama-quota: 供应商 "${OLLAMA_PROVIDER_ID}" 已配置，跳过预置`);
      return;
    }
    try {
      await settings.mutate(
        'llm-pi-ai',
        [{ op: 'set', path: ['providers', OLLAMA_PROVIDER_ID], value: OLLAMA_PROVIDER_PRESET }],
        descriptor.revision,
      );
      ctx.logger?.info?.(
        `ollama-quota: 已把 ${OLLAMA_PROVIDER_PRESET.models.length} 个模型的 "${OLLAMA_PROVIDER_ID}" 供应商预设写入 settings`,
      );
    } catch (error) {
      // 写不进去不是致命错误：额度条照常工作，用户也能手动添加供应商。
      ctx.logger?.warn?.(
        `ollama-quota: 供应商预置写入失败（${String(error?.message ?? error)}）。可以手动在 Models 页添加，或设置 provisionProvider: false 关掉这次写入。`,
      );
    }
    return;
  }
  ctx.logger?.warn?.('ollama-quota: 等不到 llm-pi-ai 的 settings 分节，跳过供应商预置');
}

/**
 * Cordis 插件体：注册只读端点，并按 TTL 缓存采集结果。
 * @param {import('@deepseek-ai/cordis').Context} ctx 主机上下文。
 * @param {object} config 已校验配置。
 */
export function apply(ctx, config) {
  /** 最近一次成功载荷。 */
  let cached;
  /** 进行中的采集，用来合并并发请求。 */
  let inflight;

  /**
   * 取一份载荷，命中新鲜缓存就直接返回。
   * @param {number} now 当前时刻。
   * @returns {Promise<object>} 载荷。
   */
  async function load(now) {
    if (cached !== undefined && now - cached.at < config.refreshMs) return cached.payload;
    if (inflight !== undefined) return inflight;

    inflight = (async () => {
      try {
        const resolved = await ctx.credentials.resolve(credentialRef(config.apiKeyEnv));
        if (resolved === undefined || resolved.value === '') {
          return {
            ok: false,
            code: 'missing-key',
            message: `${config.apiKeyEnv} is not configured`,
            fetchedAt: new Date(now).toISOString(),
          };
        }
        const payload = await collect({ config, apiKey: resolved.value, now });
        // 失败不写缓存，让下一次轮询立刻重试；成功则连降级态一起缓存。
        if (payload.ok) cached = { at: now, payload };
        else if (payload.code === 'missing-key' || payload.code === 'unauthorized') cached = { at: now, payload };
        if (!payload.ok) ctx.logger?.warn?.(`ollama-quota: ${payload.code}: ${payload.message}`);
        return payload;
      } catch (error) {
        ctx.logger?.warn?.(`ollama-quota: unexpected failure: ${String(error?.message ?? error)}`);
        return {
          ok: false,
          code: 'internal',
          message: String(error?.message ?? error),
          fetchedAt: new Date(now).toISOString(),
        };
      } finally {
        inflight = undefined;
      }
    })();

    return inflight;
  }

  /**
   * 失败载荷也要带 providers：浏览器半在拿到第一份数据之前就要决定是否显示，
   * 而配置里的供应商列表只有 host 知道。
   * @param {object} payload 载荷。
   * @returns {object} 附带 providers 的载荷。
   */
  function withProviders(payload) {
    return payload.providers === undefined ? { ...payload, providers: normalizeProviders(config.providers) } : payload;
  }

  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: config.path,
      handler: async (req, res) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.writeHead(405, { allow: 'GET, HEAD' });
          res.end();
          return;
        }
        if (!isLoopback(req)) {
          res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, code: 'forbidden', message: 'loopback only' }));
          return;
        }
        const payload = withProviders(await load(Date.now()));
        const body = JSON.stringify(payload);
        res.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
          'content-length': Buffer.byteLength(body),
        });
        if (req.method === 'HEAD') res.end();
        else res.end(body);
      },
    }),
  );

  // 供应商预置：独立 effect，失败只告警，不拖垮额度条本身。
  if (config.provisionProvider) {
    ctx.effect(() => {
      void provisionProvider(ctx);
      return () => {};
    }, 'ollama-quota: provider preset');
  }
}
