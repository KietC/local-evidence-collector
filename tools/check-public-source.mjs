// EN: Scan only tracked-source candidates; never inspect runtime or private evidence.
// ZH: 仅检查源码候选，不检查运行目录或私有证据。
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const excluded = new Set([".git", "node_modules", "dist", "runtime", "cache", "cases", "evidence", "private", "verification", "profiles", "sessions"]);
const findings = [];
let files = 0;
async function walk(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const current = path.join(directory, entry.name);
    if (entry.isDirectory()) { if (!excluded.has(entry.name)) await walk(current); continue; }
    if (!entry.isFile()) { findings.push({ code: "NON_REGULAR_SOURCE", path: path.relative(root, current) }); continue; }
    files++;
    const text = await fs.readFile(current, "utf8");
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
console.log(JSON.stringify({ stage: "PUBLIC_SOURCE_SCAN", status: findings.length ? "FAIL_CLOSED" : "PASS", files, findings }));
if (findings.length) process.exitCode = 1;
