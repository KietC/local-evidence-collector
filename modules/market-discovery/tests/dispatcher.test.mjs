import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { repositoryRoot } from '../legacy/runtime-options.mjs';
import { orderDiscoveredTargets } from '../legacy/priority-order.mjs';

const exec = promisify(execFile);
const dispatcher = path.join(repositoryRoot, 'scripts', 'market-discovery.mjs');
async function temporary(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'market-discovery-test-'));
  t.after(async () => {
    const resolved = await fs.realpath(root);
    const parent = await fs.realpath(os.tmpdir());
    if (path.dirname(resolved).toLowerCase() !== parent.toLowerCase() || !path.basename(resolved).startsWith('market-discovery-test-')) throw new Error('Unsafe synthetic cleanup path');
    await fs.rm(resolved, { recursive: true, force: true });
  });
  return root;
}
async function run(root, stage, extra = [], env = {}) {
  try {
    const result = await exec(process.execPath, [dispatcher, `--root=${root}`, `--stage=${stage}`, ...extra], { cwd: repositoryRoot, env: { ...process.env, ...env }, windowsHide: true, timeout: 30000 });
    return { code: 0, result: JSON.parse(result.stdout), stderr: result.stderr };
  } catch (error) {
    return { code: error.code, result: JSON.parse(error.stdout || error.stderr), stderr: error.stderr };
  }
}

test('offline demo creates synthetic handoff files with matching hashes and exact run id', async (t) => {
  const root = await temporary(t);
  const runId = crypto.randomUUID();
  const { code, result } = await run(root, 'demo', [`--run-id=${runId}`]);
  assert.equal(code, 0);
  assert.equal(result.run_id, runId);
  assert.equal(result.status, 'COMPLETE');
  assert.equal(result.synthetic_only, true);
  assert.equal(result.network_allowed, false);
  assert.deepEqual(result.counts, { tasks: 10, candidates: 1, output_records: 1, network_requests: 0 });
  for (const item of result.artifacts) {
    const body = await fs.readFile(path.join(root, item.path));
    assert.equal(body.length, item.bytes);
    assert.equal(crypto.createHash('sha256').update(body).digest('hex'), item.sha256);
  }
  const jsonl = result.artifacts.find((a) => a.path.endsWith('handoff.jsonl'));
  const row = JSON.parse((await fs.readFile(path.join(root, jsonl.path), 'utf8')).trim());
  assert.equal(row.synthetic_only, true);
  assert.equal(row.handoff_state, 'synthetic_fixture_only');
  const before = await fs.readFile(path.join(root, 'stages/demo', runId + '.json'));
  const duplicate = await run(root, 'demo', [`--run-id=${runId}`]);
  assert.equal(duplicate.code, 2);
  assert.equal(duplicate.result.error_code, 'RUN_ID_ALREADY_EXISTS');
  assert.deepEqual(await fs.readFile(path.join(root, 'stages/demo', runId + '.json')), before);
});

test('live stages require opt-in before reading targets and leave bounded receipts', async (t) => {
  const root = await temporary(t);
  for (const stage of ['search', 'penetrate']) {
    const { code, result } = await run(root, stage);
    assert.equal(code, 2);
    assert.equal(result.status, 'BLOCKED');
    assert.equal(result.error_code, 'NETWORK_OPT_IN_REQUIRED');
    const latest = JSON.parse(await fs.readFile(path.join(root, 'stages', stage, 'latest.json')));
    assert.equal(latest.error_code, 'NETWORK_OPT_IN_REQUIRED');
  }
});

test('source roots, unlisted stages, shell options and unbounded numbers are refused', async (t) => {
  const root = await temporary(t);
  const cases = [
    ['demo', ['--limit=101'], 'OPTION_OUT_OF_RANGE'],
    ['demo', ['--concurrency=5'], 'OPTION_OUT_OF_RANGE'],
    ['demo', ['--command=arbitrary'], 'OPTION_NOT_ALLOWED'],
    ['not-a-stage', [], 'STAGE_NOT_ALLOWED'],
    ['demo', ['--run-id=../escape'], 'RUN_ID_INVALID'],
    ['demo', ['--run-id=latest'], 'RUN_ID_INVALID'],
    ['demo', ['--run-id=LaTeSt'], 'RUN_ID_INVALID'],
    ['demo', ['--run-id=manifest'], 'RUN_ID_INVALID'],
  ];
  for (const [stage, args, expected] of cases) {
    const result = await run(root, stage, args);
    assert.equal(result.code, 2);
    assert.equal(result.result.error_code, expected);
  }
  const blocked = await run(path.join(repositoryRoot, 'modules', 'synthetic-runtime-forbidden'), 'demo');
  assert.equal(blocked.code, 2);
  assert.equal(blocked.result.error_code, 'SOURCE_TREE_RUNTIME_REFUSED');
  for (const segment of ['cases', 'training_runs', 'profiles', 'sessions']) {
    const target = path.join(root, segment);
    const refused = await run(target, 'demo');
    assert.equal(refused.code, 2);
    assert.equal(refused.result.error_code, 'PRIVATE_RUNTIME_ROOT_REFUSED');
    await assert.rejects(fs.stat(target), { code: 'ENOENT' });
  }
});

test('missing approved_public input is a blocker and never inferred from candidates', async (t) => {
  const root = await temporary(t);
  await fs.mkdir(path.join(root, 'data'));
  await fs.writeFile(path.join(root, 'data/search_candidate_specs.jsonl'), '{"id":"SYNTHETIC"}\n');
  const result = await run(root, 'handoff');
  assert.equal(result.result.status, 'BLOCKED');
  assert.equal(result.result.error_code, 'REQUIRED_INPUT_MISSING');
});

test('priority uses an environment HMAC key and keeps overlay content private', async (t) => {
  const root = await temporary(t);
  await fs.mkdir(path.join(root, 'inputs'));
  await fs.writeFile(path.join(root, 'inputs/customer_projection.jsonl'), JSON.stringify({ local_id: 'invented-local-id', legal_name: 'Invented Private Name', country: 'GB', official_domain: 'example.com', primary_rank: 1 }) + '\n');
  await fs.writeFile(path.join(root, 'inputs/public_entities.jsonl'), JSON.stringify({ public_entity_key: 'synthetic:GB:example', legal_name: 'Invented Public Name', country: 'GB', official_domain: 'example.com' }) + '\n');
  const blocked = await run(root, 'priority', [], { MARKET_DISCOVERY_HMAC_KEY: '' });
  assert.equal(blocked.result.error_code, 'LOCAL_HMAC_KEY_REQUIRED');
  const pass = await run(root, 'priority', [], { MARKET_DISCOVERY_HMAC_KEY: crypto.randomBytes(32).toString('hex') });
  assert.equal(pass.code, 0);
  assert.equal(pass.result.counts.matched, 1);
  assert.equal(pass.result.counts.network_requests, 0);
  assert(!JSON.stringify(pass.result).includes('invented-local-id'));
  const artifact = pass.result.artifacts[0];
  assert(artifact.path.startsWith('private/priority/'));
  const overlay = await fs.readFile(path.join(root, path.dirname(artifact.path), 'priority_overlay.jsonl'), 'utf8');
  assert(!overlay.includes('invented-local-id'));
  assert(!overlay.includes('Invented Private Name'));
  assert.equal(JSON.parse(overlay.trim()).publication, 'LOCAL_CONFIDENTIAL');
  const mapArtifact = pass.result.artifacts.find((item) => item.path.endsWith('domain_scan_order.json'));
  assert(mapArtifact);
  const map = JSON.parse(await fs.readFile(path.join(root, mapArtifact.path), 'utf8'));
  assert.deepEqual(map.domains, [{ official_domain: 'example.com', scan_order: 1, review_state: 'AUTO_MATCHED' }]);
  const latest = JSON.parse(await fs.readFile(path.join(root, 'private/priority/latest.json'), 'utf8'));
  assert.equal(latest.domain_order_sha256, mapArtifact.sha256);
  assert.deepEqual(latest.input_sha256, pass.result.input_sha256);
});

test('only exact matched domain order precedes discovery frequency without evidence mutation', () => {
  const targets = [{ host: 'unmatched.example.org', discovery_count: 100, score: 99, evidence: ['synthetic'] },
    { host: 'www.example.com', discovery_count: 1, score: 1, evidence: ['other'] },
    { host: 'ambiguous.example.org', discovery_count: 50, score: 30, evidence: [] }];
  const before = structuredClone(targets);
  const document = { schema: 'market_discovery.priority_domain_order.v1', eligibility: 'AUTO_MATCHED_ONLY', domains: [
    { official_domain: 'example.com', scan_order: 2, review_state: 'AUTO_MATCHED' },
    { official_domain: 'ambiguous.example.org', scan_order: 1, review_state: 'NEEDS_REVIEW' },
  ] };
  const ordered = orderDiscoveredTargets(targets, document);
  assert.deepEqual(ordered.map((row) => row.host), ['www.example.com', 'unmatched.example.org', 'ambiguous.example.org']);
  assert.deepEqual(targets, before);
  assert.deepEqual(ordered[0], before[1]);
});

test('a lock with an unknown owner is preserved', async (t) => {
  const root = await temporary(t);
  const owner = JSON.stringify({ pid: 999999, run_id: 'unknown-synthetic-owner' });
  await fs.writeFile(path.join(root, '.market-discovery.lock'), owner);
  const result = await run(root, 'demo');
  assert.equal(result.result.error_code, 'RUNTIME_BUSY');
  assert.equal(await fs.readFile(path.join(root, '.market-discovery.lock'), 'utf8'), owner);
});
