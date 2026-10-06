// Curated historical implementation with explicit local runtime inputs.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { runtimeOptions, requireNetwork, curlCommand, isAcceptedTerm, withinRoot } from './runtime-options.mjs';
import { orderDiscoveredTargets } from './priority-order.mjs';

const execFileAsync = promisify(execFile);
const { args: cli, root } = runtimeOptions();
requireNetwork(cli);
const useAllSearchLeads = Boolean(cli.all);
const recheckHolds = Boolean(cli['recheck-holds']);
const marketFilter = new Set(String(cli.markets || '').split(',').map((value) => value.trim().toUpperCase()).filter(Boolean));
const leadFiles = useAllSearchLeads
  ? [path.join(root, 'lanes', 'search_v2', 'search_leads_v2.jsonl'), path.join(root, 'lanes', 'search_browser', 'yahoo_jp_browser_leads.jsonl')]
  : [path.join(root, 'lanes', 'search_browser', 'yahoo_jp_browser_leads.jsonl')];
const manufacturerFile = path.join(root, 'data', 'canonical', 'manufacturer_output_rows.jsonl');
const channelFile = path.join(root, 'data', 'canonical', 'channel_output_rows.jsonl');
const multilingualTermsFile = path.join(root, 'data', 'multilingual_product_terms.jsonl');
const outDir = path.join(root, 'lanes', useAllSearchLeads ? 'search_lead_penetration' : 'browser_lead_penetration');
const rawDir = path.join(root, 'raw_artifacts', useAllSearchLeads ? 'search_lead_penetration' : 'browser_lead_penetration');
const outputFile = path.join(outDir, 'penetration_results.jsonl');
const proxy = cli.proxy || '';
const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36';
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex').toUpperCase();

async function readJsonl(file) {
  try { return (await fs.readFile(file, 'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}
function decodeHtml(text = '') {
  return String(text).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}
function textOnly(html = '') {
  return decodeHtml(String(html).replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ').trim());
}
function hostOf(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}
function displayWebsite(row) { return row?.display?.website || row?.website || ''; }

async function directFetch(url) {
  requireNetwork(cli);
  const response = await fetch(url, { headers: { 'user-agent': ua, accept: 'text/html,application/xhtml+xml,application/pdf;q=0.8,*/*;q=0.3' }, redirect: 'follow', signal: AbortSignal.timeout(22000) });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  return { bytes, status: response.status, finalUrl: response.url, contentType: response.headers.get('content-type') || '', transport: 'NODE_DIRECT' };
}
async function proxyFetch(url) {
  requireNetwork(cli);
  if (!proxy) throw new Error('No explicit proxy configured');
  const marker = '\n__META__';
  const { stdout } = await execFileAsync(curlCommand, ['-x', proxy, '-L', '--max-time', '30', '--connect-timeout', '8', '-sS', '-A', ua, '-w', `${marker}%{http_code}\t%{url_effective}\t%{content_type}`, url], { encoding: 'buffer', maxBuffer: 24 * 1024 * 1024, windowsHide: true });
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
    try { const result = await proxyFetch(url); result.direct_error = directError.message; return result; }
    catch (proxyError) { throw new Error(`direct=${directError.message}; proxy=${proxyError.message}`); }
  }
}

const productPatterns = [
  ['商用预冲洗龙头', /pre[-\s]?rinse|vorsp[uü]larmatur|geschirrbrause|pr[ée]lavage|prelavaggio|prelavado/iu],
  ['商用厨房龙头', /commercial kitchen faucet|foodservice faucet|gastronomie.?armatur|gro(ss|ß)k[uü]chen.?armatur|sp[uü]larmatur/iu],
  ['感应龙头', /sensor faucet|touchless faucet|sensor.?armatur|ber[uü]hrungslose.?armatur/iu],
  ['商用水槽', /commercial sink|gastronomie.?sp[uü]le|gewerbesp[uü]le|edelstahlsp[uü]le/iu],
  ['饮水与气泡水设备', /water dispenser|sparkling water|wasserspender|sprudelwasser|trinkwassersystem/iu],
];
const manufacturerPattern = /\bmanufacturer\b|\bfactory\b|\bmanufactures\b|\bproducer\b|\bOEM\b|\bODM\b|\bHersteller\b|\bProduktion\b|\bFertigung\b|\bfabricant\b|\bproduttore\b/iu;
const channelPattern = /\bdealer\b|\bdistributor\b|\bsupplier\b|\bwholesale\b|\bimporter\b|\bH[aä]ndler\b|\bVertrieb\b|\bAnbieter\b|\bOnlineshop\b|\bOnline-Shop\b|\bGastronomiebedarf\b|\bin den Warenkorb\b|\bMarktplatz\b/iu;

const termRows = await readJsonl(multilingualTermsFile);
const termIndex = new Map();
const categoryForKey = (key) => {
  if (/cluster1_pre_rinse/.test(key)) return '商用预冲洗龙头';
  if (/cluster1_kitchen_faucet/.test(key)) return '商用厨房龙头';
  if (/cluster1_sensor/.test(key)) return '感应龙头';
  if (/cluster1_spray_valve/.test(key)) return '预冲洗喷阀';
  if (/cluster2_sink/.test(key)) return '商用水槽';
  if (/cluster2_glass_rinser/.test(key)) return '洗杯器';
  if (/cluster2_(?:hose_reel|washdown)/.test(key)) return '清洗卷盘系统';
  if (/cluster3_/.test(key)) return '饮水与净水设备';
  if (/cluster4_/.test(key)) return '气泡水与饮料分配设备';
  return '';
};
const normalizedTerm = (value) => String(value || '').toLocaleLowerCase().replace(/\s+/gu, ' ').trim();
for (const row of termRows) {
  if (!isAcceptedTerm(row)) continue;
  const code = String(row.language_code || '').toLowerCase();
  const term = normalizedTerm(row.term_local);
  if (!code || term.length < 3) continue;
  if (!termIndex.has(code)) termIndex.set(code, { products: [], manufacturers: new Set(), channels: new Set() });
  const bucket = termIndex.get(code);
  const category = categoryForKey(String(row.term_key || ''));
  if (category) bucket.products.push({ category, term });
  if (/^role_(?:manufacturer|factory|oem)$/.test(row.term_key || '')) bucket.manufacturers.add(term);
  if (/^role_(?:dealer|distributor|importer|supplier)$/.test(row.term_key || '')) bucket.channels.add(term);
}

function scanMultilingualTerms(text, languageCodes = [], discoveryTerms = []) {
  const normalized = normalizedTerm(text);
  const codes = [...new Set(['en', ...languageCodes.map((x) => String(x || '').toLowerCase()).filter(Boolean)])];
  const productHits = new Set();
  let manufacturerSignal = false;
  let channelSignal = false;
  for (const code of codes) {
    const bucket = termIndex.get(code);
    if (!bucket) continue;
    for (const item of bucket.products) if (normalized.includes(item.term)) productHits.add(item.category);
    if ([...bucket.manufacturers].some((term) => normalized.includes(term))) manufacturerSignal = true;
    if ([...bucket.channels].some((term) => normalized.includes(term))) channelSignal = true;
  }
  // Search-engine matched terms are discovery signals only. Requiring the exact
  // term to recur on the fetched official page lets them assist product matching
  // without promoting a search snippet into evidence.
  for (const raw of discoveryTerms) {
    const term = normalizedTerm(raw);
    if (term.length >= 4 && normalized.includes(term)) productHits.add('商用水系统相关产品');
  }
  return { productHits: [...productHits], manufacturerSignal, channelSignal };
}

function extractPage(result, requestedUrl, languageCodes = [], discoveryTerms = []) {
  const html = result.bytes.toString('utf8');
  const text = textOnly(html);
  const title = textOnly(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || '');
  const h1 = textOnly(/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] || '');
  const description = decodeHtml(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)/i.exec(html)?.[1]
    || /<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["'](?:description|og:description)["']/i.exec(html)?.[1] || '').trim();
  const emails = [...new Set((text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu) || []).map((x) => x.toLowerCase()))].slice(0, 10);
  const phones = [...new Set((text.match(/(?:\+?\d[\d\s().\/-]{7,}\d)/g) || []).map((x) => x.replace(/\s+/g, ' ').trim()))].slice(0, 10);
  const socials = [...new Set([...html.matchAll(/href=["'](https?:\/\/(?:www\.)?(?:linkedin\.com\/company|facebook\.com|instagram\.com|youtube\.com|x\.com)\/[^"'#?\s]+)/giu)].map((m) => decodeHtml(m[1])))].slice(0, 12);
  const multilingual = scanMultilingualTerms(text, languageCodes, discoveryTerms);
  const productHits = [...new Set([
    ...productPatterns.filter(([, regex]) => regex.test(text)).map(([name]) => name),
    ...multilingual.productHits,
  ])];
  const sameHostLinks = [...html.matchAll(/href=["']([^"'#]+)["']/giu)].map((m) => {
    try { return new URL(decodeHtml(m[1]), result.finalUrl).href; } catch { return ''; }
  }).filter((url) => url && hostOf(url) === hostOf(result.finalUrl));
  const supportLinks = [...new Set(sameHostLinks.filter((url) => /contact|kontakt|about|impressum|unternehmen|ueber-uns|über-uns/i.test(url)))].slice(0, 3);
  return { requested_url: requestedUrl, final_url: result.finalUrl, http_status: result.status, content_type: result.contentType, transport: result.transport, bytes: result.bytes.length, sha256: sha(result.bytes), title, h1, description, text, emails, phones, socials, product_hits: productHits, manufacturer_signal: manufacturerPattern.test(text) || multilingual.manufacturerSignal, channel_signal: channelPattern.test(text) || multilingual.channelSignal || /\/collections\/|\/shop\/|\/category\/|\/kategorie\//i.test(result.finalUrl), support_links: supportLinks };
}

const browserLeads = (await Promise.all(leadFiles.map(readJsonl))).flat();
const knownRows = [...await readJsonl(manufacturerFile), ...await readJsonl(channelFile)];
const knownHosts = new Set(knownRows.map((row) => hostOf(displayWebsite(row))).filter(Boolean));
// This lane is incremental in both modes. Browser-only runs must never replace
// results already produced by the all-search pass.
const previousResults = await readJsonl(outputFile);
const latestPreviousByHost = new Map();
for (const row of previousResults) latestPreviousByHost.set(row.host, row);
const retryableDecisions = new Set(['BLOCKED', 'HOLD_NO_PRODUCT_MATCH', 'HOLD_ROLE_UNRESOLVED']);
const completedHosts = new Set([...latestPreviousByHost.values()]
  .filter((row) => !(recheckHolds && retryableDecisions.has(row.decision)))
  .map((row) => row.host));
const excludedDiscoveryHosts = /(^|\.)(?:yahoo|lycorp|yahoo-net|bing|duckduckgo|brave|google|baidu|sogou|naver|youtube|facebook|instagram|linkedin|pinterest|wikipedia|amazon|rakuten|kakaku|alibaba|aliexpress|made-in-china|ebay|vevor|homedepot|lowes|go4worldbusiness|goldsupplier|archiexpo|environmental-expert|businessresearchinsights|eventbrite|fliphtml5|epa|ikea|bosch-professional|pricebook|ruparupa|tiktok|bbc|hktdc)\./i;
const grouped = new Map();
for (const lead of browserLeads) {
  if (marketFilter.size && !marketFilter.has(String(lead.market_code || '').toUpperCase())) continue;
  const host = lead.host || hostOf(lead.url);
  if (!host || completedHosts.has(host) || excludedDiscoveryHosts.test(host)) continue;
  if (!grouped.has(host)) grouped.set(host, []);
  grouped.get(host).push({ ...lead, host });
}
let targets = [...grouped].map(([host, leads]) => {
  const lead = [...leads].sort((a, b) => {
    const aProduct = /product|faucet|rinse|armatur|robinet|rubinet|grifo|sink|water/i.test(a.url || '') ? 1 : 0;
    const bProduct = /product|faucet|rinse|armatur|robinet|rubinet|grifo|sink|water/i.test(b.url || '') ? 1 : 0;
    return bProduct - aProduct;
  })[0];
  return { ...lead, host, discovery_count: leads.length, discovery_markets: [...new Set(leads.map((item) => item.market_code).filter(Boolean))], discovery_languages: [...new Set(leads.flatMap((item) => [item.language_code, item.language_tag]).filter(Boolean))], discovery_terms: [...new Set(leads.flatMap((item) => item.matched_terms || []).filter(Boolean))], discovery_engines: [...new Set(leads.flatMap((item) => item.source_engines || [item.source_engine]).filter(Boolean))] };
}).sort((a, b) => b.discovery_count - a.discovery_count || a.host.localeCompare(b.host));
let priorityOrdering = null;
if (cli['priority-map']) {
  const bytes = await fs.readFile(withinRoot(root, String(cli['priority-map'])));
  const document = JSON.parse(bytes.toString('utf8'));
  targets = orderDiscoveredTargets(targets, document);
  priorityOrdering = { usage: 'SCAN_ORDER_ONLY', map_sha256: sha(bytes).toLowerCase(), input_sha256: document.input_sha256 || {}, matched_domains: document.domains.filter((row) => row.review_state === 'AUTO_MATCHED').length };
}
if (cli.limit) targets = targets.slice(0, Math.max(1, Number(cli.limit)));
const results = [];
await fs.mkdir(rawDir, { recursive: true });
for (let index = 0; index < targets.length; index++) {
  const lead = targets[index];
  const started = new Date().toISOString();
  if (knownHosts.has(lead.host)) {
    results.push({ host: lead.host, lead_id: lead.lead_id, decision: 'ALREADY_PRESENT', started_at_utc: started, completed_at_utc: new Date().toISOString(), pages: [] });
    continue;
  }
  const pages = [];
  const errors = [];
  try {
    const result = await fetchResilient(lead.url);
    const page = extractPage(result, lead.url, lead.discovery_languages || [lead.language_code], lead.discovery_terms || lead.matched_terms || []);
    const ext = /pdf/i.test(page.content_type) ? 'pdf' : 'html';
    page.artifact_path = path.join(rawDir, `${String(index + 1).padStart(3, '0')}_${lead.host.replace(/[^a-z0-9.-]/gi, '_')}_${page.sha256.slice(0, 12)}.${ext}`);
    await fs.writeFile(page.artifact_path, result.bytes);
    pages.push(page);
    for (const supportUrl of page.support_links.slice(0, 2)) {
      try {
        const supportResult = await fetchResilient(supportUrl);
        const supportPage = extractPage(supportResult, supportUrl, lead.discovery_languages || [lead.language_code], lead.discovery_terms || lead.matched_terms || []);
        const supportExt = /pdf/i.test(supportPage.content_type) ? 'pdf' : 'html';
        supportPage.artifact_path = path.join(rawDir, `${String(index + 1).padStart(3, '0')}_${lead.host.replace(/[^a-z0-9.-]/gi, '_')}_${supportPage.sha256.slice(0, 12)}.${supportExt}`);
        await fs.writeFile(supportPage.artifact_path, supportResult.bytes);
        pages.push(supportPage);
      } catch (error) { errors.push(`${supportUrl}: ${error.message}`); }
    }
  } catch (error) { errors.push(`${lead.url}: ${error.message}`); }
  const productHits = [...new Set(pages.flatMap((page) => page.product_hits))];
  const manufacturerSignal = pages.some((page) => page.manufacturer_signal);
  const channelSignal = pages.some((page) => page.channel_signal);
  const decision = !pages.length ? 'BLOCKED'
    : !productHits.length ? 'HOLD_NO_PRODUCT_MATCH'
      : manufacturerSignal && channelSignal ? 'DUAL_ROLE_CANDIDATE'
        : manufacturerSignal ? 'MANUFACTURER_CANDIDATE'
          : channelSignal ? 'CHANNEL_CANDIDATE'
            : 'HOLD_ROLE_UNRESOLVED';
  results.push({ host: lead.host, lead_id: lead.lead_id, task_id: lead.task_id, market_code: lead.market_code, discovery_count: lead.discovery_count || 1, discovery_markets: lead.discovery_markets || [lead.market_code], discovery_languages: lead.discovery_languages || [lead.language_code].filter(Boolean), discovery_engines: lead.discovery_engines || [lead.source_engine].filter(Boolean), search_title: lead.title, search_url: lead.url, decision, product_hits: productHits, manufacturer_signal: manufacturerSignal, channel_signal: channelSignal, emails: [...new Set(pages.flatMap((page) => page.emails))], phones: [...new Set(pages.flatMap((page) => page.phones))], socials: [...new Set(pages.flatMap((page) => page.socials))], pages: pages.map(({ text, support_links, ...page }) => page), errors, started_at_utc: started, completed_at_utc: new Date().toISOString() });
  process.stdout.write(`\r${index + 1}/${targets.length}`);
}
process.stdout.write('\n');
await fs.mkdir(outDir, { recursive: true });
await fs.appendFile(outputFile, results.map((row) => JSON.stringify(row)).join('\n') + (results.length ? '\n' : ''), 'utf8');
const allResults = await readJsonl(outputFile);
const latestByHost = new Map();
for (const row of allResults) latestByHost.set(row.host, row);
const latestResults = [...latestByHost.values()];
const summary = {
  status: useAllSearchLeads ? 'SEARCH_LEAD_PENETRATION_PARTIAL' : 'BROWSER_LEAD_PENETRATION_COMPLETE', generated_at_utc: new Date().toISOString(),
  market_filter: [...marketFilter].sort(),
  priority_ordering: priorityOrdering,
  unique_hosts: latestResults.length,
  processed_this_run: results.length,
  remaining_discovered_hosts: Math.max(0, grouped.size - targets.length),
  counts: Object.fromEntries([...new Set(latestResults.map((row) => row.decision))].sort().map((decision) => [decision, latestResults.filter((row) => row.decision === decision).length])),
  product_matched: latestResults.filter((row) => row.product_hits?.length).length,
  fetched_pages: latestResults.reduce((sum, row) => sum + row.pages.length, 0),
};
await fs.writeFile(path.join(outDir, 'penetration_summary.json'), JSON.stringify(summary, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(summary, null, 2));
