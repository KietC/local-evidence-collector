// EN: Scan only tracked-source candidates; never inspect runtime or private evidence.
// ZH: 仅检查源码候选，不检查运行目录或私有证据。
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const excluded = new Set([".git", "node_modules", "dist", "runtime", "cache", "cases", "evidence", "private", "verification", "profiles", "sessions"]);
const findings = [];
let files = 0;
const inventory = new Map();
async function walk(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const current = path.join(directory, entry.name);
    if (entry.isDirectory()) { if (!excluded.has(entry.name)) await walk(current); continue; }
    if (!entry.isFile()) { findings.push({ code: "NON_REGULAR_SOURCE", path: path.relative(root, current) }); continue; }
    files++;
    const text = await fs.readFile(current, "utf8");
    const name = path.relative(root, current).split(path.sep).join('/');
    if (name !== 'SOURCE_RELEASE_MANIFEST.json') {
      const bytes = Buffer.from(text.replace(/\r\n/g, '\n'), 'utf8');
      inventory.set(name, { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length });
    }
    const tests = [
      ["PRIVATE_KEY", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
      ["TOKEN", /\b(?:gh[pousr]_[A-Za-z0-9_]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-[A-Za-z0-9_-]{30,})\b/],
      ["URL_CREDENTIAL", /https?:\/\/[^\s:/"'`]+:[^\s/@"'`]+@/],
      ["HIDDEN_UNICODE", /[\u200b\u202a-\u202e\u2066-\u2069]/]
    ];
    for (const [code, pattern] of tests) if (pattern.test(text)) findings.push({ code, path: path.relative(root, current) });
  }
}
await walk(root);
try {
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'SOURCE_RELEASE_MANIFEST.json'), 'utf8'));
  if (manifest.schema !== 2 || manifest.hash_normalization !== 'UTF8_LF' || !Array.isArray(manifest.files)) {
    throw new Error('MANIFEST_SCHEMA');
  }
  const seen = new Set();
  for (const row of manifest.files) {
    const actual = inventory.get(row.path);
    if (!actual || seen.has(row.path) || row.sha256 !== actual.sha256 || row.bytes !== actual.bytes) {
      findings.push({ code: 'SOURCE_HASH_MISMATCH', path: String(row.path) });
    }
    seen.add(row.path);
  }
  for (const name of inventory.keys()) if (!seen.has(name)) findings.push({ code: 'SOURCE_NOT_IN_MANIFEST', path: name });
} catch { findings.push({ code: 'SOURCE_MANIFEST_INVALID', path: 'SOURCE_RELEASE_MANIFEST.json' }); }
console.log(JSON.stringify({ stage: "PUBLIC_SOURCE_SCAN", status: findings.length ? "FAIL_CLOSED" : "PASS", files, findings }));
if (findings.length) process.exitCode = 1;
