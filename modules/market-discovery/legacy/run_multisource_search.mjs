// Curated historical implementation with explicit local runtime inputs.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { runtimeOptions, requireNetwork, curlCommand } from './runtime-options.mjs';

const execFileAsync = promisify(execFile);
const { args, root } = runtimeOptions();
const tasksFile = path.join(root, 'data', 'market_search_tasks.jsonl');
const lane = path.join(root, 'lanes', 'search_v2');
const receiptsFile = path.join(lane, 'attempt_receipts_v2.jsonl');
const leadsFile = path.join(lane, 'search_leads_v2.jsonl');
const retractionsFile = path.join(lane, 'lead_retractions_v3.jsonl');
const browserReceiptsFile = path.join(root, 'lanes', 'search_browser', 'yahoo_jp_browser_receipts.jsonl');
const browserLeadsFile = path.join(root, 'lanes', 'search_browser', 'yahoo_jp_browser_leads.jsonl');
const mode = args.mode || 'pilot';
const concurrency = Math.max(1, Math.min(4, Number(args.concurrency || 1)));
const delayMs = Math.max(0, Number(args.delay || 1500));
const maxEngines = Math.max(2, Math.min(7, Number(args['max-engines'] || 4)));
const proxy = args.proxy || '';
const pilotMarkets = new Set(String(args.markets || '').split(',').map((x) => x.trim().toUpperCase()).filter(Boolean));
const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36';
const sha = (v) => crypto.createHash('sha256').update(v).digest('hex').toUpperCase();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const engineCooldownUntil = new Map();
let searxLastRequestAt = 0;

async function readJsonl(file) {
  try { return (await fs.readFile(file, 'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse); }
  catch (e) { if (e.code === 'ENOENT') return []; throw e; }
}
async function appendJsonl(file, rows) {
  if (!rows.length) return;
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, rows.map(JSON.stringify).join('\n') + '\n', 'utf8');
}
function decodeHtml(s = '') {
  return String(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}
function stripHtml(s = '') {
  return decodeHtml(String(s)
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ').trim());
}
function hostOf(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); }
  catch { return ''; }
}
function quoted(query) { return [...String(query).matchAll(/"([^"]+)"/g)].map((m) => m[1]); }
function simplifiedQuery(task) {
  const q = quoted(task.query);
  if (task.query_family.startsWith('C')) return [q[0], q[2], q.at(-1)].filter(Boolean).join(' ');
  return [q[0], q.at(-2), q.at(-1)].filter(Boolean).join(' ');
}
function relevanceTokens(task) {
  const q = quoted(task.query);
  const phrases = q.slice(0, 2);
  const stop = new Set([
    'commercial','professional','equipment','system','kitchen','manufacturer','factory','dealer',
    'distributor','importer','authorized','association','directory','trade','product','supplier',
  ]);
  const out = new Set();
  for (const phrase of phrases) {
    const p = phrase.toLocaleLowerCase();
    if (p.length >= 4) out.add(p);
    for (const token of p.match(/[\p{L}\p{N}]{3,}/gu) || []) if (!stop.has(token)) out.add(token);
    for (const token of p.match(/[\u3400-\u9fff]{2,}/g) || []) out.add(token);
  }
  return [...out];
}
function annotateHits(hits, task) {
  const tokens = relevanceTokens(task);
  return hits.map((hit, i) => {
    const text = `${hit.title || ''} ${hit.snippet || ''}`.toLocaleLowerCase();
    const matched = tokens.filter((t) => text.includes(t));
    const phraseMatches = matched.filter((t) => /\s/u.test(t) || /[\u3400-\u9fff]{4,}/u.test(t));
    const meaningfulTokens = matched.filter((t) => !/^(use|point|water|commercial|professional)$/iu.test(t));
    const productMatch = phraseMatches.length > 0 || meaningfulTokens.length >= 2;
    return {
      ...hit,
      position: hit.position || i + 1,
      host: hit.host || hostOf(hit.url),
      matched_terms: matched,
      relevance_signal: productMatch ? 'LEXICAL_PRODUCT_MATCH' : 'NO_PRODUCT_TERM_MATCH',
    };
  });
}

async function directFetch(url, languageTag) {
  requireNetwork(args);
  const response = await fetch(url, {
    headers: { 'user-agent': ua, 'accept-language': `${languageTag || 'en'},en;q=0.6` },
    redirect: 'follow', signal: AbortSignal.timeout(15000),
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  return { bytes, status: response.status, finalUrl: response.url, contentType: response.headers.get('content-type') || '', transport: 'NODE_DIRECT' };
}
async function curlFetch(url, languageTag) {
  requireNetwork(args);
  if (!proxy) throw new Error('No explicit proxy configured');
  const marker = '\n__CODEX_META__';
  const { stdout } = await execFileAsync(curlCommand, [
    '-x', proxy, '-L', '--max-time', '18', '--connect-timeout', '6', '-sS', '-A', ua,
    '-H', `Accept-Language: ${languageTag || 'en'},en;q=0.6`,
    '-w', `${marker}%{http_code}\t%{url_effective}\t%{content_type}`, url,
  ], { encoding: 'buffer', maxBuffer: 24 * 1024 * 1024, windowsHide: true });
  const idx = stdout.lastIndexOf(Buffer.from(marker));
  if (idx < 0) throw new Error('CURL_META_MISSING');
  const bytes = stdout.subarray(0, idx);
  const [code, finalUrl, contentType] = stdout.subarray(idx + Buffer.byteLength(marker)).toString('utf8').split('\t');
  if (Number(code) < 200 || Number(code) >= 400) throw new Error(`HTTP_${code}`);
  return { bytes, status: Number(code), finalUrl, contentType, transport: 'CURL_EXPLICIT_PROXY' };
}
async function fetchResilient(url, languageTag) {
  try { return await directFetch(url, languageTag); }
  catch (directError) {
    if (!proxy) throw directError;
    try {
      const result = await curlFetch(url, languageTag);
      result.directError = `${directError.name}: ${directError.message}`;
      return result;
    } catch (proxyError) {
      throw new Error(`direct=${directError.message}; proxy=${proxyError.message}`);
    }
  }
}

function parseYahooJp(html) {
  const hits = [];
  const cards = html.match(/<div class="sw-Card Algo">[\s\S]*?<\/section><\/div><\/div>/gi) || [];
  for (const card of cards) {
    const url = decodeHtml(
      /<a[^>]*href="([^"]+)"[^>]*class="sw-Card__titleInner"/i.exec(card)?.[1]
      || /<a[^>]*class="sw-Card__titleInner"[^>]*href="([^"]+)"/i.exec(card)?.[1]
      || '',
    );
    const title = stripHtml(/<h3[^>]*>([\s\S]*?)<\/h3>/i.exec(card)?.[1] || '');
    const snippet = stripHtml(/<p[^>]*class="sw-Card__summary"[^>]*>([\s\S]*?)<\/p>/i.exec(card)?.[1] || '').slice(0, 700);
    if (!/^https?:\/\//i.test(url) || !title || /(^|\.)yahoo\.co\.jp$/i.test(hostOf(url))) continue;
    if (!hits.some((x) => x.url === url)) hits.push({ url, title, snippet });
    if (hits.length >= 12) break;
  }
  return hits;
}
function decodeYahooUsUrl(href = '') {
  const decoded = decodeHtml(href);
  const match = /\/RU=([^/]+)\/RK=/i.exec(decoded);
  if (match) {
    try { return decodeURIComponent(match[1]); } catch { return ''; }
  }
  try { return new URL(decoded, 'https://search.yahoo.com/').href; } catch { return ''; }
}
function parseYahooUs(html) {
  const hits = [];
  for (const heading of html.matchAll(/<h3[^>]*class="[^"]*\btitle\b[^"]*"[^>]*>([\s\S]*?)<\/h3>/gi)) {
    const before = html.slice(Math.max(0, heading.index - 2200), heading.index);
    const anchors = [...before.matchAll(/<a[^>]+href="([^"]+)"[^>]*>/gi)];
    const href = anchors.at(-1)?.[1] || '';
    if (!href || /\/rdclks\//i.test(href)) continue;
    const url = decodeYahooUsUrl(href);
    const title = stripHtml(heading[1]);
    const after = html.slice(heading.index + heading[0].length, heading.index + heading[0].length + 2200);
    const snippet = stripHtml(/<p[^>]*>([\s\S]*?)<\/p>/i.exec(after)?.[1] || '').slice(0, 700);
    const host = hostOf(url);
    if (!/^https?:\/\//i.test(url) || !title || /(^|\.)yahoo\.com$/i.test(host) || /(^|\.)bing\.com$/i.test(host)) continue;
    if (!hits.some((x) => x.url === url)) hits.push({ url, title, snippet });
    if (hits.length >= 12) break;
  }
  return hits;
}
function parseBingRss(xml) {
  const hits = [];
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 12);
  for (const item of items) {
    const body = item[1];
    const title = stripHtml(/<title>([\s\S]*?)<\/title>/i.exec(body)?.[1] || '');
    const url = decodeHtml(/<link>([\s\S]*?)<\/link>/i.exec(body)?.[1] || '').trim();
    const snippet = stripHtml(/<description>([\s\S]*?)<\/description>/i.exec(body)?.[1] || '').slice(0, 700);
    if (/^https?:\/\//i.test(url) && title) hits.push({ url, title, snippet });
  }
  return hits;
}
function parseSearxJson(raw) {
  let payload;
  try { payload = JSON.parse(raw); } catch { return []; }
  const hits = [];
  for (const result of Array.isArray(payload.results) ? payload.results : []) {
    const url = String(result.url || '');
    const title = stripHtml(result.title || '');
    const snippet = stripHtml(result.content || '').slice(0, 700);
    if (!/^https?:\/\//i.test(url) || !title) continue;
    hits.push({ url, title, snippet, upstream_engine: result.engine || '', upstream_engines: result.engines || [] });
    if (hits.length >= 20) break;
  }
  return hits;
}
function decodeDuckDuckGoUrl(href = '') {
  try {
    const absolute = new URL(decodeHtml(href), 'https://html.duckduckgo.com/');
    if (/duckduckgo\.com$/i.test(absolute.hostname)) {
      const target = absolute.searchParams.get('uddg');
      if (target) return decodeURIComponent(target);
    }
    return absolute.href;
  } catch { return ''; }
}
function parseDuckDuckGo(html) {
  const hits = [];
  const cards = html.split(/<div[^>]+class="[^"]*\bresult\b[^"]*"[^>]*>/i).slice(1);
  for (const card of cards) {
    const anchor = /<a[^>]+class="[^"]*\bresult__a\b[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(card)
      || /<a[^>]+href="([^"]+)"[^>]+class="[^"]*\bresult__a\b[^"]*"[^>]*>([\s\S]*?)<\/a>/i.exec(card);
    if (!anchor) continue;
    const url = decodeDuckDuckGoUrl(anchor[1]);
    const title = stripHtml(anchor[2]);
    const snippet = stripHtml(/<a[^>]+class="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/a>/i.exec(card)?.[1] || '').slice(0, 700);
    const host = hostOf(url);
    if (!/^https?:\/\//i.test(url) || !title || /(^|\.)duckduckgo\.com$/i.test(host)) continue;
    if (!hits.some((x) => x.url === url)) hits.push({ url, title, snippet });
    if (hits.length >= 12) break;
  }
  return hits;
}
function parseBrave(html) {
  const hits = [];
  const cards = html.split(/<div class="snippet [^"]*"[^>]*data-type="web"[^>]*>/i).slice(1);
  for (const card of cards) {
    const head = card.slice(0, 12000);
    const anchor = /<a[^>]+href="(https?:\/\/[^"#]+)"[^>]*>[\s\S]*?<div[^>]+class="[^"]*\bsearch-snippet-title\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(head);
    if (!anchor) continue;
    const url = decodeHtml(anchor[1]);
    const title = stripHtml(anchor[2]);
    const snippet = stripHtml(/<div[^>]+class="[^"]*\bgeneric-snippet\b[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?:<|$)/i.exec(head)?.[1] || '').slice(0, 700);
    const host = hostOf(url);
    if (!title || /(^|\.)search\.brave\.com$/i.test(host)) continue;
    if (!hits.some((x) => x.url === url)) hits.push({ url, title, snippet });
    if (hits.length >= 12) break;
  }
  return hits;
}
function parseNaver(html) {
  const hits = [];
  const anchors = [...html.matchAll(/<a[^>]*href="(https?:\/\/[^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
  for (const match of anchors) {
    const url = decodeHtml(match[1]);
    const host = hostOf(url);
    const title = stripHtml(match[2]);
    if (!title || title.length < 5 || /(^|\.)naver\.com$|(^|\.)naver\.net$/i.test(host)) continue;
    const around = html.slice(Math.max(0, match.index - 200), Math.min(html.length, match.index + match[0].length + 700));
    const snippet = stripHtml(around).slice(0, 700);
    if (!hits.some((x) => x.url === url)) hits.push({ url, title, snippet });
    if (hits.length >= 20) break;
  }
  return hits;
}
function parseRedirectEngine(html, base, engineHost) {
  const hits = [];
  const blocks = [...html.matchAll(/<h3[^>]*>[\s\S]*?<\/h3>/gi)];
  for (const blockMatch of blocks) {
    const around = html.slice(Math.max(0, blockMatch.index - 800), Math.min(html.length, blockMatch.index + blockMatch[0].length + 800));
    const href = /<a[^>]*href="([^"]+)"/i.exec(around)?.[1] || '';
    let url = decodeHtml(href);
    try { url = new URL(url, base).href; } catch { continue; }
    const title = stripHtml(blockMatch[0]);
    const snippet = stripHtml(around).slice(0, 700);
    if (!title || hostOf(url) === engineHost) continue;
    if (!hits.some((x) => x.url === url)) hits.push({ url, title, snippet });
    if (hits.length >= 12) break;
  }
  return hits;
}

function enginePlan(task, query) {
  const tag = String(task.language_tag || '').toLowerCase();
  const code = String(task.language_code || '').toLowerCase();
  const iso2 = String(task.iso2 || '').toUpperCase();
  const plan = [];
  if (tag.startsWith('zh') || code.startsWith('zh')) {
    plan.push({ id: 'BAIDU_HTML', ext: 'html', url: `https://www.baidu.com/s?wd=${encodeURIComponent(query)}`, parse: (text) => parseRedirectEngine(text, 'https://www.baidu.com/', 'baidu.com') });
    plan.push({ id: 'SOGOU_HTML', ext: 'html', url: `https://www.sogou.com/web?query=${encodeURIComponent(query)}`, parse: (text) => parseRedirectEngine(text, 'https://www.sogou.com/', 'sogou.com') });
  }
  if (tag.startsWith('ko') || code.startsWith('ko') || iso2 === 'KR') {
    plan.push({ id: 'NAVER_HTML', ext: 'html', url: `https://search.naver.com/search.naver?query=${encodeURIComponent(query)}`, parse: parseNaver });
  }
  // Seznam exposes server-rendered result cards and remained usable when
  // Brave/Yahoo/DDG applied burst limits.  Keep it as the independent global
  // baseline instead of allowing a degraded Bing-only task to look terminal.
  if (!plan.length) {
    plan.push({
      id: 'SEZNAM_HTML',
      ext: 'html',
      url: `https://search.seznam.cz/?q=${encodeURIComponent(query)}`,
      parse: (text) => parseRedirectEngine(text, 'https://search.seznam.cz/', 'search.seznam.cz'),
    });
  }
  const globalEngines = [
    { id: 'DUCKDUCKGO_HTML', ext: 'html', url: `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, parse: parseDuckDuckGo },
    { id: 'BRAVE_HTML', ext: 'html', url: `https://search.brave.com/search?q=${encodeURIComponent(query)}&source=web`, parse: parseBrave },
    { id: 'YAHOO_JP_HTML', ext: 'html', url: `https://search.yahoo.co.jp/search?p=${encodeURIComponent(query)}&ei=UTF-8`, parse: parseYahooJp },
    { id: 'YAHOO_US_HTML', ext: 'html', url: `https://search.yahoo.com/search?p=${encodeURIComponent(query)}&nojs=1`, parse: parseYahooUs },
  ];
  // Rotate global engines per task instead of hammering every endpoint for all
  // 5,320 queries. Chinese/Korean tasks already have regional engines; other
  // languages use two rotating global engines plus Bing RSS.
  const rotation = Number.parseInt(sha(String(task.task_id || query)).slice(0, 2), 16) % globalEngines.length;
  const globalCount = plan.length ? (plan.some((x) => x.id === 'SEZNAM_HTML') ? 2 : 1) : 3;
  for (let i = 0; i < globalCount; i++) plan.push(globalEngines[(rotation + i) % globalEngines.length]);
  plan.push({ id: 'BING_RSS', ext: 'xml', url: `https://www.bing.com/search?format=rss&setlang=${encodeURIComponent(task.language_tag || task.language_code || 'en')}&cc=${encodeURIComponent(String(task.iso2 || 'US').toLowerCase())}&q=${encodeURIComponent(query)}`, parse: parseBingRss });
  return plan.slice(0, maxEngines);
}

async function runEngine(spec, task) {
  const started = new Date().toISOString();
  const cooldownUntil = engineCooldownUntil.get(spec.id) || 0;
  if (Date.now() < cooldownUntil) {
    return {
      engine: spec.id, target_url: spec.url, final_url: '', transport: '', http_status: 0,
      content_type: '', content_sha256: '', artifact_path: '', started_at_utc: started,
      ended_at_utc: new Date().toISOString(), attempts: 0, raw_result_count: 0,
      qualified_discovery_count: 0, status: 'BLOCKED',
      error: `CIRCUIT_OPEN_UNTIL_${new Date(cooldownUntil).toISOString()}`, hits: [],
    };
  }
  let result = null;
  let error = '';
  let attempts = 0;
  // fetchResilient already performs direct plus explicit-proxy failover. A
  // second full retry here only multiplies TLS timeouts and proxy pressure.
  for (let i = 0; i < 1; i++) {
    attempts = i + 1;
    try { result = await fetchResilient(spec.url, task.language_tag); break; }
    catch (e) {
      error = `${e.name}: ${e.message}`;
      const cooldownMinutes = /HTTP_429/.test(error) ? (spec.id === 'YAHOO_JP_HTML' ? 15 : 5) : 2;
      engineCooldownUntil.set(spec.id, Date.now() + cooldownMinutes * 60 * 1000);
      break;
    }
  }
  let hits = [];
  let artifactPath = '';
  let contentSha = '';
  if (result) {
    contentSha = sha(result.bytes);
    // Search HTML/RSS/JSON bytes are parsed in memory and never retained by this copy.
    hits = annotateHits(spec.parse(result.bytes.toString('utf8')), task);
  }
  return {
    engine: spec.id,
    target_url: spec.url,
    final_url: result?.finalUrl || '',
    transport: result?.transport || '',
    http_status: result?.status || 0,
    content_type: result?.contentType || '',
    content_sha256: contentSha,
    artifact_path: artifactPath,
    started_at_utc: started,
    ended_at_utc: new Date().toISOString(),
    attempts,
    raw_result_count: hits.length,
    qualified_discovery_count: hits.filter((x) => x.relevance_signal === 'LEXICAL_PRODUCT_MATCH').length,
    status: result ? 'SUCCESS' : 'BLOCKED',
    error,
    hits,
  };
}

async function runOne(task) {
  const started = new Date().toISOString();
  const executedQuery = simplifiedQuery(task);
  const specs = enginePlan(task, executedQuery);
  // Two engines at a time preserves independent-source coverage without making
  // every task wait for four sequential direct/proxy timeout chains. Task-level
  // concurrency remains separately capped by --concurrency.
  const attempts = new Array(specs.length);
  let engineCursor = 0;
  await Promise.all(Array.from({ length: Math.min(2, specs.length) }, async () => {
    while (true) {
      const i = engineCursor++;
      if (i >= specs.length) return;
      if (i > 0) await sleep(200);
      attempts[i] = await runEngine(specs[i], task);
    }
  }));
  let successful = attempts.filter((x) => x.status === 'SUCCESS');
  if (args['searx-url'] && !successful.some((x) => x.engine !== 'BING_RSS')) {
    // Public SearXNG is a rate-limited fallback only. It fans one request into
    // independent Yandex/Brave/Seznam/Bing upstreams and is never hammered for
    // tasks that already have a non-degraded direct source.
    const elapsed = Date.now() - searxLastRequestAt;
    if (elapsed < 3500) await sleep(3500 - elapsed);
    searxLastRequestAt = Date.now();
    const language = task.language_tag || task.language_code || 'en-US';
    const searxSpec = {
      id: 'SEARXNG_MULTI_JSON', ext: 'json',
      url: `${String(args['searx-url']).replace(/\/$/, '')}/search?q=${encodeURIComponent(executedQuery)}&format=json&language=${encodeURIComponent(language)}&safesearch=0&engines=bing%2Cyandex%2Cbrave%2Cseznam`,
      parse: parseSearxJson,
    };
    attempts.push(await runEngine(searxSpec, task));
    successful = attempts.filter((x) => x.status === 'SUCCESS');
  }
  const acceptedMap = new Map();
  for (const source of successful) for (const hit of source.hits.filter((x) => x.relevance_signal === 'LEXICAL_PRODUCT_MATCH')) {
    const key = `${hostOf(hit.url)}\u001f${hit.url.replace(/[?#].*$/, '')}`;
    if (!acceptedMap.has(key)) acceptedMap.set(key, { ...hit, source_engines: [source.engine] });
    else acceptedMap.get(key).source_engines.push(source.engine);
  }
  const accepted = [...acceptedMap.values()].slice(0, 16);
  const rawCount = successful.reduce((n, x) => n + x.raw_result_count, 0);
  const trustedSuccessful = successful.filter((x) => x.engine !== 'BING_RSS');
  const terminal = accepted.length
    ? 'TARGET_FOUND'
    : !trustedSuccessful.length
      ? 'BLOCKED'
      : 'NO_QUALIFIED_TARGET';
  const ended = new Date().toISOString();
  const receipt = {
    receipt_id: `LLR3-${sha(`${task.task_id}\u001f${started}`).slice(0, 24)}`,
    supersedes_task_id: task.task_id,
    task_id: task.task_id,
    market_code: task.market_code,
    iso2: task.iso2,
    country_zh: task.country_zh,
    language_slot: task.language_slot,
    language_code: task.language_code,
    language_tag: task.language_tag,
    query_family: task.query_family,
    original_query: task.query,
    executed_query: executedQuery,
    engine: 'MULTI_SOURCE_SEARCH_V3',
    engine_sequence: attempts.map((x) => x.engine),
    successful_engines: successful.map((x) => x.engine),
    source_success_count: successful.length,
    target_url: attempts[0]?.target_url || '',
    final_url: attempts.find((x) => x.final_url)?.final_url || '',
    transport: [...new Set(successful.map((x) => x.transport).filter(Boolean))].join(';'),
    http_status: successful.length ? 200 : 0,
    content_type: 'HASHED_RESPONSES_NOT_RETAINED',
    search_snapshots_retained: false,
    content_sha256: successful.length ? sha(successful.map((x) => x.content_sha256).join('\u001f')) : '',
    artifact_path: successful.map((x) => x.artifact_path).filter(Boolean).join(';'),
    started_at_utc: started,
    ended_at_utc: ended,
    attempts: attempts.reduce((n, x) => n + x.attempts, 0),
    raw_result_count: rawCount,
    qualified_discovery_count: accepted.length,
    status: terminal,
    completion_basis: accepted.length
      ? 'QUALIFIED_DISCOVERY_FOUND'
      : trustedSuccessful.length
        ? 'NON_DEGRADED_SEARCH_EXECUTED_NO_QUALIFIED_TARGET'
        : 'DEGRADED_BING_ONLY_REQUIRES_RETRY',
    error: attempts.filter((x) => x.error).map((x) => `${x.engine}:${x.error}`).join(' | '),
    engine_attempts: attempts.map(({ hits, ...rest }) => rest),
    evidence_limit: '多搜索源结果只作发现；纳入业务表仍须闭合官网产品、主体与角色。',
  };
  const leads = accepted.map((hit) => ({
    lead_id: `LLLEAD3-${sha(`${task.task_id}\u001f${hit.url}`).slice(0, 24)}`,
    task_id: task.task_id,
    market_code: task.market_code,
    iso2: task.iso2,
    country_zh: task.country_zh,
    language_slot: task.language_slot,
    language_code: task.language_code,
    query_family: task.query_family,
    product_cluster: task.product_cluster,
    intent: task.intent,
    ...hit,
    source_class: 'MULTI_SEARCH_DISCOVERY_ONLY',
    captured_at_utc: ended,
  }));
  return { receipt, leads };
}

async function pool(items, size, worker) {
  let cursor = 0;
  const out = new Array(items.length);
  await Promise.all(Array.from({ length: size }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await worker(items[i]);
      if (delayMs) await sleep(delayMs);
    }
  }));
  return out;
}

function normalizeLegacyStatus(receipt) {
  if (!receipt) return receipt;
  if (receipt.status === 'RESULT_ONLY') return { ...receipt, status: 'TARGET_FOUND', legacy_status: 'RESULT_ONLY' };
  if (receipt.status === 'NO_RESULTS') return { ...receipt, status: 'NO_QUALIFIED_TARGET', legacy_status: 'NO_RESULTS' };
  return receipt;
}

function roundRobinMarkets(rows, attemptedCounts) {
  const groups = new Map();
  for (const row of rows) {
    const key = row.market_code || row.iso2 || 'ZZ';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const markets = [...groups.keys()].sort((a, b) => (attemptedCounts.get(a) || 0) - (attemptedCounts.get(b) || 0) || a.localeCompare(b));
  const output = [];
  let remaining = rows.length;
  while (remaining > 0) {
    for (const market of markets) {
      const group = groups.get(market);
      if (!group.length) continue;
      output.push(group.shift());
      remaining--;
    }
  }
  return output;
}

async function main() {
  requireNetwork(args);
  if (!['pilot', 'full'].includes(mode)) throw new Error('--mode must be pilot or full');
  if (mode === 'pilot' && !pilotMarkets.size) throw new Error('Pilot requires explicit --markets=XX,YY');
  if (![concurrency, delayMs, maxEngines].every(Number.isFinite)) throw new Error('Invalid numeric option');
  await fs.mkdir(path.join(root, 'checkpoints'), { recursive: true });
  await fs.mkdir(lane, { recursive: true });
  const tasks = await readJsonl(tasksFile);
  const existing = await readJsonl(receiptsFile);
  const browserReceipts = await readJsonl(browserReceiptsFile);
  const latestExisting = new Map();
  for (const receipt of existing) latestExisting.set(receipt.task_id, receipt);
  for (const receipt of browserReceipts) if (receipt.status !== 'BLOCKED') latestExisting.set(receipt.task_id, normalizeLegacyStatus(receipt));
  const repairTime = new Date().toISOString();
  const statusCorrections = [...latestExisting.values()]
    .filter((receipt) => {
      if (receipt.status === 'RESULT_ONLY' || receipt.status === 'NO_RESULTS') return true;
      if (receipt.status !== 'INVALID_QUERY') return false;
      const engines = Array.isArray(receipt.successful_engines) ? receipt.successful_engines : [];
      return engines.length > 0;
    })
    .map((receipt) => ({
      ...receipt,
      receipt_id: `LLR3FIX-${sha(`${receipt.receipt_id}\u001f${repairTime}`).slice(0, 24)}`,
      supersedes_receipt_id: receipt.receipt_id,
      started_at_utc: repairTime,
      ended_at_utc: repairTime,
      status: receipt.status === 'RESULT_ONLY'
        ? 'TARGET_FOUND'
        : (receipt.successful_engines || []).some((engine) => engine !== 'BING_RSS')
          ? 'NO_QUALIFIED_TARGET'
          : 'BLOCKED',
      corrected_from_status: receipt.status,
      completion_basis: receipt.status === 'RESULT_ONLY'
        ? 'QUALIFIED_DISCOVERY_FOUND'
        : (receipt.successful_engines || []).some((engine) => engine !== 'BING_RSS')
          ? 'NON_DEGRADED_SEARCH_EXECUTED_NO_QUALIFIED_TARGET'
          : 'DEGRADED_BING_ONLY_REQUIRES_RETRY',
      error: [receipt.error, `AUTO_CORRECTION: legacy status ${receipt.status} normalized to the task contract.`].filter(Boolean).join(' | '),
    }));
  if (statusCorrections.length) {
    await appendJsonl(receiptsFile, statusCorrections);
    for (const receipt of statusCorrections) latestExisting.set(receipt.task_id, receipt);
    console.log(JSON.stringify({ auto_normalized_legacy_statuses: statusCorrections.length }));
  }
  const completedStatuses = new Set(['TARGET_FOUND', 'NO_QUALIFIED_TARGET', 'DUPLICATE']);
  const done = new Set([...latestExisting].filter(([, r]) => completedStatuses.has(r.status)).map(([taskId]) => taskId));
  const unseen = tasks.filter((r) => !latestExisting.has(r.task_id));
  const blocked = tasks.filter((r) => ['BLOCKED', 'INVALID_QUERY'].includes(latestExisting.get(r.task_id)?.status));
  const taskById = new Map(tasks.map((task) => [task.task_id, task]));
  const attemptedCounts = new Map();
  for (const taskId of latestExisting.keys()) {
    const market = taskById.get(taskId)?.market_code;
    if (market) attemptedCounts.set(market, (attemptedCounts.get(market) || 0) + 1);
  }
  let selected = roundRobinMarkets([...unseen, ...blocked].filter((r) => !done.has(r.task_id)), attemptedCounts);
  if (args['repair-only']) selected = [];
  if (args['task-ids']) {
    const forced = new Set(String(args['task-ids']).split(',').filter(Boolean));
    selected = tasks.filter((r) => forced.has(r.task_id));
  }
  if (mode === 'pilot') selected = selected.filter((r) => pilotMarkets.has(r.market_code));
  if (args.limit) selected = selected.slice(0, Number(args.limit));
  console.log(JSON.stringify({
    mode, task_total: tasks.length, already_done: done.size, unseen: unseen.length,
    retryable_nonterminal: blocked.length,
    retryable_blocked: blocked.filter((r) => latestExisting.get(r.task_id)?.status === 'BLOCKED').length,
    retryable_invalid_query: blocked.filter((r) => latestExisting.get(r.task_id)?.status === 'INVALID_QUERY').length,
    selected: selected.length, concurrency,
    delay_ms: delayMs, max_engines: maxEngines, proxy,
  }));
  let completed = 0;
  for (let offset = 0; offset < selected.length; offset += 12) {
    const batch = selected.slice(offset, offset + 12);
    const results = await pool(batch, concurrency, runOne);
    await appendJsonl(receiptsFile, results.map((x) => x.receipt));
    await appendJsonl(leadsFile, results.flatMap((x) => x.leads));
    completed += batch.length;
    const statuses = Object.fromEntries(['TARGET_FOUND','NO_QUALIFIED_TARGET','INVALID_QUERY','BLOCKED','DUPLICATE'].map((s) => [s, results.filter((x) => x.receipt.status === s).length]));
    const engines = {};
    for (const result of results) for (const engine of result.receipt.successful_engines || []) engines[engine] = (engines[engine] || 0) + 1;
    console.log(JSON.stringify({ progress: `${completed}/${selected.length}`, statuses, successful_engine_tasks: engines }));
    await sleep(700);
  }
  const receipts = await readJsonl(receiptsFile);
  const leads = await readJsonl(leadsFile);
  const browserLeads = await readJsonl(browserLeadsFile);
  const retractions = await readJsonl(retractionsFile);
  const retractedLeadIds = new Set(retractions.map((r) => r.lead_id));
  const uniqueLeads = new Map();
  for (const lead of [...leads, ...browserLeads]) if (!retractedLeadIds.has(lead.lead_id)) uniqueLeads.set(lead.lead_id, lead);
  const activeLeads = [...uniqueLeads.values()];
  const latest = new Map();
  for (const receipt of receipts) latest.set(receipt.task_id, receipt);
  for (const receipt of browserReceipts) if (receipt.status !== 'BLOCKED') latest.set(receipt.task_id, normalizeLegacyStatus(receipt));
  const latestReceipts = [...latest.values()];
  const summary = {
    status: mode === 'full' && latestReceipts.length === tasks.length && latestReceipts.every((r) => completedStatuses.has(r.status)) ? 'SEARCH_V3_COMPLETE' : 'SEARCH_V3_PARTIAL',
    generated_at_utc: new Date().toISOString(), mode,
    task_total: tasks.length,
    unique_tasks_receipted: latestReceipts.length,
    target_found: latestReceipts.filter((r) => ['TARGET_FOUND','RESULT_ONLY'].includes(r.status)).length,
    no_qualified_target: latestReceipts.filter((r) => ['NO_QUALIFIED_TARGET','NO_RESULTS'].includes(r.status)).length,
    invalid_query: latestReceipts.filter((r) => r.status === 'INVALID_QUERY').length,
    blocked: latestReceipts.filter((r) => r.status === 'BLOCKED').length,
    leads: activeLeads.length,
    unique_hosts: new Set(activeLeads.map((r) => r.host).filter(Boolean)).size,
    markets: new Set(latestReceipts.map((r) => r.market_code)).size,
    multisource_receipts: latestReceipts.filter((r) => r.engine === 'MULTI_SOURCE_SEARCH_V3').length,
    browser_assisted_receipts: latestReceipts.filter((r) => r.engine === 'YAHOO_JP_IAB').length,
    engine_success_counts: Object.fromEntries([...new Set(latestReceipts.flatMap((r) => r.successful_engines || []))].map((engine) => [engine, latestReceipts.filter((r) => (r.successful_engines || []).includes(engine)).length])),
  };
  await fs.writeFile(path.join(root, 'checkpoints', `SEARCH_V3_${mode.toUpperCase()}.json`), JSON.stringify(summary, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify(summary, null, 2));
}

await main();
