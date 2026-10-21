/**
 * Ollama 额度面板，host 半。
 *
 * 职责有五件：
 * 1. 从凭据 seam 读出 `OLLAMA_API_KEY`（每次请求重新解析，换 key 不用重启）；
 * 2. 并发抓 `/api/balance`、`/api/usage`（带 group_by=model）、`/api/me`，一个短
 *    TTL 缓存把轮询压扁；
 * 3. 低频抓 `https://ollama.com/pricing` 的模型价目表（官方没有价格 JSON API），
 *    长缓存，供明细页展示「当前模型价格 + 峰谷价」；
 * 4. 在 `/plugin/ollama-quota/state` 上把派生指标以 JSON 交给浏览器半；
 * 5. 首次加载时把 `lib/preset.js` 里的 ollama 供应商 profile 装进 settings，
 *    让 Models 页直接出现一条 ollama 路由（模型、推理档位、vision 全预填）。
 *
 * 刻意不走 `/api/*`：那是 `api-gateway` 的鉴权域，本插件只需要一个只读端点。
 * 准入交给组合的 `connection` 服务：本机连接直接放行，其余来源要过 Host/Origin
 * 栅栏与浏览器会话校验（见 {@link rejectionFor}）。也刻意不把 key 带给浏览器——
 * 它只出现在本进程的出站请求头里。
 *
 * @module @local/dsh-ollama-quota
 */

import z from '@deepseek-ai/schemastery';
import { credentialRef } from '@deepseek-ai/dsh-credentials';

import { computeMetrics, parsePricebookHtml } from './metrics.js';
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
  /**
   * 模型价目表的缓存 TTL（毫秒）。价目来自 ollama.com/pricing 的 HTML 表格，
   * 变动频率低且没有官方 JSON 接口，默认 12 小时；抓取失败沿用上一份。
   */
  priceTtlMs: z.number().step(1).min(300_000).default(12 * 3_600_000),
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
 * 端点会暴露账号额度的聚合数字，虽然不含密钥，也不该随便被局域网读走。但从
 * `dsh web` 只能绑一个具体地址（不允许 0.0.0.0）之后，loopback 不再是「同一个
 * 人」的同义词：浏览器跑在同一台机器上、访问的却是 `http://<lan-ip>:3080` 时，
 * `remoteAddress` 就是那个局域网地址。所以 loopback 只是免鉴权的快路径，其余
 * 来源交给 {@link rejectionFor} 判定。
 *
 * @param {import('node:http').IncomingMessage} req 请求。
 * @returns {boolean} 是否本机连接。
 */
function isLoopback(req) {
  const address = req.socket?.remoteAddress;
  return typeof address === 'string' && LOOPBACK_ADDRESSES.has(address);
}

/**
 * 取组合里的 `connection` 服务。
 *
 * 它是**可选**依赖，不能写进 `inject`：没装 `client-connection` 的 profile 也
 * 要能加载额度条。cordis 的 `get()` 是显式查表，服务缺席时返回 undefined。
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx 主机上下文。
 * @returns {object | undefined} 连接服务。
 */
function connectionOf(ctx) {
  try {
    if (typeof ctx.get === 'function') return ctx.get('connection');
    return Reflect.get(ctx, 'connection');
  } catch {
    return undefined;
  }
}

/**
 * 只读端点的准入判定。
 *
 * 本机连接永远放行；其余来源交给组合的 `connection.requestRejection()`。那个
 * 方法做两件事：Host/Origin 栅栏（绑定地址本身是可信 authority，挡掉 DNS
 * rebinding 与跨站调用）和浏览器会话 cookie 校验（`dsh web` 启动时打印的带
 * `?token=` 地址换来的登录态）。它与内置插件 `open-in-app` 用的是同一套原语。
 *
 * 返回 `undefined` 表示放行，数字是拒绝状态码（401 未登录 / 403 来源不可信）。
 * 没装 connection 服务的 profile 保持旧的 loopback-only 行为；查表失败、
 * 调用抛错或返回了约定之外的值都按 403 处理（fail closed）。
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx 主机上下文。
 * @param {import('node:http').IncomingMessage} req 请求。
 * @returns {number | undefined} 拒绝状态码，undefined 表示放行。
 */
function rejectionFor(ctx, req) {
  if (isLoopback(req)) return undefined;
  const connection = connectionOf(ctx);
  if (
    connection === undefined ||
    connection === null ||
    typeof connection.requestRejection !== 'function'
  ) {
    return 403;
  }
  try {
    const rejection = connection.requestRejection(req);
    if (rejection === undefined) return undefined;
    // 不能写成 `?? 403`：那会把「放行」的 undefined 也吃成拒绝。
    return typeof rejection === 'number' ? rejection : 403;
  } catch {
    return 403;
  }
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
 * 抓一份模型价目表。
 *
 * 价格没有 JSON 接口（`/api/tags`、`/api/show` 里都没有），只存在于 pricing 页的
 * HTML 表格里，所以这里抓整页交给 `parsePricebookHtml` 提取。页面是公开的，
 * 不带鉴权头。失败归类成与 upstream 相同的 code 集。
 *
 * @param {object} config 已校验配置。
 * @returns {Promise<{ok: true, pricebook: object} | {ok: false, code: string, message: string}>} 结果。
 */
async function fetchPricebook(config) {
  const base = config.baseURL.replace(/\/+$/, '');
  let response;
  try {
    response = await fetch(`${base}/pricing`, {
      headers: { accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(config.timeoutMs),
    });
  } catch (error) {
    const timeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    return {
      ok: false,
      code: timeout ? 'upstream-timeout' : 'network',
      message: timeout ? `price page timed out after ${config.timeoutMs}ms` : String(error?.message ?? error),
    };
  }
  if (!response.ok) {
    return { ok: false, code: 'upstream', message: `pricing page responded HTTP ${response.status}` };
  }
  const pricebook = parsePricebookHtml(await response.text());
  if (pricebook === undefined) {
    return { ok: false, code: 'upstream-format', message: 'pricing page parse produced no models' };
  }
  return { ok: true, pricebook };
}

/**
 * 把一次完整采集收拢成面板载荷。
 *
 * 余额缺失是致命错误（面板的核心数字没了），用量与价表缺失只降级：
 * 没有用量就没有 token 数据，没有价表就只剩实测口径的效率指标。
 *
 * @param {object} input 采集上下文。
 * @param {object} input.config 已校验配置。
 * @param {string} input.apiKey 凭据值。
 * @param {object} [input.pricebook] 最新价目表（可能 undefined）。
 * @param {number} input.now 采集时刻。
 * @returns {Promise<object>} 供浏览器半渲染的载荷。
 */
async function collect({ config, apiKey, pricebook, now }) {
  const base = config.baseURL.replace(/\/+$/, '');
  const balancePromise = requestJson(`${base}/api/balance`, {
    apiKey,
    timeoutMs: config.timeoutMs,
  });
  const usagePromise = requestJson(`${base}/api/usage?range=30d&group_by=model`, {
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
    pricebook,
    now,
    paceWarnPct: config.paceWarnPct,
  });

  return {
    ok: true,
    fetchedAt: new Date(now).toISOString(),
    refreshMs: config.refreshMs,
    providers: normalizeProviders(config.providers),
    degraded: {
      usage: usage.ok ? undefined : usage.code,
      // 只在从未成功拿到价目表时才算降级；旧缓存照用。
      pricing: pricebook === undefined ? 'pricebook-empty' : undefined,
    },
    ...metrics,
  };
}

/**
 * 把 ollama 供应商 profile 装进 settings 的 `llm-pi-ai` 分节。
 *
 * 为什么走 settings：settings 是 Models 页真正读写的那一层，写进去以后用户
 * 只要在页面上贴一个 key，模型列表、推理档位、图片输入能力都是现成的。本版本
 * 的 settings 文档就是 profile 的 `cordis.patch.yml`，所以落地形态与手工在 patch
 * 里写一条 `- id: llm-pi-ai` 等价，页面上后续也能改。
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
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      continue;
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

  /** 价目表缓存：值 + 最近一次尝试时刻。失败沿用旧值，且 10 分钟内不重试。 */
  const PRICEBOOK_RETRY_MS = 10 * 60_000;
  // schemastery 会补默认值；但 raw config 的调用方（集成测试、smoke）可能没带这个键。
  const pricebookTtl = typeof config.priceTtlMs === 'number' && config.priceTtlMs > 0 ? config.priceTtlMs : 12 * 3_600_000;
  let pricebook;
  let pricebookAt = 0;

  /**
   * 取价目表：TTL 内直接用缓存；失败时保留旧值并按 {@link PRICEBOOK_RETRY_MS} 退避。
   * @param {number} now 当前时刻。
   * @returns {Promise<object | undefined>} 价目表（从未成功时 undefined）。
   */
  async function loadPricebook(now) {
    if (pricebook !== undefined && now - pricebookAt < pricebookTtl) return pricebook;
    if (now - pricebookAt < PRICEBOOK_RETRY_MS) return pricebook;
    pricebookAt = now;
    const result = await fetchPricebook(config);
    if (result.ok) {
      pricebook = result.pricebook;
    } else {
      // 抓不到价表不是致命错误：额度与效率照常展示，只是没有目录价。
      ctx.logger?.warn?.(`ollama-quota: 价目表抓取失败（${result.code}: ${result.message}），沿用旧表`);
    }
    return pricebook;
  }

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
        const book = await loadPricebook(now);
        const payload = await collect({ config, apiKey: resolved.value, pricebook: book, now });
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
        const rejection = rejectionFor(ctx, req);
        if (rejection !== undefined) {
          const rejectionBody = JSON.stringify({
            ok: false,
            code: 'forbidden',
            message: 'loopback or an authenticated browser session required',
          });
          res.writeHead(rejection, {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
            'content-length': Buffer.byteLength(rejectionBody),
          });
          if (req.method === 'HEAD') res.end();
          else res.end(rejectionBody);
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

  // 供应商预置：用 ctx.inject 等 settings 服务就绪再动，绝不抢在它提供之前读。
  // 子 fiber 随本插件一起销毁；失败只告警，不拖垮额度条本身。
  if (config.provisionProvider) {
    ctx.inject(['settings'], (scoped) => {
      void provisionProvider(scoped);
    });
  }
}
