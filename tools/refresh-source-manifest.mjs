// EN: Regenerate a source-only inventory from Git-visible paths; never enumerate runtime.
// ZH: 只从 Git 可见源码路径重建清单，不遍历运行数据。
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestName = 'SOURCE_RELEASE_MANIFEST.json';
const paths = execFileSync('git', ['ls-files', '-c', '-o', '--exclude-standard', '-z'], { cwd: root })
  .toString('utf8').split('\0').filter(Boolean);
const files = [];
for (const name of [...new Set(paths)].sort()) {
  if (name === manifestName) continue;
  if (/(^|\/)(runtime|private|cases|training_runs|profiles|sessions|node_modules|dist)(\/|$)/i.test(name)) {
    throw new Error('PRIVATE_PATH_IN_SOURCE_INVENTORY');
  }
  const bytes = await fs.readFile(path.join(root, name));
  // Git's text attributes may normalize line endings on checkout; use LF for text hashes.
  const text = bytes.toString('utf8');
  const normalized = Buffer.from(text.replace(/\r\n/g, '\n'), 'utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) throw new Error('NON_UTF8_SOURCE_REFUSED');
  files.push({ path: name, sha256: createHash('sha256').update(normalized).digest('hex'), bytes: normalized.length });
}
const manifest = { schema: 2, scope: 'GENERALIZED_PUBLIC_SOURCE_ONLY',
  baseline_commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim(),
  license: 'MIT', hash_normalization: 'UTF8_LF', files, self_excluded: manifestName,
  validation: { production_data_quality: 'NOT_ASSESSED', runtime_tests: 'SYNTHETIC_ONLY' } };
await fs.writeFile(path.join(root, manifestName), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ status: 'SOURCE_MANIFEST_REFRESHED', files: files.length }));
