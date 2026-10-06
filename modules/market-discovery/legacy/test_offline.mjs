import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { runtimeOptions, isReusableOnlineReceipt, translatedTermStatus } from './runtime-options.mjs';

const { root: testParent } = runtimeOptions();
assert.equal(translatedTermStatus({ curated: false, sourceEnglish: false, similarity: 1 }), 'REVIEW_REQUIRED_BACKTRANSLATION');
assert.equal(translatedTermStatus({ curated: true, sourceEnglish: false, similarity: 1 }), 'ACCEPTED_CURATED');
assert.equal(translatedTermStatus({ curated: false, sourceEnglish: true, similarity: 1 }), 'ACCEPTED_SOURCE_ENGLISH');
const exec = promisify(execFile);
await fs.mkdir(testParent, { recursive: true });
const root = await fs.mkdtemp(path.join(testParent, 'synthetic-'));
const inputs = path.join(root, 'inputs');
await fs.mkdir(inputs);
const lines = (rows) => rows.map((row) => JSON.stringify(row)).join('\n') + '\n';
const readRows = async (file) => (await fs.readFile(file, 'utf8')).trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const run = async (name, args = []) => exec(process.execPath, [path.join(import.meta.dirname, name), `--root=${root}`, ...args], { timeout: 30000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
await fs.writeFile(path.join(inputs, 'regions.csv'), 'market_code,iso2,iso3,m49,country_zh,country_en,commercial_major_region_zh,commercial_subregion_zh,in_scope\nXA,XA,XAA,999,虚构地区,Example Republic,Synthetic,Synthetic,true\n');
await fs.writeFile(path.join(inputs, 'cldr.xml'), '<supplementalData><territoryInfo><territory type="XA"><languagePopulation type="en" populationPercent="100" officialStatus="official"/></territory></territoryInfo></supplementalData>');

await run('prepare_foundation.mjs', ['--offline', '--expected-markets=1']);
let tasks = await readRows(path.join(root, 'data', 'market_search_tasks.jsonl'));
assert.equal(tasks.length, 10, 'English source phrases must cover ten query families');
assert.equal(new Set(tasks.map((t) => t.task_id)).size, 10);

const terms = [
  ['context_commercial_kitchen', 'commercial kitchen equipment', 'ACCEPTED_CURATED'],
  ['cluster1_pre_rinse', 'commercial pre-rinse faucet', 'ACCEPTED_CURATED'],
  ['role_manufacturer', 'manufacturer', 'ACCEPTED_CURATED'],
  ['role_distributor', 'distributor', 'ACCEPTED_CURATED'],
  ['cluster2_sink', 'MUST_NOT_ENTER_QUERY', 'TRIAL_ONLY'],
  ['cluster3_water_dispenser', 'AUTOMATIC_BACKTRANSLATION_NOT_REVIEWED', 'ACCEPTED_BACKTRANSLATION'],
].map(([term_key, term_local, validation_status]) => ({ language_code: 'en', term_key, term_local, validation_status }));
const termsFile = path.join(inputs, 'reviewed_terms.jsonl');
await fs.writeFile(termsFile, lines(terms));
await run('prepare_foundation.mjs', ['--offline', `--terms-input=${termsFile}`]);
tasks = await readRows(path.join(root, 'data', 'market_search_tasks.jsonl'));
assert.equal(tasks.length, 2);
assert(tasks.every((t) => !t.query.includes('MUST_NOT_ENTER_QUERY')));
assert(tasks.every((t) => !t.query.includes('AUTOMATIC_BACKTRANSLATION_NOT_REVIEWED')));
const matrix = await readRows(path.join(root, 'data', 'market_language_matrix.jsonl'));
assert.equal(matrix[0].primary_task_status, 'BLOCKED_PARTIAL_TERM_VALIDATION');

await fs.writeFile(path.join(inputs, 'evidence.html'), '<html><title>Example Works</title><p>Example Works is a manufacturer of commercial pre-rinse faucets.</p></html>');
// A newly generated ASCII PDF fixture: no downloaded or production PDF bytes.
const pdfText = 'Example Works is a manufacturer of commercial pre-rinse faucets.';
const pdfStream = `BT /F1 12 Tf 72 720 Td (${pdfText}) Tj ET`;
const pdfObjects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  `<< /Length ${Buffer.byteLength(pdfStream)} >>\nstream\n${pdfStream}\nendstream`,
];
let pdf = '%PDF-1.4\n';
const offsets = [0];
for (let i = 0; i < pdfObjects.length; i++) { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${pdfObjects[i]}\nendobj\n`; }
const xref = Buffer.byteLength(pdf);
pdf += `xref\n0 ${pdfObjects.length + 1}\n0000000000 65535 f \n` + offsets.slice(1).map((offset) => String(offset).padStart(10, '0') + ' 00000 n \n').join('');
pdf += `trailer\n<< /Size ${pdfObjects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
await fs.writeFile(path.join(inputs, 'evidence.pdf'), pdf);
const gates = [
  { axis: 'PRODUCT', pattern: 'commercial pre-rinse faucets' },
  { axis: 'ROLE', pattern: 'manufacturer' },
  { axis: 'IDENTITY', pattern: 'Example Works' },
].map((g) => ({ ...g, url: 'https://example.invalid/evidence', file: 'inputs/evidence.html' }));
const specs = [
  { id: 'SYNTHETIC_GOOD', family: 'MANUFACTURER', evidence: gates, rows: [] },
  { id: 'SYNTHETIC_EMPTY', family: 'MANUFACTURER', evidence: [], rows: [] },
  { id: 'SYNTHETIC_MISSING_AXIS', family: 'MANUFACTURER', evidence: gates.slice(0, 2), rows: [] },
  { id: 'SYNTHETIC_MISMATCH', family: 'MANUFACTURER', evidence: gates.map((g) => g.axis === 'ROLE' ? { ...g, pattern: 'NONEXISTENT_ROLE' } : g), rows: [] },
  { id: 'SYNTHETIC_PDF', family: 'MANUFACTURER', evidence: gates.map((g) => ({ ...g, file: 'inputs/evidence.pdf', content_type: 'application/pdf' })), rows: [] },
];
await fs.writeFile(path.join(root, 'data', 'search_candidate_specs.jsonl'), lines(specs));
await run('verify_search_candidates.mjs', ['--offline']);
const verified = await readRows(path.join(root, 'lanes', 'search_candidate_verification', 'verified_candidates.jsonl'));
assert.equal(verified[0].decision, 'SYNTHETIC_GATE_PASS_MANUFACTURER');
assert.equal(verified[1].decision, 'HOLD_INVALID_EVIDENCE_CONTRACT');
assert(verified[1].validation_errors.includes('EMPTY_EVIDENCE'));
assert(verified[2].validation_errors.includes('MISSING_IDENTITY'));
assert.equal(verified[3].decision, 'HOLD_EVIDENCE_INCOMPLETE');
assert.equal(verified[4].decision, 'SYNTHETIC_GATE_PASS_MANUFACTURER');
assert(verified[4].verification_evidence.every((row) => row.content_type === 'application/pdf' && row.extracted_text_sha256));
assert(verified.every((r) => r.synthetic_only && !r.decision.startsWith('NEW_KEEP_')));
const cached = await readRows(path.join(root, 'lanes', 'search_candidate_verification', 'verification_receipts.jsonl'));
assert(cached.some((r) => r.passed));
assert(cached.every((r) => !isReusableOnlineReceipt(r)), 'Offline receipts cannot seed an online cache');
assert(!isReusableOnlineReceipt({ ...cached.find((r) => r.passed), synthetic_only: false, verification_mode: 'ONLINE_PATTERN_CHECK' }), 'Synthetic transport is independently refused');
assert(!isReusableOnlineReceipt({ ...cached.find((r) => r.passed), transport: 'NODE_DIRECT', verification_mode: 'ONLINE_PATTERN_CHECK' }), 'Synthetic marker is independently refused');

await run('build_browser_retry_queue.mjs');
await run('finalize_language_coverage.mjs');
const summary = JSON.parse(await fs.readFile(path.join(root, 'checkpoints', 'LANGUAGE_COVERAGE_TERMINAL.json'), 'utf8'));
assert.equal(summary.no_execution_receipt_tasks, 2);
assert.equal(summary.honest_status, 'PARTIAL_BLOCKED');
assert.equal(summary.priority_markets.status, 'NOT_REQUESTED');
const result = { status: 'SYNTHETIC_OFFLINE_PASS', network_requests: 0, production_data_read: false, output_root: root, assertions: ['ten_family_english_plan', 'trial_term_excluded', 'automatic_backtranslation_not_approved', 'partial_language_slot_disclosed', 'empty_evidence_rejected', 'required_identity_axis', 'pattern_mismatch_held', 'synthetic_pdf_text_extraction', 'synthetic_not_production_acceptance', 'offline_receipts_never_online_cache', 'missing_receipts_not_complete'] };
await fs.writeFile(path.join(root, 'test_result.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
