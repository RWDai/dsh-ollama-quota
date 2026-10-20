# dsh-ollama-quota

[![ci](https://github.com/RWDai/dsh-ollama-quota/actions/workflows/ci.yml/badge.svg)](https://github.com/RWDai/dsh-ollama-quota/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

DSH 插件：在输入框上方挂一条 **Ollama Cloud 额度条**，点开是明细——剩余额度、使用
百分比、本期 token（输入 / 缓存命中 / 输出）、到期时间，以及「按到期日算是用多了
还是用少了」的节奏预测。

```
▍Ollama 额度   $59.76 / $60.00 · 0.4% · 节奏正常 · 24.56M tok · 11-20 到期   ⌄
```

只在 ollama 供应商下出现：会话切到别的供应商时，条不渲染，也不发请求。

插件还兼任 **ollama 供应商的安装器**：首次启动会把端点、协议、key 引用、22 个模型
（含推理档位和图片输入能力）写进配置，所以 Models 页里直接就有 `Ollama Cloud` 这条
路由——**你不用填 URL、协议、模型，只要贴一个 key**。

## 安装（3 步）

环境：DSH ≥ `0.2.0-rc.2`、Node ≥ 20、一个 Ollama Cloud（Pro）key
（[ollama.com/settings/keys](https://ollama.com/settings/keys)）。

**1. 装进 profile**

```bash
cd ~/.dsh/profiles/web
pnpm add github:RWDai/dsh-ollama-quota
```

没有 pnpm 就 `npm i github:RWDai/dsh-ollama-quota`。装不上见[其它安装方式](#其它安装方式)。

**2. 注册到 `~/.dsh/profiles/web/cordis.patch.yml`**（末尾追加）

```yaml
- insert:
    - id: ollama-quota
      name: dsh-ollama-quota
      config:
        providers: [ollama]
```

**3. 重启并填 key**

```bash
dsh web                                  # 打开 http://127.0.0.1:3080/
```

设置 → 模型 → 看到 **`Ollama Cloud`** 行（红点＝还没 key）→ 编辑 → 粘贴 key → 保存。
保存后变绿点，key 只写存进凭据的 `OLLAMA_API_KEY`，配置文件里不会出现明文。

**验证**

```bash
curl -s http://127.0.0.1:3080/plugin/ollama-quota/state | head -c 120
# {"ok":true,...,"providers":["ollama"],...}
```

然后选一个 ollama 模型开聊，输入框上方就会出现额度条。`dsh web` 换了端口就把 `3080`
换成实际端口（启动行里会打印）。

## 给 AI 的一键安装提示词

把下面整段贴给 coding agent（DSH / Claude Code / Codex 都行），它会自己定位 profile、
装包、注册配置并校验：

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
   - 否则在文件末尾追加（根级 insert，缩进两格开始）：

   - insert:
       - id: ollama-quota
         name: dsh-ollama-quota
         config:
           providers:
             - ollama

   说明：providers 是「额度条在哪些供应商下显示」，不是供应商配置。供应商由插件
   启动时自动写入，不要手工添加，也不要填 baseURL。

4. 校验配置能组合（退出码必须是 0，且能看到该条目）：
   dsh --profile web --dump-config | grep -A 7 "id: ollama-quota"

5. 让用户重启 dsh web（插件代码不热更，必须重启），然后校验端点：
   curl -s http://127.0.0.1:3080/plugin/ollama-quota/state
   - {"ok":true,...,"providers":["ollama"],...} → 成功；
   - code=missing-key → 还差 key，进入第 6 步；
   - code=unauthorized → key 失效，让用户去 https://ollama.com/settings/keys 换一个；
   - 401/404 → 端口或路径不对，先确认 dsh web 实际监听的地址。

6. 让用户打开 Models 设置页，那里应已有 "Ollama Cloud" 路由（模型列表已填好），
   在卡片里粘贴 key 并保存。
   - 没看到这条路由：确认插件已加载、且 profile 里没有别的 llm-pi-ai 配置顶掉它；
   - 不想让插件自动写配置：patch 里加 provisionProvider: false，再手工添加供应商
     （Provider ID: ollama、端点 https://ollama.com/v1、协议 openai-responses）。

7. 告诉用户：选 ollama 模型时输入框上方出现额度条（点开是明细），切到其它供应商会
   自动消失并停止轮询；Models 页里 ollama 带「自定义」标签是正常的。
```

## 工作原理

两个只读数据流，都不经过 `/api/*` 网关：

| 上游接口 | 用途 |
| --- | --- |
| `GET /api/balance` | 剩余额度、总额度、账期起止（**剩余额度的唯一真相**） |
| `GET /api/usage?range=30d` | 请求数、金额、输入/缓存/输出 token，按日分桶 |
| `POST /api/me` | 套餐名（`pro` / `free` …） |

host 半用 profile 里的 `OLLAMA_API_KEY` 并发抓这三个接口，压成 60s TTL 缓存，通过
`/plugin/ollama-quota/state` 交给浏览器半；浏览器每 60s 拉一次（页面不可见、供应商
不匹配、条未挂载时不拉）。

供应商预置同理：启动时若解析不到 `ollama`，就把 `lib/preset.js` 写进 settings 层。
**幂等**（已存在就一个字不写）、**可关**（`provisionProvider: false`）、**不致命**
（写失败只告警，额度条照常工作）。

## 配置

写在第 2 步的 `config` 里，全部可选。

| 键 | 默认值 | 说明 |
| --- | --- | --- |
| `providers` | `["ollama"]` | 生效的**供应商 id**（llm provider 名，不是模型名）。不匹配就不渲染、不轮询。 |
| `provisionProvider` | `true` | 启动时把 ollama 供应商 profile 写进配置；已存在则跳过。 |
| `baseURL` | `https://ollama.com` | 上游根地址，不带尾斜杠。 |
| `apiKeyEnv` | `OLLAMA_API_KEY` | 凭据引用名（走凭证 seam，不是密钥本身）。 |
| `path` | `/plugin/ollama-quota/state` | 只读端点路径。 |
| `refreshMs` | `60000` | 服务端缓存 TTL，也是浏览器轮询下限（不短于 15s）。 |
| `timeoutMs` | `8000` | 单次上游请求超时。 |
| `paceWarnPct` | `5` | 节奏容差（百分点）：`已用% - 时间进度%` 超过它才算「用快了」。 |

## 只读端点

`GET /plugin/ollama-quota/state` 返回快照（节选）：

```json
{
  "ok": true, "providers": ["ollama"], "plan": "pro",
  "totalUsd": 60, "remainingUsd": 59.76, "usedPct": 0.0039,
  "period": { "until": "…", "remainingDays": 30.93, "elapsedPct": 0.0022 },
  "tokens": { "requests": 289, "totalTokens": 24562070, "costUsd": 0.2356 },
  "daily": [{ "from": "…", "costUsd": 0.24, "requests": 289, "partial": true }],
  "pace": { "verdict": "on-track", "burnPerDayUsd": 3.4, "runwayDays": 17.6, "exhaustsBeforeRenewal": false }
}
```

失败时是 `{ ok: false, code, message, providers }`，`code` 取 `missing-key` /
`unauthorized` / `upstream` / `upstream-timeout` / `network` / `upstream-format` /
`internal`。

只接受本机连接（`127.0.0.1` / `::1`），非 GET/HEAD 返回 405，`cache-control: no-store`,
且**永不把 key 发给浏览器**。

## 排错

| 现象 | 处理 |
| --- | --- |
| Models 页没有 `Ollama Cloud` 行 | `dsh --profile web --dump-config \| grep ollama-quota` 看条目在不在；不在就是第 2 步没写对 |
| 行名只显示 `ollama` | profile 缺 `displayName: Ollama Cloud`（插件预置的带，手写的要补） |
| 端点返回 `missing-key` | key 还没存上：重贴，或写进 `~/.dsh/.credentials.yaml` |
| 端点返回 `unauthorized` | key 失效，重新生成 |
| 端点正常但没有额度条 | 当前会话供应商不是 ollama（选了别的模型），或页面没刷新 |
| 页面样式/数据没变 | 插件**代码**改动必须重启 `dsh web`；只有 patch 配置是热更的 |

## 已知限制

- **「第三方模型提供商」下拉框里永远没有 ollama**：那个列表是 pi-ai 内置 catalog，生成
  期写死的静态列表，插件没有注册入口（硬注册会撞 `DUPLICATE_DIRECTORY`）。插件做的是
  把它变成一条**已配置的供应商行**，字段全预填。
- 这条行会带 **自定义** 标签，原因同上；不影响使用。
- 已手写供应商的 profile（patch 里已有 `providers.ollama`）会跳过预置，不覆盖你的配置。
  想让配置回到 settings 管理，删掉 patch 里那段再重启。
- 22 个模型里只有实测可用的才声明能力：`minimax-m3` 不声明图片输入（实测读图不准），
  `clef:27b` 是决策模型、走不了 `/v1/responses`，未收录。

## 其它安装方式

一般用不到。插件是纯 ESM、零构建，`lib/client.js` 已是 DSH 的模块包装格式。

host 半会 `import '@deepseek-ai/schemastery'` 等 peer 包，它们在 **profile 的
node_modules** 里；Node 解析裸导入按**文件真实路径**向上找——所以插件必须落在能走到
profile `node_modules` 的位置。

```bash
# B. 仓库放进 profile 目录树
git clone https://github.com/RWDai/dsh-ollama-quota ~/.dsh/profiles/web/plugins/dsh-ollama-quota
ln -s ../plugins/dsh-ollama-quota ~/.dsh/profiles/web/node_modules/dsh-ollama-quota

# C. 仓库放外面 + 软链（本地开发）
ln -s ~/src/dsh-ollama-quota ~/.dsh/profiles/web/node_modules/dsh-ollama-quota
ln -s ~/.dsh/profiles/node_modules ~/src/dsh-ollama-quota/node_modules   # 让 peer 可解析
```

## 开发

```bash
npm test                     # 单测 + 客户端冒烟（CI 跑这个）
node --test test/*.test.mjs  # metrics 纯函数 11 个 + 供应商预置 5 个
node test/host.smoke.mjs     # 打真实 Ollama 接口（读 ~/.dsh/.credentials.yaml 的 key）
node test/client.smoke.mjs   # 浏览器 bundle 冒烟：loader 契约 / 闸门 / 折叠展开 / 错误态
```

预设数据由 `tools/generate-preset.mjs` 从 `/api/show` 生成（`capabilities`、
`thinking.values`、`model_info.*.context_length`），生成物提交进仓库，CI 不联网：

```bash
OLLAMA_API_KEY=... node tools/generate-preset.mjs deepseek-v4.1-flash:1017 kimi-k3 glm-5.3-flash
```

两条生成规则：**不声明 `off`**（pi-ai 在没指定档位时会因 `thinkingLevelMap.off` 发
`effort: none`，等于默认关思考）；**只给实测能读图的模型声明 image**（over-claim 不会
报错，只会让请求在消息落盘后被上游拒绝）。

## License

MIT
