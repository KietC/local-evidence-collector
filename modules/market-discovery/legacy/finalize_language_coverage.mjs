// Curated historical implementation with explicit local runtime inputs.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { runtimeOptions } from "./runtime-options.mjs";

const { args, root } = runtimeOptions();
const dataDir = path.join(root, "data");
const searchDir = path.join(root, "lanes", "search");
const v2Dir = path.join(root, "lanes", "search_v2");
const browserDir = path.join(root, "lanes", "search_browser");
const qaDir = path.join(root, "qa");
const checkpointDir = path.join(root, "checkpoints");
for (const dir of [searchDir, qaDir, checkpointDir]) fs.mkdirSync(dir, { recursive: true });

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex").toUpperCase();
const readJsonl = (p) => fs.existsSync(p)
  ? fs.readFileSync(p, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean).map(JSON.parse)
  : [];
const writeJsonl = (p, rows) => fs.writeFileSync(p, rows.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
const csvEscape = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};
const writeCsv = (p, rows) => {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const text = [headers.join(","), ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(","))].join("\r\n") + "\r\n";
  fs.writeFileSync(p, "\uFEFF" + text, "utf8");
};
const timeOf = (r) => Date.parse(r.ended_at_utc || r.completed_at_utc || r.captured_at_utc || r.started_at_utc || 0) || 0;
const normalizedStatus = (r) => {
  if (r.status === "RESULT_ONLY") return "TARGET_FOUND";
  if (r.status === "NO_RESULTS") return "NO_QUALIFIED_TARGET";
  return r.status || "BLOCKED";
};

const matrixPath = path.join(dataDir, "market_language_matrix.jsonl");
const tasksPath = path.join(dataDir, "market_search_tasks.jsonl");
if (!fs.existsSync(matrixPath) || !fs.existsSync(tasksPath)) throw new Error("Language matrix and tasks are required");
const matrix = readJsonl(matrixPath).map((row) => ({
  ...row,
  secondary_official_status:
    row.secondary_language_code && row.secondary_language_code !== "NOT_APPLICABLE" && row.secondary_official_status === "NOT_APPLICABLE"
      ? "FUNCTIONAL_COMMERCIAL"
      : row.secondary_official_status,
}));
writeJsonl(matrixPath, matrix);
writeCsv(path.join(dataDir, "market_language_matrix.csv"), matrix);

const tasks = readJsonl(tasksPath);
if (!matrix.length) throw new Error("Empty language matrix is not complete");
if (new Set(tasks.map((t) => t.task_id)).size !== tasks.length) throw new Error("Duplicate task ID");
const sourceReceipts = [
  ...readJsonl(path.join(v2Dir, "attempt_receipts_v2.jsonl")),
  ...readJsonl(path.join(browserDir, "yahoo_jp_browser_receipts.jsonl")),
];
const byTask = new Map();
for (const receipt of sourceReceipts) {
  if (!receipt.task_id) continue;
  if (!byTask.has(receipt.task_id)) byTask.set(receipt.task_id, []);
  byTask.get(receipt.task_id).push(receipt);
}

const capturedAt = new Date().toISOString();
const allowed = new Set(["TARGET_FOUND", "NO_QUALIFIED_TARGET", "BLOCKED", "INVALID_QUERY", "DUPLICATE"]);
const completed = new Set(["TARGET_FOUND", "NO_QUALIFIED_TARGET", "DUPLICATE"]);
const priorityMarkets = new Set(String(args["priority-markets"] || "").split(",").map((x) => x.trim().toUpperCase()).filter(Boolean));
const receipts = tasks.map((task) => {
  const candidates = (byTask.get(task.task_id) || []).sort((a, b) => timeOf(b) - timeOf(a));
  // A later transient block must not erase a previously completed, evidence-bearing task.
  const source = candidates.find((r) => completed.has(normalizedStatus(r)))
    || candidates.find((r) => normalizedStatus(r) === "INVALID_QUERY")
    || candidates[0]
    || null;
  const terminalStatus = source && allowed.has(normalizedStatus(source)) ? normalizedStatus(source) : "BLOCKED";
  const sourceTime = source?.ended_at_utc || source?.completed_at_utc || source?.captured_at_utc || capturedAt;
  return {
    receipt_id: "LLR-FINAL-" + sha256(`${task.task_id}|${terminalStatus}|${sourceTime}`).slice(0, 24),
    task_id: task.task_id,
    market_code: task.market_code,
    iso2: task.iso2,
    country_zh: task.country_zh,
    language_slot: task.language_slot,
    language_code: task.language_code,
    language_tag: task.language_tag,
    query_family: task.query_family,
    product_cluster: task.product_cluster,
    intent: task.intent,
    query: task.query,
    terminal_status: terminalStatus,
    execution_scope: source?.engine === "YAHOO_JP_IAB" ? "INDIVIDUAL_BROWSER_SEARCH" : source ? "INDIVIDUAL_MULTISOURCE_SEARCH" : "NO_EXECUTION_RECEIPT",
    engine: source?.engine || "",
    successful_engines: source?.successful_engines || (source?.engine ? [source.engine] : []),
    result_count: Number(source?.qualified_discovery_count ?? source?.raw_result_count ?? 0),
    source_receipt_id: source?.receipt_id || "",
    artifact_path: source?.artifact_path || "",
    content_sha256: source?.content_sha256 || "",
    final_url: source?.final_url || "",
    captured_at_utc: sourceTime,
    reason: source?.completion_basis || source?.error || (source ? "SOURCE_RECEIPT_TERMINAL_STATUS" : "NO_CURRENT_TASK_RECEIPT"),
  };
});
writeJsonl(path.join(searchDir, "attempt_receipts.jsonl"), receipts);

const languageBlockers = [];
for (const row of matrix) {
  for (const slot of ["primary", "secondary", "english_supplement"]) {
    const status = row[`${slot}_task_status`];
    if (!String(status || "").startsWith("BLOCKED")) continue;
    languageBlockers.push({
      blocker_id: "LLB-" + sha256(`${row.market_code}|${slot}`).slice(0, 24),
      market_code: row.market_code,
      iso2: row.iso2,
      country_zh: row.country_zh,
      language_slot: slot.toUpperCase(),
      language_code: row[`${slot}_language_code`] || "",
      terminal_status: "BLOCKED",
      reason: "NO_VALIDATED_LOCAL_INDUSTRY_TRANSLATION; English was not substituted as local-language coverage",
      captured_at_utc: capturedAt,
    });
  }
}
writeJsonl(path.join(searchDir, "language_slot_blockers.jsonl"), languageBlockers);

const receiptByMarket = new Map();
for (const receipt of receipts) {
  if (!receiptByMarket.has(receipt.market_code)) receiptByMarket.set(receipt.market_code, []);
  receiptByMarket.get(receipt.market_code).push(receipt);
}
const marketCoverage = matrix.map((m) => {
  const rows = receiptByMarket.get(m.market_code) || [];
  const counts = rows.reduce((a, r) => ((a[r.terminal_status] = (a[r.terminal_status] || 0) + 1), a), {});
  const blockers = languageBlockers.filter((b) => b.market_code === m.market_code).length;
  const complete = rows.length > 0
    && rows.every((r) => ["TARGET_FOUND", "NO_QUALIFIED_TARGET", "DUPLICATE"].includes(r.terminal_status))
    && blockers === 0;
  return {
    market_code: m.market_code,
    iso2: m.iso2,
    country_zh: m.country_zh,
    primary_language_code: m.primary_language_code,
    secondary_language_code: m.secondary_language_code,
    english_supplement_required: m.english_supplement_required,
    task_count: rows.length,
    target_found: counts.TARGET_FOUND || 0,
    no_qualified_target: counts.NO_QUALIFIED_TARGET || 0,
    blocked: counts.BLOCKED || 0,
    invalid_query: counts.INVALID_QUERY || 0,
    duplicate: counts.DUPLICATE || 0,
    language_slot_blockers: blockers,
    coverage_status: complete ? "COMPLETE" : "PARTIAL_BLOCKED",
  };
});
writeJsonl(path.join(searchDir, "market_coverage.jsonl"), marketCoverage);
writeCsv(path.join(searchDir, "market_coverage.csv"), marketCoverage);

const receiptCounts = receipts.reduce((a, r) => ((a[r.terminal_status] = (a[r.terminal_status] || 0) + 1), a), {});
const completeMarkets = marketCoverage.filter((m) => m.coverage_status === "COMPLETE").length;
const priorityReceipts = receipts.filter((r) => priorityMarkets.has(r.market_code));
const priorityCompleted = priorityReceipts.filter((r) => completed.has(r.terminal_status)).length;
const priorityLanguageSlotBlockers = languageBlockers.filter((r) => priorityMarkets.has(r.market_code)).length;
const notExecutedTasks = receipts.filter((r) => r.execution_scope === "NO_EXECUTION_RECEIPT").length;
const summary = {
  generated_at_utc: capturedAt,
  markets: matrix.length,
  tasks: tasks.length,
  source_receipts: sourceReceipts.length,
  receipt_counts: receiptCounts,
  language_slot_blockers: languageBlockers.length,
  complete_markets: completeMarkets,
  partial_blocked_markets: marketCoverage.length - completeMarkets,
  no_execution_receipt_tasks: notExecutedTasks,
  priority_markets: {
    markets: priorityMarkets.size,
    tasks: priorityReceipts.length,
    completed_terminal_tasks: priorityCompleted,
    blocked_or_unexecuted_tasks: priorityReceipts.length - priorityCompleted,
    language_slot_blockers: priorityLanguageSlotBlockers,
    status: !priorityMarkets.size ? "NOT_REQUESTED" : priorityReceipts.length > 0 && priorityCompleted === priorityReceipts.length && priorityLanguageSlotBlockers === 0 ? "COMPLETE" : "PARTIAL_BLOCKED",
  },
  honest_status: completeMarkets === matrix.length ? "COMPLETE" : "PARTIAL_BLOCKED",
};
fs.writeFileSync(path.join(checkpointDir, "LANGUAGE_COVERAGE_TERMINAL.json"), JSON.stringify(summary, null, 2) + "\n", "utf8");

const networkReportPath = path.join(qaDir, "NETWORK_REPAIR_REPORT.json");
const probe = {
  probe_id: "SEARCH-PROBE-" + sha256(`${capturedAt}|${sourceReceipts.length}`).slice(0, 24),
  captured_at_utc: capturedAt,
  network_report_path: fs.existsSync(networkReportPath) ? networkReportPath : "",
  network_report_sha256: fs.existsSync(networkReportPath) ? sha256(fs.readFileSync(networkReportPath)) : "",
  multisource_summary: summary,
  evidence_limit: "Search receipts prove executed discovery tasks only; output inclusion still requires official product, identity and role evidence.",
};
fs.writeFileSync(path.join(qaDir, "search_transport_probe.json"), JSON.stringify(probe, null, 2) + "\n", "utf8");
console.log(JSON.stringify(summary, null, 2));
