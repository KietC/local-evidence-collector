import path from 'node:path';
import fs from 'node:fs';

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) throw new Error('Use --name=value or --flag');
    const i = arg.indexOf('=');
    const key = i < 0 ? arg.slice(2) : arg.slice(2, i);
    if (!key || Object.hasOwn(args, key)) throw new Error('Empty or duplicate option');
    const value = i < 0 ? true : arg.slice(i + 1);
    args[key] = value === 'false' ? false : value === 'true' ? true : value;
  }
  return args;
}

export const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const contains = (parent, child) => {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
};

export function validateRuntimeRoot(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('ROOT_REQUIRED');
  const root = path.resolve(value);
  const privateSegments = new Set(['cases', 'training_runs', 'profiles', 'sessions', 'browser', 'cookies', 'mail', 'emails', 'customer_exports']);
  if (root.split(/[\\/]+/).some((part) => privateSegments.has(part.toLowerCase()))) throw new Error('PRIVATE_RUNTIME_ROOT_REFUSED');
  if (root === path.parse(root).root) throw new Error('FILESYSTEM_ROOT_REFUSED');
  if (contains(repositoryRoot, root) && !contains(path.join(repositoryRoot, 'runtime'), root)) throw new Error('SOURCE_TREE_RUNTIME_REFUSED');
  // Reject existing symlink/reparse ancestors before a writer starts.
  let cursor = root;
  while (true) {
    if (fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink()) throw new Error('Runtime symlink ancestor refused');
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return root;
}

export function runtimeOptions() {
  const args = parseArgs();
  return { args, root: validateRuntimeRoot(args.root) };
}

export function requireNetwork(args) {
  if (args['allow-network'] !== true || args.offline === true) throw new Error('Network disabled; explicit --allow-network required');
}

export function withinRoot(root, relativePath) {
  if (typeof relativePath !== 'string' || !relativePath) throw new Error('Local evidence file is required');
  const file = path.resolve(root, relativePath);
  const relative = path.relative(root, file);
  if (!relative || relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) throw new Error('Local evidence must stay under runtime root');
  let cursor = file;
  while (cursor !== root) {
    if (fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink()) throw new Error('Local evidence symlink refused');
    cursor = path.dirname(cursor);
  }
  return file;
}

export const curlCommand = process.platform === 'win32' ? 'curl.exe' : 'curl';

export function isReusableOnlineReceipt(receipt) {
  return receipt?.passed === true
    && receipt.synthetic_only === false
    && receipt.verification_mode === 'ONLINE_PATTERN_CHECK'
    && ['NODE_DIRECT', 'CURL_EXPLICIT_PROXY'].includes(receipt.transport)
    && Boolean(receipt.artifact_path && receipt.content_sha256);
}

export function translatedTermStatus({ curated, sourceEnglish, similarity }) {
  if (curated) return 'ACCEPTED_CURATED';
  if (sourceEnglish) return 'ACCEPTED_SOURCE_ENGLISH';
  return Number.isFinite(similarity) && similarity >= 0.12 ? 'REVIEW_REQUIRED_BACKTRANSLATION' : 'TRIAL_ONLY';
}

export function isAcceptedTerm(row) {
  return ['ACCEPTED_CURATED', 'ACCEPTED_REVIEWED', 'ACCEPTED_SOURCE_ENGLISH'].includes(row?.validation_status)
    && typeof row.term_local === 'string' && row.term_local.trim().length > 0;
}

export function isValidRunId(value) {
  const reserved = new Set(['latest', 'manifest', 'index', 'status', 'checkpoint', 'lock', 'current', 'metadata', 'receipts']);
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value) && !reserved.has(value.toLowerCase());
}
