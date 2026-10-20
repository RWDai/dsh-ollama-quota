# dsh-ollama-quota

[![ci](https://github.com/RWDai/dsh-ollama-quota/actions/workflows/ci.yml/badge.svg)](https://github.com/RWDai/dsh-ollama-quota/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

DSH 插件：在输入框上方挂一条 **Ollama Cloud 套餐额度 bar**，展开后是明细面板——
剩余额度、使用百分比、本期 token 用量（输入 / 缓存命中 / 输出）、到期时间，以及
「按到期日算，现在是用多了还是用少了」的节奏预测。

只在你自己的 Ollama 供应商下出现：会话切到其它供应商时，bar 不渲染，也不发请求。

插件同时兼任 **ollama 供应商的安装器**：首次加载时把一份完整的 `llm-pi-ai` 供应商
profile 写进 settings（端点、协议、key 引用、22 个模型及其推理档位 / 图片输入能力），
于是 Models 页里直接就有 `ollama` 这条路由，你只需要在里面贴一个 API key。

```
▍Ollama 额度   $59.76 / $60.00 · 0.4% · 节奏正常 · 24.56M tok · 11-20 到期   ⌄
```

展开后：进度条（已用 vs 时间进度竖线标记）、剩余/总额度/到期/剩余天数/日均消耗/
购买额度、token 四件套 + 请求数、最近 30 天日消费柱图、节奏预测（到期预计消耗、
跑道天数、是否会在到期前用完）、更新时间与刷新按钮。

## 给 AI 的一键安装提示词

把下面整段贴给你的 coding agent（DSH / Claude Code / Codex 都行），它会自己定位
profile、装包、注册配置并校验：

```text
请把 DSH 插件 dsh-ollama-quota（https://github.com/RWDai/dsh-ollama-quota）装到我这台机器上。
按顺序做，每一步失败都要停下来告诉我原因，不要猜着往下走：

1. 定位 profile 目录：若 $DSH_HOME 有值用 "$DSH_HOME/profiles/web"，否则用 "$HOME/.dsh/profiles/web"。
   该目录下必须同时存在 package.json 和 cordis.patch.yml；缺任何一个就停下问我。

2. 安装插件（优先 a，失败再退 b，再失败退 c）：
   a. 在 profile 目录执行：pnpm add github:RWDai/dsh-ollama-quota
      （没有 pnpm 就 npm i github:RWDai/dsh-ollama-quota）
   b. git clone https://github.com/RWDai/dsh-ollama-quota <profile>/plugins/dsh-ollama-quota
      然后 ln -sfn ../plugins/dsh-ollama-quota <profile>/node_modules/dsh-ollama-quota
   c. git clone 到任意目录，软链进 <profile>/node_modules/dsh-ollama-quota，
      并给仓库补一个 node_modules 软链指向 <profile 的上一级>/node_modules
      （否则插件 import '@deepseek-ai/schemastery' 这类 peer 依赖会解析失败）。

3. 注册插件：读取 <profile>/cordis.patch.yml。
   - 如果已经有 "id: ollama-quota"，跳过，不要写重复项；
   - 否则在文件末尾追加（注意是根级 insert，缩进两格开始）：

   - insert:
       - id: ollama-quota
         name: dsh-ollama-quota
         config:
           providers:
             - ollama
           refreshMs: 60000
           paceWarnPct: 5

   说明：这里的 providers 是「额度条在哪些供应商下显示」，不是供应商本身的配置。
   供应商（端点/协议/22 个模型/推理档位/图片能力）由插件启动时自动写进 settings，
   你不需要手工添加供应商，也不要去填 baseURL。

4. 校验配置能组合（退出码必须是 0，且能看到该条目）：
   dsh --profile web --dump-config | grep -A 7 "id: ollama-quota"

5. 让用户重启 dsh web（插件代码不热更，必须重启），然后校验端点：
   curl -s http://127.0.0.1:3080/plugin/ollama-quota/state
   - 返回 {"ok":true,...,"providers":["ollama"],...} → 成功；
   - 返回 code=missing-key → 还差 API key，进入第 6 步；
   - 返回 code=unauthorized → key 失效，让用户去 https://ollama.com 重新取一个；
   - 401/404 → 端口或路径不对，先确认 dsh web 实际监听的地址。

6. 配置 API key：让用户打开 DSH 的 Models 设置页，那里应该已经有一条 ollama 路由
   （插件预置的，模型列表已填好），在卡片里粘贴 Ollama Cloud 的 key 并保存即可。
   - 如果没看到这条路由：确认插件已加载、且 profile 里没有别的 llm-pi-ai 配置把它顶掉；
   - 如果用户不想让插件自动写 settings，可以在 patch 里加 provisionProvider: false，
     然后按传统方式手工添加供应商（Provider ID: ollama、端点 https://ollama.com/v1、
     协议 openai-responses、key 引用 OLLAMA_API_KEY）。

7. 最后向用户说明：模型选到 ollama 供应商时，输入框上方会出现额度条（点开是明细）；
   切到其它供应商时它会自动消失并停止轮询。Models 页里 ollama 带「自定义」标签是正常的
   ——pi-ai 的内置 catalog 里没有 ollama 这个键。

环境要求：DSH >= 0.2.0-rc.2、Node >= 20、一个 Ollama Cloud（Pro 及以上）的 API key。
```

## 它同时把 ollama 配成供应商

新装的 DSH 里本来没有 ollama 这个供应商（pi-ai 的内置 catalog 里没有），手动添加要
填 Provider ID、端点、协议，还得逐个补模型和推理档位。本插件把这件事做掉了：

- 首次加载时，如果 `llm-pi-ai` 分节里**还解析不到** `ollama`，就把
  `lib/preset.js` 里的 profile 通过 `ctx.settings.mutate` 写进 settings 层。
  本版本的 settings 文档就是 profile 的 `cordis.patch.yml`（`dsh-settings` +
  config-editor 那一套），所以写入结果等价于手工加一条 `- id: llm-pi-ai` 覆盖条目；
  Models 页后续的改动也落在同一处，两边不会打架；
- 写入内容：`baseURL: https://ollama.com/v1`、`api: openai-responses`、
  `apiKeyEnv: OLLAMA_API_KEY`、22 个模型（每个带 `contextWindow`、能思考的带
  `reasoningEfforts`、真能看图的带 `input: [text, image]`）；
- 于是 Models 页出现一条 `ollama` 路由，绿色/红色点反映 `OLLAMA_API_KEY` 的状态，
  你在卡片里贴 key 就完事；
- **幂等**：只要该 id 已经能解析到（不管来自 settings 还是 `cordis.patch.yml`），
  一个字都不写，绝不覆盖你已有的配置；
- **可关**：`provisionProvider: false`；
- **不致命**：settings 只读或写失败只打一条警告，额度条照常工作。

两个已知的观感问题，都不是 bug：

- Models 页里这条路由会带 **自定义** 标签——那是 pi-ai catalog 里确实没有 ollama
  这个键，DSH 如实标注；字段仍然是全预填的。
- 预置只在「还解析不到 ollama」时发生。你要是像现在这样在 `cordis.patch.yml`
  里手写了供应商，插件会跳过；想让配置回到 settings（从而能在页面上改），删掉
  patch 里的 `providers.ollama` 再重启即可。

预设数据由 `tools/generate-preset.mjs` 从 `/api/show` 生成（`capabilities`、
`thinking.values`、`model_info.*.context_length`），生成物提交进仓库，CI 不联网：

```bash
OLLAMA_API_KEY=... node tools/generate-preset.mjs deepseek-v4.1-flash:1017 kimi-k3 glm-5.3-flash
```

两条生成规则值得记住：**不声明 `off`**（pi-ai 在没指定档位时若发现
`thinkingLevelMap.off` 存在，会发 `effort: none`，等于把默认行为改成关思考）；**只给
实测能读图的模型声明 image**（over-claim 不会报错，只会让请求在消息落盘后被上游拒绝）。

## 依赖的上游接口

Ollama Cloud 的三个只读接口，全部用 profile 里的 `OLLAMA_API_KEY` 调用：

| 接口 | 用途 |
| --- | --- |
| `GET /api/balance` | 剩余额度、总额度、账期起止（**剩余额度的唯一真相**） |
| `GET /api/usage?range=30d` | 本期请求数、金额、输入/缓存/输出 token，按日分桶 |
| `POST /api/me` | 套餐名（`pro` / `free` …） |

## 安装

插件是**纯 ESM、无需构建**的包：host 半走 `main`（`lib/index.js`），浏览器半走
`exports["./client"]`（`lib/client.js`，已在仓库里预构建成 DSH 的模块包装格式）。
因此三种分发方式都成立。

### 关键前提：peer 依赖要能解析

host 半会 `import '@deepseek-ai/schemastery'` / `@deepseek-ai/dsh-credentials`，
这些包在 **profile 的 node_modules** 里。Node 解析裸导入是沿 **文件真实路径** 向上找，
所以插件必须落在能向上走到 profile `node_modules` 的位置——或者由包管理器把
peer 链接铺好。三种方式满足这一点：

### A. 用包管理器装进 profile（推荐）

```bash
cd ~/.dsh/profiles/web
dsh plugin --profile web add dsh-ollama-quota   # 已发布到 registry 时
# 或：从 git 仓库装（pnpm 会连 .pnpm 虚拟目录一起铺好 peer 链接）
pnpm add github:<user>/dsh-ollama-quota
```

装完在 profile 的 `cordis.patch.yml` 里注册（见下），然后重启 `dsh web`。

### B. 把仓库放进 profile 目录树

```bash
git clone <repo-url> ~/.dsh/profiles/web/plugins/dsh-ollama-quota
ln -s ../plugins/dsh-ollama-quota ~/.dsh/profiles/web/node_modules/dsh-ollama-quota
```

这样裸导入会沿目录往上找到 `~/.dsh/profiles/web/node_modules`，无需额外链接。

### C. 仓库放在外面 + 软链（开发用）

```bash
git clone <repo-url> ~/src/dsh-ollama-quota
ln -s ~/src/dsh-ollama-quota ~/.dsh/profiles/web/node_modules/dsh-ollama-quota
# Node 会按真实路径解析，所以仓库自己也要能解析 peer：开发期给它一个软链
ln -s ~/.dsh/profiles/node_modules ~/src/dsh-ollama-quota/node_modules
```

（`node_modules` 已在 `.gitignore` 里；这只是本地开发脚手架，发布物不需要。）

### 注册到 profile

在 `~/.dsh/profiles/web/cordis.patch.yml` 末尾追加：

```yaml
- insert:
    - id: ollama-quota
      name: dsh-ollama-quota
      config:
        providers: [ollama]
        refreshMs: 60000
        paceWarnPct: 5
```

patch 层有 HMR：保存后新配置生效；**插件代码本身的改动要重启** `dsh web` 才会加载。

## 配置

| 键 | 默认值 | 说明 |
| --- | --- | --- |
| `providers` | `["ollama"]` | 生效的 **供应商 id** 列表（llm provider 名，不是模型名）。会话当前供应商不在列表里时，bar 不渲染也不轮询。 |
| `provisionProvider` | `true` | 首次加载时把 ollama 供应商 profile 写进 settings。已能解析到同 id 的供应商时不写。 |
| `baseURL` | `https://ollama.com` | 上游根地址，不带尾斜杠。 |
| `apiKeyEnv` | `OLLAMA_API_KEY` | 凭据引用名（走 DSH 的 credentials seam，不是密钥本身）。 |
| `path` | `/plugin/ollama-quota/state` | 只读端点路径。 |
| `refreshMs` | `60000` | 服务端缓存 TTL，同时也是浏览器轮询下限（浏览器侧不短于 15s）。 |
| `timeoutMs` | `8000` | 单次上游请求超时。 |
| `paceWarnPct` | `5` | 节奏判定容差（百分点）：已用比例 - 时间进度 超过它才算「用快了」。 |

## 只读端点

`GET <path>` 返回一份 JSON 快照，浏览器半每分钟拉一次（页面不可见 / 供应商不匹配 /
bar 未挂载时不拉）：

```json
{
  "ok": true,
  "fetchedAt": "2026-10-20T04:46:03.380Z",
  "refreshMs": 60000,
  "providers": ["ollama"],
  "plan": "pro",
  "allowanceUsd": 60,
  "purchasedRemainingUsd": 0,
  "totalUsd": 60,
  "remainingUsd": 59.76,
  "usedUsd": 0.24,
  "usedPct": 0.0039,
  "period": { "from": "…", "until": "…", "totalDays": 31, "elapsedDays": 0.07, "remainingDays": 30.93, "elapsedPct": 0.0022 },
  "tokens": { "requests": 289, "inputTokens": 24390513, "cachedInputTokens": 24019820, "outputTokens": 171557, "totalTokens": 24562070, "costUsd": 0.2356 },
  "daily": [{ "from": "…", "until": "…", "costUsd": 0.24, "requests": 289, "partial": true }],
  "pace": { "verdict": "on-track", "deltaPct": 0.17, "burnPerDayUsd": 3.4, "projectedCostUsd": 3.4, "projectedPct": 0.057, "runwayDays": 17.6, "exhaustsBeforeRenewal": false }
}
```

失败时返回 `{ ok: false, code, message, fetchedAt, providers }`，`code` 取
`missing-key` / `unauthorized` / `upstream` / `upstream-timeout` / `network` /
`upstream-format` / `internal`。

**安全**：端点只接受本机连接（`127.0.0.1` / `::1` / `::ffff:127.0.0.1`），非
GET/HEAD 返回 405，`cache-control: no-store`，并且永远不会把 API key 发给浏览器。

## 设计要点

- **剩余额度以 `/api/balance` 为准**：`/api/usage` 的金额会滞后，不能拿来算余额。
- **购买额度算进总额度**：`totalUsd = 含赠 + 已购`，`remainingUsd = 两者剩余之和`。
- **节奏判定用比例差值**：`usedPct - elapsedPct`，超过 `paceWarnPct` 判「用得快」，
  低于负值判「用得慢」，期间用 `paceWarnPct` 做容差。
- **`/api/usage` 失败只降级不致命**：余额还在就继续显示，token 区域标记缺失。
- **UI 与原生输入条同一套配方**：`border-l1` + `specific-tip` + 12px 圆角，标题
  13px/500，点标题在条内展开（和原生任务条一致），不用浮层。

## 开发

```bash
npm test                          # 单测 + 客户端冒烟（CI 跑这个）
node --test test/*.test.mjs      # metrics 纯函数（11 个）+ 供应商预置（5 个）
node test/host.smoke.mjs         # 打真实 Ollama 接口的 host 冒烟（需要 OLLAMA_API_KEY）
node test/client.smoke.mjs       # 浏览器 bundle 冒烟（loader 契约 / 网关 / 折叠展开 / 错误态）
```

`test/host.smoke.mjs` 会读 `~/.dsh/.credentials.yaml` 里的 `OLLAMA_API_KEY`；没有 key
时会跳过联网断言。

## License

MIT
