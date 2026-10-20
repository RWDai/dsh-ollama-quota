/**
 * 打包回归测试：`files` 白名单漏掉模块，会让插件在用户机器上加载失败，
 * 而这在本地怎么测都测不出来（本地是仓库目录，文件都在）。
 *
 * 事故记录：`files` 曾逐文件列出 lib/index.js、lib/client.js、lib/metrics.js，
 * 后来新增 lib/preset.js 没同步 —— 发布物里少了它，插件启动即
 * ERR_MODULE_NOT_FOUND，端点 404，Models 页看不到供应商。
 *
 * 运行：`node --test test/*.test.mjs`
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

/** 跑一次 `npm pack --dry-run`，拿到真正会进 tarball 的文件清单。 */
function packedFiles() {
  const raw = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const [info] = JSON.parse(raw);
  return info.files.map((entry) => entry.path);
}

test('发布物必须包含插件运行所需的每一个模块', () => {
  const files = packedFiles();
  for (const required of ['lib/index.js', 'lib/client.js', 'lib/metrics.js', 'lib/preset.js']) {
    assert.ok(files.includes(required), `发布物缺少 ${required}，装到用户机器上会加载失败`);
  }
});

test('发布物不包含测试、工具与 CI 文件', () => {
  const files = packedFiles();
  for (const forbidden of files.filter((path) => /^(test|tools|\.github)\//.test(path))) {
    assert.fail(`不该打包 ${forbidden}`);
  }
});
