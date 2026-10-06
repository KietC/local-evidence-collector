// EN: Run only invented local fixtures; no live search or customer input is read.
// ZH: 仅运行本地虚构样例，不执行公网搜索或读取客户输入。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const moduleRoot = path.join(appRoot, 'modules', 'market-discovery');
const runtime = await fs.mkdtemp(path.join(os.tmpdir(), 'market-offline-check-'));
try {
  const command = process.env.MARKET_DISCOVERY_PYTHON || 'python';
  if (!/^python(?:\d+(?:\.\d+)*)?(?:\.exe)?$/i.test(path.basename(command))) throw new Error('INVALID_PYTHON_EXECUTABLE');
  for (const [executable, args, cwd] of [
    [command, ['-B', '-m', 'unittest', 'discover', '-s', 'tests', '-v'], moduleRoot],
    [process.execPath, ['--test', path.join(moduleRoot, 'tests', 'dispatcher.test.mjs')], appRoot],
    [process.execPath, [path.join(moduleRoot, 'legacy', 'test_offline.mjs'), `--root=${runtime}`], appRoot]
  ]) {
    const result = spawnSync(executable, args, { cwd, shell: false, windowsHide: true,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }, stdio: 'inherit', timeout: 120000 });
    if (result.error || result.status !== 0) throw new Error('MARKET_SYNTHETIC_CHECK_FAILED');
  }
} finally {
  // EN: This exact temporary directory is created by this script. ZH: 只清理本脚本创建的确切临时目录。
  await fs.rm(runtime, { recursive: true, force: true });
}
