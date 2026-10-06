// Curated historical implementation with explicit local runtime inputs.
import fs from 'node:fs/promises';
import path from 'node:path';
import { runtimeOptions } from './runtime-options.mjs';

const { args, root } = runtimeOptions();
const tasksFile = path.join(root, 'data', 'market_search_tasks.jsonl');
const receiptsFile = path.join(root, 'lanes', 'search_v2', 'attempt_receipts_v2.jsonl');
const browserReceiptsFile = path.join(root, 'lanes', 'search_browser', 'yahoo_jp_browser_receipts.jsonl');
const outFile = path.join(root, 'lanes', 'search_browser', 'browser_retry_queue.jsonl');
const summaryFile = path.join(root, 'checkpoints', 'BROWSER_RETRY_QUEUE.json');
const priorityMarkets = String(args['priority-markets'] || '').split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);
const marketRank = new Map(priorityMarkets.map((code, index) => [code, index]));

async function readJsonl(file) {
  try { return (await fs.readFile(file, 'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

const tasks = await readJsonl(tasksFile);
const taskMap = new Map(tasks.map((task) => [task.task_id, task]));
const receipts = await readJsonl(receiptsFile);
const browserReceipts = await readJsonl(browserReceiptsFile);
const browserDone = new Set(browserReceipts.filter((r) => r.status !== 'BLOCKED').map((r) => r.task_id));
const latest = new Map();
for (const receipt of receipts) latest.set(receipt.task_id, receipt);

const rows = [...latest.values()]
  .filter((receipt) => receipt.status === 'BLOCKED' && !browserDone.has(receipt.task_id))
  .map((receipt) => {
    const task = taskMap.get(receipt.task_id) || {};
    return {
      queue_id: `YJIAB-${receipt.task_id}`,
      task_id: receipt.task_id,
      priority: marketRank.has(task.market_code) ? marketRank.get(task.market_code) + 1 : 1000,
      market_code: task.market_code || receipt.market_code || '',
      iso2: task.iso2 || receipt.iso2 || '',
      country_zh: task.country_zh || receipt.country_zh || '',
      language_slot: task.language_slot || receipt.language_slot || '',
      language_code: task.language_code || receipt.language_code || '',
      query_family: task.query_family || receipt.query_family || '',
      product_cluster: task.product_cluster || '',
      intent: task.intent || '',
      browser_query: receipt.executed_query || task.query || '',
      retry_reason: receipt.completion_basis || 'SEARCH_BLOCKED',
      latest_error: receipt.error || '',
      workflow_state: 'QUEUED',
      source_engine: 'YAHOO_JP_IAB',
    };
  })
  .sort((a, b) => a.priority - b.priority
    || a.market_code.localeCompare(b.market_code)
    || a.query_family.localeCompare(b.query_family)
    || a.task_id.localeCompare(b.task_id));

await fs.mkdir(path.dirname(outFile), { recursive: true });
await fs.writeFile(outFile, rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''), 'utf8');
const summary = {
  status: 'BROWSER_RETRY_QUEUE_READY',
  generated_at_utc: new Date().toISOString(),
  queued_tasks: rows.length,
  priority_market_tasks: rows.filter((row) => row.priority < 1000).length,
  markets: new Set(rows.map((row) => row.market_code)).size,
  output: outFile,
};
await fs.mkdir(path.dirname(summaryFile), { recursive: true });
await fs.writeFile(summaryFile, JSON.stringify(summary, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(summary, null, 2));
