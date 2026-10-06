// Curated historical implementation with explicit local runtime inputs.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { runtimeOptions, requireNetwork, withinRoot, curlCommand, isReusableOnlineReceipt } from './runtime-options.mjs';

const execFileAsync = promisify(execFile);
const { args, root } = runtimeOptions();
const specFile = path.join(root, 'data', 'search_candidate_specs.jsonl');
const lane = path.join(root, 'lanes', 'search_candidate_verification');
const rawDir = path.join(root, 'raw_artifacts', 'search_candidate_verification');
const proxy = args.proxy || '';
const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36';
const digest = (value) => crypto.createHash('sha256').update(value).digest('hex').toUpperCase();
const textOnly = (html = '') => {
  const source = String(html);
  const metadata = [];
  for (const match of source.matchAll(/<meta\b[^>]*\bcontent=["']([^"']+)["'][^>]*>/gi)) metadata.push(match[1]);
  for (const match of source.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) metadata.push(match[1]);
  return `${source} ${metadata.join(' ')}`
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/\s+/g, ' ').trim();
};

async function extractEvidenceText(bytes, contentType = '') {
  if (!/pdf/i.test(contentType)) return textOnly(bytes.toString('utf8'));
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = getDocument({ data: new Uint8Array(bytes), disableWorker: true, isEvalSupported: false, enableXfa: false, disableFontFace: true });
  try {
    const document = await loadingTask.promise;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => item.str || '').join(' '));
    }
    return pages.join('\n').replace(/\s+/g, ' ').trim();
  } finally {
    await loadingTask.destroy();
  }
}

async function directFetch(url) {
  requireNetwork(args);
  const response = await fetch(url, { headers: { 'user-agent': ua, accept: 'text/html,application/xhtml+xml,application/pdf;q=0.8,*/*;q=0.2' }, redirect: 'follow', signal: AbortSignal.timeout(25000) });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  return { bytes, status: response.status, finalUrl: response.url, contentType: response.headers.get('content-type') || '', transport: 'NODE_DIRECT' };
}

async function proxyFetch(url) {
  requireNetwork(args);
  if (!proxy) throw new Error('No explicit proxy configured');
  const marker = '\n__META__';
  const { stdout } = await execFileAsync(curlCommand, ['-x', proxy, '-L', '--max-time', '35', '--connect-timeout', '8', '-sS', '-A', ua, '-w', `${marker}%{http_code}\t%{url_effective}\t%{content_type}`, url], { encoding: 'buffer', maxBuffer: 30 * 1024 * 1024, windowsHide: true });
  const index = stdout.lastIndexOf(Buffer.from(marker));
  if (index < 0) throw new Error('CURL_META_MISSING');
  const bytes = stdout.subarray(0, index);
  const [code, finalUrl, contentType] = stdout.subarray(index + Buffer.byteLength(marker)).toString('utf8').split('\t');
  if (Number(code) < 200 || Number(code) >= 400) throw new Error(`HTTP_${code}`);
  return { bytes, status: Number(code), finalUrl, contentType, transport: 'CURL_EXPLICIT_PROXY' };
}

async function fetchResilient(url) {
  try { return await directFetch(url); }
  catch (directError) {
    if (!proxy) throw directError;
    const result = await proxyFetch(url);
    result.direct_error = directError.message;
    return result;
  }
}

async function fetchGate(gate) {
  if (args.offline === true) {
    const file = withinRoot(root, gate.file);
    return { bytes: await fs.readFile(file), status: 200, finalUrl: gate.url || 'https://example.invalid/evidence', contentType: gate.content_type || 'text/html', transport: 'SYNTHETIC_LOCAL_FILE' };
  }
  requireNetwork(args);
  return fetchResilient(gate.url);
}

function validateSpec(spec) {
  const errors = [];
  if (!/^[A-Za-z0-9_-]+$/.test(spec.id || '')) errors.push('INVALID_ID');
  if (!['MANUFACTURER', 'DEALER'].includes(spec.family)) errors.push('INVALID_FAMILY');
  if (!Array.isArray(spec.evidence) || !spec.evidence.length) return [...errors, 'EMPTY_EVIDENCE'];
  const axes = new Set();
  for (const gate of spec.evidence) {
    if (!/^[A-Za-z0-9_-]+$/.test(gate.axis || '')) errors.push('INVALID_AXIS');
    for (const axis of String(gate.axis || '').toUpperCase().split('_')) axes.add(axis);
    if (typeof gate.pattern !== 'string' || !gate.pattern.trim()) errors.push('EMPTY_PATTERN');
    else { try { new RegExp(gate.pattern, 'i'); } catch { errors.push('INVALID_PATTERN'); } }
    if (args.offline === true && !gate.file) errors.push('LOCAL_FILE_REQUIRED');
    if (args.offline !== true && !/^https:\/\//i.test(gate.url || '')) errors.push('HTTPS_URL_REQUIRED');
  }
  for (const axis of ['PRODUCT', 'ROLE', 'IDENTITY']) if (!axes.has(axis)) errors.push('MISSING_' + axis);
  return errors;
}

if (args.offline !== true) requireNetwork(args);
const specs = (await fs.readFile(specFile, 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
await fs.mkdir(lane, { recursive: true });
await fs.mkdir(rawDir, { recursive: true });
const receiptFile = path.join(lane, 'verification_receipts.jsonl');
const priorReceipts = (await fs.readFile(receiptFile, 'utf8').catch(() => ''))
  .split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const receiptCache = new Map();
for (const receipt of priorReceipts) {
  if (args.offline === true) continue;
  if (!isReusableOnlineReceipt(receipt)) continue;
  try {
    const bytes = await fs.readFile(receipt.artifact_path);
    if (digest(bytes) !== receipt.content_sha256) continue;
    receiptCache.set(`${receipt.candidate_id}\u001f${receipt.axis}\u001f${receipt.url}\u001f${receipt.required_pattern}`, receipt);
  } catch {}
}
const verified = [];
const receipts = [];

for (const spec of specs) {
  const validationErrors = validateSpec(spec);
  if (validationErrors.length) {
    verified.push({ ...spec, evidence: undefined, decision: 'HOLD_INVALID_EVIDENCE_CONTRACT', validation_errors: validationErrors, verification_evidence: [], synthetic_only: args.offline === true, manual_review_required: true, export_eligible: false });
    continue;
  }
  const evidence = [];
  for (const gate of spec.evidence) {
    const cacheKey = `${spec.id}\u001f${gate.axis}\u001f${gate.url}\u001f${gate.pattern}`;
    const cached = receiptCache.get(cacheKey);
    if (cached) {
      receipts.push(cached);
      evidence.push(cached);
      continue;
    }
    const started = new Date().toISOString();
    try {
      const fetched = await fetchGate(gate);
      const contentSha = digest(fetched.bytes);
      const ext = /pdf/i.test(fetched.contentType) ? 'pdf' : 'html';
      const artifactPath = path.join(rawDir, `${spec.id}_${gate.axis}_${contentSha.slice(0, 12)}.${ext}`);
      await fs.writeFile(artifactPath, fetched.bytes);
      const visibleText = await extractEvidenceText(fetched.bytes, fetched.contentType);
      let textArtifactPath = '';
      let textSha256 = '';
      if (ext === 'pdf') {
        textArtifactPath = artifactPath.replace(/\.pdf$/i, '.txt');
        await fs.writeFile(textArtifactPath, visibleText + '\n', 'utf8');
        textSha256 = digest(Buffer.from(visibleText + '\n', 'utf8'));
      }
      const required = new RegExp(gate.pattern, 'i');
      const passed = required.test(visibleText);
      const receipt = { candidate_id: spec.id, axis: gate.axis, url: gate.url, final_url: fetched.finalUrl, http_status: fetched.status, transport: fetched.transport, synthetic_only: args.offline === true, verification_mode: args.offline === true ? 'SYNTHETIC_PATTERN_CHECK' : 'ONLINE_PATTERN_CHECK', content_type: fetched.contentType, bytes: fetched.bytes.length, content_sha256: contentSha, artifact_path: artifactPath, extracted_text_path: textArtifactPath, extracted_text_sha256: textSha256, required_pattern: gate.pattern, passed, started_at_utc: started, completed_at_utc: new Date().toISOString() };
      receipts.push(receipt);
      evidence.push(receipt);
    } catch (error) {
      const receipt = { candidate_id: spec.id, axis: gate.axis, url: gate.url, http_status: 0, passed: false, error: error.message, started_at_utc: started, completed_at_utc: new Date().toISOString() };
      receipts.push(receipt);
      evidence.push(receipt);
    }
  }
  const accepted = evidence.length > 0 && evidence.length === spec.evidence.length && evidence.every((item) => item.passed);
  verified.push({ ...spec, evidence: undefined, decision: accepted ? (args.offline === true ? `SYNTHETIC_GATE_PASS_${spec.family}` : `NEW_KEEP_${spec.family}`) : 'HOLD_EVIDENCE_INCOMPLETE', synthetic_only: args.offline === true, manual_review_required: true, export_eligible: false, verification_evidence: evidence, verified_at_utc: new Date().toISOString() });
  console.log(`${spec.id}\t${accepted ? 'ACCEPT' : 'HOLD'}\t${evidence.filter((item) => item.passed).length}/${evidence.length}`);
}

await fs.writeFile(path.join(lane, 'verified_candidates.jsonl'), verified.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');
await fs.writeFile(receiptFile, receipts.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');
const summary = {
  status: 'SEARCH_CANDIDATE_VERIFICATION_COMPLETE',
  generated_at_utc: new Date().toISOString(),
  candidates: verified.length,
  pattern_passes_requiring_review: verified.filter((row) => row.decision.startsWith('NEW_KEEP_')).length,
  approved_public_exports: 0,
  synthetic_gate_passes: verified.filter((row) => row.decision.startsWith('SYNTHETIC_GATE_PASS_')).length,
  synthetic_only: args.offline === true,
  held: verified.filter((row) => row.decision.startsWith('HOLD_')).length,
  pattern_matched_rows_requiring_review: verified.filter((row) => row.decision.startsWith('NEW_KEEP_')).reduce((sum, row) => sum + (row.rows?.length || 0), 0),
  receipts: receipts.length,
  passed_receipts: receipts.filter((row) => row.passed).length,
};
await fs.writeFile(path.join(lane, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(summary, null, 2));
