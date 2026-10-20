/**
 * 从 Ollama Cloud 的 /api/show 生成 lib/preset.js。
 *
 * 生成的产物是**提交进仓库的数据文件**（CI 不联网），这个脚本只在维护时手动跑：
 *   OLLAMA_API_KEY=... node tools/generate-preset.mjs
 *
 * 规则（都是踩过坑之后定下来的）：
 * - 只把 Ollama 真正支持的档位映射成 DSH 的档位；DSH 的 minimal 档没有对应就跳过。
 * - **不声明 off**：pi-ai 的 openai-responses 分支在「没有指定档位」时，如果
 *   thinkingLevelMap.off 存在就会发 effort=none，等于把默认行为改成「关思考」。
 * - input 只给 capabilities 里真有 vision 的模型；over-claim 会让请求在消息落盘后
 *   才被上游拒绝。
 * - contextWindow 取 model_info 里的 context_length，避免用插件的默认值。
 */

import { writeFileSync } from 'node:fs';

const BASE = 'https://ollama.com';
const KEY = process.env.OLLAMA_API_KEY ?? '';
if (KEY === '') {
  console.error('需要 OLLAMA_API_KEY 环境变量');
  process.exit(1);
}

/**
 * 不声明 vision 的模型：Ollama 的 capabilities 说支持，但实测读图不可靠
 * （把纯蓝图答成 Brown / Black）。over-claim 不会报错，只会让用户拿到
 * 看似自信的错误答案，所以这里按实测结果排除。
 */
const VISION_EXCLUSIONS = new Map([['minimax-m3', '实测把蓝色图答成 Brown/Black']]);

/** DSH 认识的推理档位，顺序即 UI 顺序。 */
const DSH_LEVELS = ['minimal', 'low', 'medium', 'high', 'max'];

/** 拉一个模型的元数据。 */
async function show(model) {
  const res = await fetch(`${BASE}/api/show`, {
    method: 'POST',
    headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model }),
  });
  if (!res.ok) throw new Error(`${model}: HTTP ${res.status}`);
  return res.json();
}

/**
 * 把 Ollama 的 thinking 档位映射成 DSH 的 reasoningEfforts。
 * @param {unknown[]} values Ollama 的档位值（可能含 false）。
 * @returns {Record<string, string> | undefined} 映射；无可用档位时 undefined。
 */
function reasoningEffortsOf(values) {
  const wire = values.filter((value) => typeof value === 'string');
  const mapped = {};
  for (const level of DSH_LEVELS) {
    if (wire.includes(level)) mapped[level] = level;
    // xhigh 这类 DSH 没有的档位，绑到 max 上（只在不冲突时）
    else if (level === 'max' && !wire.includes('max') && wire.includes('xhigh')) mapped.max = 'xhigh';
  }
  return Object.keys(mapped).length > 0 ? mapped : undefined;
}

/** 提取上下文窗口。 */
function contextWindowOf(info) {
  for (const [key, value] of Object.entries(info ?? {})) {
    if (key.endsWith('.context_length') && typeof value === 'number' && value > 0) return value;
  }
  return undefined;
}

const models = process.argv.slice(2);
if (models.length === 0) {
  console.error('用法: node tools/generate-preset.mjs <model> [model...]');
  process.exit(1);
}

const entries = [];
for (const model of models) {
  const meta = await show(model);
  if (!(meta.capabilities ?? []).includes('completion')) {
    console.warn(`跳过 ${model}: 不是 chat 模型（capabilities=${(meta.capabilities ?? []).join(',')}）`);
    continue;
  }
  const entry = { id: model, name: model };
  const contextWindow = contextWindowOf(meta.model_info);
  if (contextWindow !== undefined) entry.contextWindow = contextWindow;
  const visionExcluded = VISION_EXCLUSIONS.get(model);
  if ((meta.capabilities ?? []).includes('vision') && visionExcluded === undefined) entry.input = ['text', 'image'];
  if (visionExcluded !== undefined) console.warn(`${model}: 不声明 vision —— ${visionExcluded}`);
  const efforts = reasoningEffortsOf(meta.thinking?.values ?? []);
  if (efforts !== undefined) entry.reasoningEfforts = efforts;
  entries.push(entry);
}

const body = `/**
 * Ollama Cloud 的供应商预设——**由 tools/generate-preset.mjs 生成，别手改**。
 *
 * 数据来源：POST /api/show 的 capabilities、thinking.values、model_info.*.context_length。
 * 重新生成：\`OLLAMA_API_KEY=... node tools/generate-preset.mjs ${models.join(' ')}\`
 */

/** 供应商路由 id（也是凭据引用的词干：OLLAMA_API_KEY）。 */
export const OLLAMA_PROVIDER_ID = "ollama";

/** 装到 llm-pi-ai 里的完整供应商 profile。 */
export const OLLAMA_PROVIDER_PRESET = ${JSON.stringify(
  {
    displayName: 'Ollama Cloud',
    baseURL: `${BASE}/v1`,
    api: 'openai-responses',
    apiKeyEnv: 'OLLAMA_API_KEY',
    models: entries,
  },
  null,
  2,
)};
`;

writeFileSync(new URL('../lib/preset.js', import.meta.url), body);
console.log(`写入 lib/preset.js：${entries.length} 个模型`);
for (const entry of entries) {
  const caps = [entry.input ? 'vision' : null, entry.reasoningEfforts ? Object.keys(entry.reasoningEfforts).join('/') : null]
    .filter(Boolean)
    .join(' · ');
  console.log(`  ${entry.id.padEnd(26)} ${caps}`);
}
