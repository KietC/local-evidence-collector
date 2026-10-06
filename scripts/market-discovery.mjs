#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { parseArgs, validateRuntimeRoot, withinRoot, repositoryRoot, isValidRunId } from '../modules/market-discovery/legacy/runtime-options.mjs';
import { priorityDomainMap } from '../modules/market-discovery/legacy/priority-order.mjs';

const moduleRoot = path.join(repositoryRoot, 'modules', 'market-discovery');
const STAGES = new Set(['plan', 'search', 'penetrate', 'verify', 'handoff', 'priority', 'demo']);
const FLAGS = new Set(['stage', 'root', 'run-id', 'allow-network', 'markets', 'limit', 'concurrency', 'fetch-cldr']);
const COUNT_KEYS = new Set(['tasks', 'markets', 'candidates', 'pattern_passes', 'held', 'records', 'output_records', 'matched', 'needs_review', 'no_match', 'network_requests']);
const TERMINAL = new Set(['COMPLETE', 'PARTIAL', 'BLOCKED', 'FAILED', 'CANCELLED']);
let activeChild = null;
let cancelled = false;

class StageError extends Error {
  constructor(code, status = 'FAILED') { super(code); this.code = code; this.status = status; }
}

function cancel() {
  cancelled = true;
  if (!activeChild?.pid) return;
  if (process.platform === 'win32') {
    const taskkill = process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32', 'taskkill.exe') : 'taskkill.exe';
    const killer = spawn(taskkill, ['/PID', String(activeChild.pid), '/T', '/F'], { shell: false, windowsHide: true, stdio: 'ignore' });
    killer.on('error', () => activeChild?.kill('SIGTERM'));
  } else {
    try { process.kill(-activeChild.pid, 'SIGTERM'); } catch { activeChild.kill('SIGTERM'); }
  }
}
process.on('SIGINT', cancel);
process.on('SIGTERM', cancel);

function counts(values = {}) {
  return Object.fromEntries(Object.entries(values).filter(([key, value]) => COUNT_KEYS.has(key) && Number.isSafeInteger(value) && value >= 0));
}

async function atomicJson(file, value) {
  const temporary = file + '.tmp-' + crypto.randomUUID();
  await fs.writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  await fs.rename(temporary, file);
}

async function readJson(root, relative) {
  const file = withinRoot(root, relative);
  const stat = await fs.stat(file);
  if (!stat.isFile() || stat.size > 12 * 1024 * 1024) throw new StageError('RESULT_SIZE_OR_TYPE_INVALID');
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function present(root, relative) {
  const file = withinRoot(root, relative);
  try { return (await fs.stat(file)).isFile(); } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

async function requireInput(root, relative) {
  if (!await present(root, relative)) throw new StageError('REQUIRED_INPUT_MISSING', 'BLOCKED');
}

async function describeArtifact(root, relative) {
  const file = withinRoot(root, relative);
  const body = await fs.readFile(file);
  return { path: relative.replaceAll('\\', '/'), bytes: body.length, sha256: crypto.createHash('sha256').update(body).digest('hex') };
}

function pythonCommand() {
  const command = process.env.MARKET_DISCOVERY_PYTHON || 'python';
  if (!/^python(?:\d+(?:\.\d+)*)?(?:\.exe)?$/i.test(path.basename(command))) throw new StageError('PYTHON_EXECUTABLE_INVALID', 'BLOCKED');
  return command;
}

async function child(command, argv, stage, allowNetwork) {
  if (cancelled) throw new StageError('CANCELLED', 'CANCELLED');
  const env = { ...process.env, PYTHONDONTWRITEBYTECODE: '1' };
  if (stage !== 'priority') delete env.MARKET_DISCOVERY_HMAC_KEY;
  return new Promise((resolve, reject) => {
    const proc = spawn(command, argv, { cwd: moduleRoot, env, shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    activeChild = proc;
    let size = 0;
    let errorCode = '';
    const timeout = setTimeout(() => { errorCode = 'STAGE_TIMEOUT'; proc.kill('SIGTERM'); }, allowNetwork ? 30 * 60 * 1000 : 120000);
    for (const stream of [proc.stdout, proc.stderr]) stream.on('data', (data) => {
      // Child output may contain runtime identifiers: do not return it to UI or receipts.
      size += data.length;
      if (size > 2 * 1024 * 1024) { errorCode = 'CHILD_OUTPUT_LIMIT'; proc.kill('SIGTERM'); }
    });
    proc.on('error', () => { errorCode = 'EXECUTABLE_UNAVAILABLE'; });
    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (activeChild === proc) activeChild = null;
      if (cancelled) reject(new StageError('CANCELLED', 'CANCELLED'));
      else if (errorCode) reject(new StageError(errorCode, errorCode === 'EXECUTABLE_UNAVAILABLE' ? 'BLOCKED' : 'FAILED'));
      else if (code !== 0) reject(new StageError('CHILD_STAGE_FAILED'));
      else resolve();
    });
  });
}

async function nodeStage(script, root, options, args = []) {
  return child(process.execPath, [path.join(moduleRoot, 'legacy', script), `--root=${root}`, ...args], options.stage, options.allowNetwork);
}

async function perform(stage, root, runId, options) {
  const live = options.allowNetwork;
  const networkFlag = live ? '--allow-network' : '--offline';
  const selected = options.markets ? [`--markets=${options.markets}`] : [];
  if (stage === 'plan') {
    await requireInput(root, 'inputs/regions.csv');
    if (!options.fetchCldr) await requireInput(root, 'inputs/cldr.xml');
    if (options.fetchCldr && !live) throw new StageError('NETWORK_OPT_IN_REQUIRED', 'BLOCKED');
    const args = [networkFlag];
    if (await present(root, 'inputs/reviewed_terms.jsonl')) args.push(`--terms-input=${withinRoot(root, 'inputs/reviewed_terms.jsonl')}`);
    if (options.fetchCldr) args.push('--fetch-cldr');
    await nodeStage('prepare_foundation.mjs', root, options, args);
    const summary = await readJson(root, 'checkpoints/FOUNDATION_READY.json');
    return { status: summary.status === 'FOUNDATION_READY' ? 'COMPLETE' : 'PARTIAL', counts: counts({ tasks: summary.counts.search_tasks, markets: summary.counts.in_scope_markets }), artifacts: [await describeArtifact(root, 'checkpoints/FOUNDATION_READY.json')] };
  }
  if (stage === 'search' || stage === 'penetrate') {
    if (!live) throw new StageError('NETWORK_OPT_IN_REQUIRED', 'BLOCKED');
    if (stage === 'search') {
      await requireInput(root, 'data/market_search_tasks.jsonl');
      const mode = options.markets ? 'pilot' : 'full';
      await nodeStage('run_multisource_search.mjs', root, options, ['--allow-network', `--mode=${mode}`, ...selected, `--limit=${options.limit}`, `--concurrency=${options.concurrency}`]);
      const report = `checkpoints/SEARCH_V3_${mode.toUpperCase()}.json`;
      const summary = await readJson(root, report);
      return { status: summary.status === 'SEARCH_V3_COMPLETE' ? 'COMPLETE' : 'PARTIAL', counts: counts({ tasks: summary.unique_tasks_receipted, markets: summary.markets, candidates: summary.leads }), artifacts: [await describeArtifact(root, report)] };
    }
    await requireInput(root, 'lanes/search_v2/search_leads_v2.jsonl');
    const priorityArgs = [];
    let priorityOrdering = null;
    if (await present(root, 'private/priority/latest.json')) {
      const pointer = await readJson(root, 'private/priority/latest.json');
      if (pointer.schema !== 'market_discovery.priority_latest.v1' || !isValidRunId(pointer.run_id)) throw new StageError('PRIORITY_POINTER_INVALID', 'BLOCKED');
      const relative = `private/priority/${pointer.run_id}/domain_scan_order.json`;
      const artifact = await describeArtifact(root, relative);
      if (artifact.sha256 !== pointer.domain_order_sha256) throw new StageError('PRIORITY_MAP_HASH_MISMATCH', 'BLOCKED');
      const document = await readJson(root, relative);
      priorityDomainMap(document);
      const digests = document.input_sha256 || {};
      if (!['customers', 'public_entities'].every((key) => /^[a-f0-9]{64}$/.test(digests[key] || '') && pointer.input_sha256?.[key] === digests[key])) throw new StageError('PRIORITY_INPUT_HASH_INVALID', 'BLOCKED');
      priorityArgs.push(`--priority-map=${withinRoot(root, relative)}`);
      priorityOrdering = { usage: 'SCAN_ORDER_ONLY', map_sha256: artifact.sha256, input_sha256: digests, artifact };
    }
    await nodeStage('penetrate_browser_leads.mjs', root, options, ['--allow-network', '--all', ...selected, `--limit=${options.limit}`, ...priorityArgs]);
    const summary = await readJson(root, 'lanes/search_lead_penetration/penetration_summary.json');
    return { status: summary.remaining_discovered_hosts > 0 ? 'PARTIAL' : 'COMPLETE', counts: counts({ candidates: summary.processed_this_run }), priority_ordering: priorityOrdering, artifacts: [await describeArtifact(root, 'lanes/search_lead_penetration/penetration_summary.json'), ...(priorityOrdering ? [priorityOrdering.artifact] : [])] };
  }
  if (stage === 'verify') {
    await requireInput(root, 'data/search_candidate_specs.jsonl');
    await nodeStage('verify_search_candidates.mjs', root, options, [networkFlag]);
    const summary = await readJson(root, 'lanes/search_candidate_verification/summary.json');
    return { status: summary.held > 0 ? 'PARTIAL' : 'COMPLETE', synthetic_only: !live, counts: counts({ candidates: summary.candidates, pattern_passes: live ? summary.pattern_passes_requiring_review : summary.synthetic_gate_passes, held: summary.held }), artifacts: [await describeArtifact(root, 'lanes/search_candidate_verification/summary.json')] };
  }
  if (stage === 'handoff') {
    await requireInput(root, 'inputs/approved_public.jsonl');
    const relative = `outputs/handoff/${runId}`;
    const destination = withinRoot(root, relative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await child(pythonCommand(), ['-B', '-m', 'bridge.public_handoff', '--root', root, '--input', withinRoot(root, 'inputs/approved_public.jsonl'), '--output', destination, ...(options.syntheticOnly ? ['--synthetic-fixture'] : [])], stage, false);
    const manifest = await readJson(root, relative + '/manifest.json');
    return { status: 'COMPLETE', synthetic_only: options.syntheticOnly === true, counts: counts({ records: manifest.input_records, output_records: manifest.output_records, network_requests: 0 }), artifacts: await Promise.all(['handoff.jsonl', 'handoff.csv', 'manifest.json'].map((file) => describeArtifact(root, relative + '/' + file))) };
  }
  if (stage === 'priority') {
    if (!/^(?:[a-fA-F0-9]{2}){32,128}$/.test(process.env.MARKET_DISCOVERY_HMAC_KEY || '')) throw new StageError('LOCAL_HMAC_KEY_REQUIRED', 'BLOCKED');
    await requireInput(root, 'inputs/customer_projection.jsonl');
    await requireInput(root, 'inputs/public_entities.jsonl');
    await child(pythonCommand(), ['-B', '-m', 'bridge.priority_cli', '--root', root, '--run-id', runId], stage, false);
    const relative = `private/priority/${runId}`;
    const summary = await readJson(root, relative + '/manifest.json');
    return { status: summary.counts.needs_review ? 'PARTIAL' : 'COMPLETE', counts: counts({ ...summary.counts, network_requests: 0 }), input_sha256: summary.input_sha256, artifacts: [await describeArtifact(root, relative + '/manifest.json'), await describeArtifact(root, relative + '/domain_scan_order.json')] };
  }
  if (stage === 'demo') return demo(root, runId, options);
  throw new StageError('STAGE_NOT_ALLOWED', 'BLOCKED');
}

async function execute(stage, root, runId, options) {
  const receiptDir = withinRoot(root, `stages/${stage}`);
  await fs.mkdir(receiptDir, { recursive: true });
  const receipt = { schema: 'market_discovery.stage_receipt.v1', stage, run_id: runId, status: 'RUNNING', started_at: new Date().toISOString(), finished_at: null, exit_code: null, network_allowed: options.allowNetwork === true, synthetic_only: options.syntheticOnly === true || stage === 'demo', counts: {}, artifacts: [], error_code: null };
  const persist = async () => {
    await atomicJson(path.join(receiptDir, runId + '.json'), receipt);
    await atomicJson(path.join(receiptDir, 'latest.json'), receipt);
  };
  await persist();
  try {
    const result = await perform(stage, root, runId, { ...options, stage });
    Object.assign(receipt, result, { counts: counts(result.counts) });
    if (cancelled) throw new StageError('CANCELLED', 'CANCELLED');
    receipt.exit_code = 0;
  } catch (error) {
    receipt.status = error instanceof StageError ? error.status : cancelled ? 'CANCELLED' : 'FAILED';
    receipt.error_code = error instanceof StageError ? error.code : cancelled ? 'CANCELLED' : 'STAGE_INPUT_OR_FILESYSTEM_ERROR';
    receipt.exit_code = receipt.status === 'CANCELLED' ? 130 : 2;
  }
  if (!TERMINAL.has(receipt.status)) { receipt.status = 'FAILED'; receipt.error_code = 'INVALID_STAGE_RESULT'; receipt.exit_code = 2; }
  receipt.finished_at = new Date().toISOString();
  await persist();
  return receipt;
}

async function demo(root, runId, options) {
  const relative = `demo/${runId}`;
  const demoRoot = withinRoot(root, relative);
  const inputDir = path.join(demoRoot, 'inputs');
  await fs.mkdir(inputDir, { recursive: true });
  await fs.writeFile(path.join(demoRoot, 'SYNTHETIC_ONLY.json'), JSON.stringify({ synthetic_only: true, network_used: false, source: 'INVENTED_FIXTURE' }) + '\n', { flag: 'wx' });
  await fs.writeFile(path.join(inputDir, 'regions.csv'), 'market_code,iso2,iso3,m49,country_zh,country_en,commercial_major_region_zh,commercial_subregion_zh,in_scope\nGB,GB,GBR,826,英国,United Kingdom,Europe,Example,true\n', { flag: 'wx' });
  await fs.writeFile(path.join(inputDir, 'cldr.xml'), '<supplementalData><territoryInfo><territory type="GB"><languagePopulation type="en" populationPercent="100" officialStatus="official"/></territory></territoryInfo></supplementalData>', { flag: 'wx' });
  const html = '<html><title>Example Synthetic Water Works</title><p>Example Synthetic Water Works is a manufacturer of commercial pre-rinse faucets in the United Kingdom. Invented offline fixture.</p></html>';
  await fs.writeFile(path.join(inputDir, 'evidence.html'), html, { flag: 'wx' });
  const suboptions = { ...options, allowNetwork: false, syntheticOnly: true, fetchCldr: false };
  const plan = await execute('plan', demoRoot, runId + '_plan', suboptions);
  if (plan.exit_code !== 0) throw new StageError('DEMO_PLAN_FAILED');
  const gates = [{ axis: 'PRODUCT', pattern: 'commercial pre-rinse faucets' }, { axis: 'ROLE', pattern: 'manufacturer' }, { axis: 'IDENTITY', pattern: 'Example Synthetic Water Works' }].map((gate) => ({ ...gate, url: 'https://example.com/products', file: 'inputs/evidence.html' }));
  await fs.writeFile(path.join(demoRoot, 'data', 'search_candidate_specs.jsonl'), JSON.stringify({ id: 'INVENTED_FIXTURE', family: 'MANUFACTURER', evidence: gates, rows: [] }) + '\n', { flag: 'wx' });
  const verification = await execute('verify', demoRoot, runId + '_verify', suboptions);
  if (verification.exit_code !== 0 || verification.counts.pattern_passes !== 1) throw new StageError('DEMO_VERIFICATION_FAILED');
  // This fabricated approval exists only inside a newly-created invented-fixture runtime.
  // Production candidate results are never converted to approved_public automatically.
  const observedAt = new Date().toISOString();
  const reference = { source_url: 'https://example.com/products', source_sha256: crypto.createHash('sha256').update(html).digest('hex'), observed_at: observedAt, excerpt: 'Invented fixture: Example Synthetic Water Works manufactures commercial pre-rinse faucets in the United Kingdom.' };
  const review = { schema: 'market_discovery.public_review.v1', public_entity_key: 'synthetic:GB:example-water-works', company_name: 'Example Synthetic Water Works', country_code: 'GB', official_website: 'https://example.com/', source_language: 'en', roles: ['manufacturer'], products: ['commercial pre-rinse faucets'], identity_evidence: { company_name: [reference], country_code: [reference], official_website: [reference] }, role_evidence: { manufacturer: [reference] }, product_evidence: { 'commercial pre-rinse faucets': [reference] }, review_status: 'approved_public', reviewed_at: observedAt };
  await fs.writeFile(path.join(inputDir, 'approved_public.jsonl'), JSON.stringify(review) + '\n', { flag: 'wx' });
  const handoff = await execute('handoff', demoRoot, runId + '_handoff', suboptions);
  if (handoff.exit_code !== 0 || handoff.counts.output_records !== 1) throw new StageError('DEMO_HANDOFF_FAILED');
  const outputs = handoff.artifacts.map((artifact) => ({ ...artifact, path: relative + '/' + artifact.path }));
  const manifest = { schema: 'market_discovery.demo_manifest.v1', status: 'SYNTHETIC_OFFLINE_COMPLETE', synthetic_only: true, production_approval: false, network_requests: 0, counts: { tasks: plan.counts.tasks, candidates: verification.counts.candidates, output_records: handoff.counts.output_records }, stages: ['plan', 'verify', 'handoff'], artifacts: outputs };
  await fs.writeFile(path.join(demoRoot, 'demo_manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  return { status: 'COMPLETE', synthetic_only: true, counts: counts({ ...manifest.counts, network_requests: 0 }), artifacts: [...outputs, await describeArtifact(root, relative + '/demo_manifest.json')] };
}

async function main() {
  const args = parseArgs();
  if (Object.keys(args).some((key) => !FLAGS.has(key))) throw new StageError('OPTION_NOT_ALLOWED', 'BLOCKED');
  if (!STAGES.has(args.stage)) throw new StageError('STAGE_NOT_ALLOWED', 'BLOCKED');
  if (args['run-id'] !== undefined && !isValidRunId(args['run-id'])) throw new StageError('RUN_ID_INVALID', 'BLOCKED');
  const root = validateRuntimeRoot(args.root);
  const limit = args.limit === undefined ? 10 : Number(args.limit);
  const concurrency = args.concurrency === undefined ? 1 : Number(args.concurrency);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) throw new StageError('OPTION_OUT_OF_RANGE', 'BLOCKED');
  const markets = args.markets === undefined ? '' : String(args.markets).toUpperCase();
  if (markets && !/^[A-Z]{2}(?:,[A-Z]{2})*$/.test(markets)) throw new StageError('MARKETS_INVALID', 'BLOCKED');
  if (args['allow-network'] !== undefined && typeof args['allow-network'] !== 'boolean') throw new StageError('NETWORK_FLAG_INVALID', 'BLOCKED');
  if (args['fetch-cldr'] !== undefined && typeof args['fetch-cldr'] !== 'boolean') throw new StageError('FETCH_CLDR_FLAG_INVALID', 'BLOCKED');
  await fs.mkdir(root, { recursive: true });
  const lockPath = withinRoot(root, '.market-discovery.lock');
  let lock;
  try { lock = await fs.open(lockPath, 'wx'); } catch (error) { if (error.code === 'EEXIST') throw new StageError('RUNTIME_BUSY', 'BLOCKED'); throw error; }
  const runId = args['run-id'] || new Date().toISOString().replace(/[-:.]/g, '') + '_' + crypto.randomUUID().slice(0, 8);
  try {
    await lock.writeFile(JSON.stringify({ run_id: runId, stage: args.stage, pid: process.pid }));
    for (const stage of STAGES) if (await present(root, `stages/${stage}/${runId}.json`)) throw new StageError('RUN_ID_ALREADY_EXISTS', 'BLOCKED');
    const receipt = await execute(args.stage, root, runId, { allowNetwork: args.stage === 'demo' ? false : args['allow-network'] === true, markets, limit, concurrency, fetchCldr: args['fetch-cldr'] === true });
    process.stdout.write(JSON.stringify(receipt, null, 2) + '\n');
    process.exitCode = receipt.exit_code || 0;
  } finally {
    await lock.close();
    try { const owner = JSON.parse(await fs.readFile(lockPath, 'utf8')); if (owner.run_id === runId) await fs.unlink(lockPath); } catch {}
  }
}

main().catch((error) => {
  const errorCode = error instanceof StageError ? error.code : ['ROOT_REQUIRED', 'FILESYSTEM_ROOT_REFUSED', 'SOURCE_TREE_RUNTIME_REFUSED', 'PRIVATE_RUNTIME_ROOT_REFUSED'].includes(error.message) ? error.message : 'CLI_INPUT_OR_FILESYSTEM_ERROR';
  process.stderr.write(JSON.stringify({ schema: 'market_discovery.stage_receipt.v1', status: cancelled ? 'CANCELLED' : 'BLOCKED', error_code: errorCode, counts: {} }) + '\n');
  process.exitCode = cancelled ? 130 : 2;
});
