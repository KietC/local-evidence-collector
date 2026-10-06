// Curated historical implementation with explicit local runtime inputs.
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { runtimeOptions, requireNetwork, translatedTermStatus, isAcceptedTerm } from "./runtime-options.mjs";

const { args, root: ROOT } = runtimeOptions();
const REGIONS = path.resolve(args.regions || path.join(ROOT, "inputs", "regions.csv"));
const CLDR_INPUT = path.resolve(args.cldr || path.join(ROOT, "inputs", "cldr.xml"));
const TERMS_INPUT = args["terms-input"] ? path.resolve(args["terms-input"]) : "";
const OFFLINE = args.offline === true || args["allow-network"] !== true;
const CLDR_URL = "https://raw.githubusercontent.com/unicode-org/cldr/release-48-2/common/supplemental/supplementalData.xml";
const CAPTURED_AT = new Date().toISOString();

const sha = (value) => crypto.createHash("sha256").update(value).digest("hex").toUpperCase();
const stableId = (...parts) => sha(parts.map((v) => String(v ?? "")).join("\u001f")).slice(0, 24);
const clean = (v) => String(v ?? "").replace(/^\uFEFF/, "").trim();

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ""; }
    else if (ch === '\n') { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += ch;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  const headers = rows.shift().map(clean);
  return rows.filter((r) => r.some((v) => clean(v))).map((r) => Object.fromEntries(headers.map((h, i) => [h, clean(r[i])])));
}

function csvEscape(value) {
  const s = String(value ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

async function writeRows(baseName, rows) {
  const dataDir = path.join(ROOT, "data");
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(dataDir, `${baseName}.jsonl`), rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""), "utf8");
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => csvEscape(Array.isArray(r[h]) ? r[h].join("；") : typeof r[h] === "object" && r[h] !== null ? JSON.stringify(r[h]) : r[h])).join(","))].join("\r\n") + "\r\n";
  await fs.writeFile(path.join(dataDir, `${baseName}.csv`), "\uFEFF" + csv, "utf8");
}

async function fileInfo(file) {
  const bytes = await fs.readFile(file);
  const stat = await fs.stat(file);
  return { path: file, bytes: bytes.length, sha256: sha(bytes), last_write_utc: stat.mtime.toISOString() };
}

async function fetchBytes(url, timeoutMs = 30000) {
  requireNetwork(args);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0", "accept-language": "en-US,en;q=0.8" }, signal: controller.signal });
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { bytes, finalUrl: response.url, status: response.status, contentType: response.headers.get("content-type") || "" };
  } finally { clearTimeout(timer); }
}

function parseAttrs(text) {
  return Object.fromEntries([...text.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
}

function parseTerritoryInfo(xml) {
  const out = new Map();
  for (const match of xml.matchAll(/<territory\s+([^>]*\btype="[^"]+"[^>]*)>([\s\S]*?)<\/territory>/g)) {
    const territoryAttrs = parseAttrs(match[1]);
    const languages = [];
    for (const lang of match[2].matchAll(/<languagePopulation\s+([^>]*)\/>/g)) {
      const attrs = parseAttrs(lang[1]);
      languages.push({
        language_code: attrs.type || "",
        population_percent: Number(attrs.populationPercent || 0),
        writing_percent: Number(attrs.writingPercent || attrs.literacyPercent || 0),
        official_status: attrs.officialStatus || "",
      });
    }
    out.set(territoryAttrs.type, languages);
  }
  return out;
}

function languageTag(code) {
  const parts = clean(code).replaceAll("_", "-").split("-");
  if (!parts[0]) return "en";
  if (parts[0] === "zh") return parts.some((p) => p.toLowerCase() === "hant") ? "zh-TW" : "zh-CN";
  return parts.join("-");
}

function translationCode(code) {
  const base = languageTag(code).split("-")[0].toLowerCase();
  const map = { he: "iw", jv: "jw", fil: "tl", nb: "no", nn: "no", cmn: "zh-CN", yue: "zh-TW" };
  return map[base] || base;
}

function nativeName(type, code, value) {
  try { return new Intl.DisplayNames([languageTag(code)], { type }).of(value) || value; }
  catch { return value; }
}

function scriptOf(code) {
  try { return new Intl.Locale(languageTag(code)).maximize().script || ""; }
  catch { return ""; }
}

function pickLanguages(market, languageMap) {
  const candidates = [...(languageMap.get(market.iso2) || [])].filter((x) => x.language_code);
  const statusRank = { official: 5, de_facto_official: 4, official_regional: 3, official_minority: 2, "": 0 };
  candidates.sort((a, b) => (statusRank[b.official_status] - statusRank[a.official_status]) || (b.population_percent - a.population_percent) || a.language_code.localeCompare(b.language_code));
  const national = candidates.filter((x) => ["official", "de_facto_official"].includes(x.official_status));
  const primary = national[0] || candidates[0] || { language_code: "en", population_percent: 0, writing_percent: 0, official_status: "de_facto_fallback" };
  const remaining = candidates.filter((x) => x.language_code !== primary.language_code);
  const secondary = remaining.find((x) => ["official", "de_facto_official", "official_regional", "official_minority"].includes(x.official_status)) || remaining.find((x) => x.population_percent >= 10) || null;
  const chosen = new Set([primary.language_code, secondary?.language_code].filter(Boolean).map((x) => languageTag(x).split("-")[0]));
  const englishSupplement = !chosen.has("en");
  return { candidates, primary, secondary, englishSupplement, fallback: !languageMap.has(market.iso2) };
}

const PHRASES = [
  ["context_commercial_kitchen", "commercial kitchen equipment"],
  ["context_restaurant", "restaurant equipment"],
  ["cluster1_pre_rinse", "commercial pre-rinse faucet"],
  ["cluster1_kitchen_faucet", "commercial kitchen faucet"],
  ["cluster1_spray_valve", "pre-rinse spray valve"],
  ["cluster1_sensor", "commercial sensor faucet"],
  ["cluster2_sink", "commercial stainless steel sink"],
  ["cluster2_glass_rinser", "commercial glass rinser"],
  ["cluster2_hose_reel", "commercial hose reel"],
  ["cluster2_washdown", "commercial washdown system"],
  ["cluster3_water_dispenser", "commercial water dispenser"],
  ["cluster3_filtration", "point-of-use water filtration system"],
  ["cluster3_drinking_tap", "commercial drinking water tap"],
  ["cluster3_hot_cold", "commercial hot and cold water dispenser"],
  ["cluster4_sparkling", "commercial sparkling water dispenser"],
  ["cluster4_carbonation", "commercial carbonation system"],
  ["cluster4_beverage", "commercial beverage dispensing system"],
  ["cluster4_soda_tap", "commercial soda water tap"],
  ["role_manufacturer", "manufacturer"],
  ["role_factory", "factory"],
  ["role_oem", "OEM manufacturer"],
  ["role_distributor", "distributor"],
  ["role_dealer", "dealer"],
  ["role_importer", "importer"],
  ["role_supplier", "supplier"],
  ["source_association", "foodservice equipment association"],
  ["source_trade_fair", "trade fair exhibitor"],
  ["source_authorized", "authorized dealer network"],
  ["source_certification", "product certification directory"],
  ["nav_products", "products"],
  ["nav_brands", "brands"],
  ["nav_about", "about us"],
  ["nav_contact", "contact us"],
];

const MANUAL = {
  en: {},
  zh: { cluster1_pre_rinse: "商用预冲洗龙头", cluster1_kitchen_faucet: "商用厨房龙头", cluster2_sink: "商用不锈钢水槽", cluster3_water_dispenser: "商用饮水机", cluster3_filtration: "商用净水系统", cluster4_sparkling: "商用气泡水机", role_manufacturer: "制造商", role_factory: "工厂", role_distributor: "经销商", role_dealer: "代理商", role_importer: "进口商", role_supplier: "供应商", context_commercial_kitchen: "商用厨房设备" },
  de: { cluster1_pre_rinse: "Vorspülarmatur für Großküchen", cluster2_sink: "Gewerbespüle aus Edelstahl", cluster3_water_dispenser: "gewerblicher Wasserspender", role_manufacturer: "Hersteller", role_distributor: "Vertriebspartner", role_dealer: "Händler", context_commercial_kitchen: "Großküchentechnik" },
  fr: { cluster1_pre_rinse: "robinet de prélavage professionnel", cluster2_sink: "évier professionnel en inox", cluster3_water_dispenser: "fontaine à eau professionnelle", role_manufacturer: "fabricant", role_distributor: "distributeur", role_dealer: "revendeur", context_commercial_kitchen: "matériel de cuisine professionnelle" },
  es: { cluster1_pre_rinse: "grifo de prelavado industrial", cluster2_sink: "fregadero industrial de acero inoxidable", cluster3_water_dispenser: "dispensador de agua comercial", role_manufacturer: "fabricante", role_distributor: "distribuidor", role_dealer: "distribuidor", context_commercial_kitchen: "equipamiento de cocina industrial" },
  it: { cluster1_pre_rinse: "rubinetto di prelavaggio professionale", cluster2_sink: "lavello professionale in acciaio inox", cluster3_water_dispenser: "distributore d'acqua professionale", role_manufacturer: "produttore", role_distributor: "distributore", role_dealer: "rivenditore", context_commercial_kitchen: "attrezzature per cucine professionali" },
  pt: { cluster1_pre_rinse: "torneira de pré-lavagem industrial", cluster2_sink: "pia industrial de aço inoxidável", cluster3_water_dispenser: "dispensador de água comercial", role_manufacturer: "fabricante", role_distributor: "distribuidor", role_dealer: "revendedor", context_commercial_kitchen: "equipamento de cozinha industrial" },
  nl: { cluster1_pre_rinse: "professionele voorspoelkraan", cluster2_sink: "professionele roestvrijstalen spoelbak", cluster3_water_dispenser: "professionele waterdispenser", role_manufacturer: "fabrikant", role_distributor: "distributeur", role_dealer: "dealer", context_commercial_kitchen: "grootkeukenapparatuur" },
  ru: { cluster1_pre_rinse: "профессиональный душирующий кран", cluster2_sink: "профессиональная мойка из нержавеющей стали", cluster3_water_dispenser: "профессиональный диспенсер для воды", role_manufacturer: "производитель", role_distributor: "дистрибьютор", role_dealer: "дилер", context_commercial_kitchen: "профессиональное кухонное оборудование" },
  ja: { cluster1_pre_rinse: "業務用プレリンス水栓", cluster2_sink: "業務用ステンレスシンク", cluster3_water_dispenser: "業務用ウォーターディスペンサー", role_manufacturer: "メーカー", role_distributor: "販売代理店", role_dealer: "販売店", context_commercial_kitchen: "業務用厨房機器" },
  ko: { cluster1_pre_rinse: "상업용 프리린스 수전", cluster2_sink: "업소용 스테인리스 싱크대", cluster3_water_dispenser: "상업용 정수기", role_manufacturer: "제조업체", role_distributor: "유통업체", role_dealer: "대리점", context_commercial_kitchen: "상업용 주방 장비" },
  tr: { cluster1_pre_rinse: "endüstriyel ön yıkama bataryası", cluster2_sink: "endüstriyel paslanmaz çelik evye", cluster3_water_dispenser: "ticari su sebili", role_manufacturer: "üretici", role_distributor: "distribütör", role_dealer: "bayi", context_commercial_kitchen: "endüstriyel mutfak ekipmanları" },
  ar: { cluster1_pre_rinse: "حنفية شطف مسبق تجارية", cluster2_sink: "حوض تجاري من الفولاذ المقاوم للصدأ", cluster3_water_dispenser: "موزع مياه تجاري", role_manufacturer: "مصنع", role_distributor: "موزع", role_dealer: "وكيل", context_commercial_kitchen: "معدات المطابخ التجارية" },
};

function tokenSet(text) {
  return new Set(clean(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").split(/\s+/).filter((x) => x.length > 2));
}

function similarity(a, b) {
  const x = tokenSet(a), y = tokenSet(b);
  if (!x.size || !y.size) return 0;
  const intersection = [...x].filter((v) => y.has(v)).length;
  return intersection / new Set([...x, ...y]).size;
}

async function translateBatch(target, phrases) {
  if (target === "en") return phrases.map((x) => x[1]);
  const query = phrases.map((x) => x[1]).join("\n");
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${encodeURIComponent(target)}&dt=t&q=${encodeURIComponent(query)}`;
  const result = await fetchBytes(url, 30000);
  const payload = JSON.parse(Buffer.from(result.bytes).toString("utf8"));
  const translated = (payload?.[0] || []).map((x) => x?.[0] || "").join("").split("\n");
  if (translated.length !== phrases.length) throw new Error(`translation count mismatch ${translated.length}/${phrases.length}`);
  return translated.map(clean);
}

async function backTranslateBatch(source, texts) {
  if (source === "en") return texts;
  const query = texts.join("\n");
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(source)}&tl=en&dt=t&q=${encodeURIComponent(query)}`;
  const result = await fetchBytes(url, 30000);
  const payload = JSON.parse(Buffer.from(result.bytes).toString("utf8"));
  const translated = (payload?.[0] || []).map((x) => x?.[0] || "").join("").split("\n");
  if (translated.length !== texts.length) throw new Error(`back translation count mismatch ${translated.length}/${texts.length}`);
  return translated.map(clean);
}

async function pool(items, concurrency, worker) {
  let cursor = 0;
  const output = new Array(items.length);
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      output[index] = await worker(items[index], index);
    }
  }));
  return output;
}

function termMap(rows, languageCode) {
  return Object.fromEntries(rows.filter((r) => r.language_code === languageCode && isAcceptedTerm(r)).map((r) => [r.term_key, r.term_local]));
}

function quotedOr(value) {
  return clean(value).split("；").filter(Boolean).slice(0, 2).map((x) => `"${x.replaceAll('"', '')}"`).join(" OR ");
}

function makeTasks(matrix, terms) {
  const tasks = [];
  const clusterKeys = {
    C1: [["cluster1_pre_rinse", "cluster1_kitchen_faucet"], "龙头与预冲洗"],
    C2: [["cluster2_sink", "cluster2_hose_reel"], "水槽与清洗"],
    C3: [["cluster3_water_dispenser", "cluster3_filtration"], "饮水与净水"],
    C4: [["cluster4_sparkling", "cluster4_beverage"], "气泡水与饮料分配"],
  };
  const slots = [
    ["PRIMARY", "primary_language_code", "primary_language_tag", "primary_country_name_local"],
    ["SECONDARY", "secondary_language_code", "secondary_language_tag", "secondary_country_name_local"],
    ["ENGLISH_SUPPLEMENT", "english_supplement_language_code", "english_supplement_language_tag", "country_en"],
  ];
  for (const market of matrix) for (const [slot, codeKey, tagKey, countryKey] of slots) {
    const languageCode = market[codeKey];
    if (!languageCode || (slot === "PRIMARY" && market.language_source_status === "CLDR_MISSING_FALLBACK")) continue;
    const t = termMap(terms, languageCode);
    const countryName = market[countryKey] || market.country_en;
    const context = quotedOr(t.context_commercial_kitchen || t.context_restaurant);
    for (const [clusterId, [keys, clusterZh]] of Object.entries(clusterKeys)) {
      const product = keys.map((k) => t[k]).filter(Boolean).map((x) => `"${x.replaceAll('"', '')}"`).join(" OR ");
      for (const [intent, roleKeys] of [["MANUFACTURER", ["role_manufacturer", "role_factory", "role_oem"]], ["DEALER", ["role_distributor", "role_dealer", "role_importer", "role_supplier"]]]) {
        const roles = roleKeys.map((k) => t[k]).filter(Boolean).slice(0, 3).map((x) => `"${x.replaceAll('"', '')}"`).join(" OR ");
        if (!product || !roles || !context) continue;
        const query = `(${product}) (${roles}) ${context} "${countryName.replaceAll('"', '')}"`;
        tasks.push({ task_id: `LLQ-${stableId(market.market_code || market.iso2, slot, clusterId, intent, query)}`, iso2: market.iso2, market_code: market.market_code, country_zh: market.country_zh, country_en: market.country_en, commercial_major_region_zh: market.commercial_major_region_zh, commercial_subregion_zh: market.commercial_subregion_zh, language_slot: slot, language_code: languageCode, language_tag: market[tagKey], language_name_native: nativeName("language", languageCode, languageTag(languageCode)), country_name_local: countryName, query_family: `${clusterId}_${intent}`, product_cluster: clusterZh, intent, query, engine: "BING_RSS", status: "QUEUED" });
      }
    }
    const sourceQueries = [
      ["OFFICIAL_ASSOCIATION_EXHIBITOR", ["source_association", "source_trade_fair"]],
      ["OFFICIAL_AUTHORIZED_CERTIFICATION", ["source_authorized", "source_certification"]],
    ];
    for (const [family, keys] of sourceQueries) {
      const sourceTerms = keys.map((k) => t[k]).filter(Boolean).map((x) => `"${x.replaceAll('"', '')}"`).join(" OR ");
      const product = quotedOr(t.context_commercial_kitchen || t.cluster3_water_dispenser);
      if (!sourceTerms || !product) continue;
      const query = `(${sourceTerms}) ${product} "${countryName.replaceAll('"', '')}"`;
      tasks.push({ task_id: `LLQ-${stableId(market.market_code || market.iso2, slot, family, query)}`, iso2: market.iso2, market_code: market.market_code, country_zh: market.country_zh, country_en: market.country_en, commercial_major_region_zh: market.commercial_major_region_zh, commercial_subregion_zh: market.commercial_subregion_zh, language_slot: slot, language_code: languageCode, language_tag: market[tagKey], language_name_native: nativeName("language", languageCode, languageTag(languageCode)), country_name_local: countryName, query_family: family, product_cluster: "官方行业来源", intent: "OFFICIAL_SOURCE", query, engine: "BING_RSS", status: "QUEUED" });
    }
  }
  return tasks;
}

async function main() {
  const rawDir = path.join(ROOT, "raw_artifacts", "foundation");
  await fs.mkdir(rawDir, { recursive: true });
  await fs.mkdir(path.join(ROOT, "checkpoints"), { recursive: true });
  const cldrResult = args["fetch-cldr"]
    ? await fetchBytes(CLDR_URL)
    : { bytes: new Uint8Array(await fs.readFile(CLDR_INPUT)) };
  const cldrPath = path.join(rawDir, "cldr_release_48_2_supplementalData.xml");
  await fs.writeFile(cldrPath, cldrResult.bytes);
  const cldrXml = Buffer.from(cldrResult.bytes).toString("utf8");
  const territoryInfo = parseTerritoryInfo(cldrXml);
  const regionText = await fs.readFile(REGIONS, "utf8");
  const allMarkets = parseCsv(regionText);
  const markets = allMarkets.filter((r) => r.in_scope.toLowerCase() === "true");
  if (!markets.length) throw new Error("No in-scope markets");
  if (new Set(markets.map((m) => m.market_code || m.iso2)).size !== markets.length) throw new Error("Duplicate market key");
  if (args["expected-markets"] && markets.length !== Number(args["expected-markets"])) throw new Error("Market count contract mismatch");

  const matrix = markets.map((market) => {
    const selected = pickLanguages(market, territoryInfo);
    const primaryCode = selected.primary.language_code;
    const secondaryCode = selected.secondary?.language_code || "";
    return {
      market_language_id: `ML-${stableId(market.market_code || market.iso2, primaryCode, secondaryCode)}`,
      iso2: market.iso2,
      iso3: market.iso3,
      m49: market.m49,
      market_code: market.market_code,
      country_zh: market.country_zh,
      country_en: market.country_en,
      commercial_major_region_zh: market.commercial_major_region_zh,
      commercial_subregion_zh: market.commercial_subregion_zh,
      primary_language_code: primaryCode,
      primary_language_tag: languageTag(primaryCode),
      primary_language_name_en: nativeName("language", "en", languageTag(primaryCode)),
      primary_language_name_native: nativeName("language", primaryCode, languageTag(primaryCode)),
      primary_script: scriptOf(primaryCode),
      primary_official_status: selected.primary.official_status,
      primary_population_percent: selected.primary.population_percent,
      primary_country_name_local: nativeName("region", primaryCode, market.iso2),
      secondary_language_code: secondaryCode,
      secondary_language_tag: secondaryCode ? languageTag(secondaryCode) : "",
      secondary_language_name_en: secondaryCode ? nativeName("language", "en", languageTag(secondaryCode)) : "",
      secondary_language_name_native: secondaryCode ? nativeName("language", secondaryCode, languageTag(secondaryCode)) : "",
      secondary_script: secondaryCode ? scriptOf(secondaryCode) : "",
      secondary_official_status: selected.secondary
        ? (selected.secondary.official_status || "FUNCTIONAL_COMMERCIAL")
        : "NOT_APPLICABLE",
      secondary_population_percent: selected.secondary?.population_percent || 0,
      secondary_country_name_local: secondaryCode ? nativeName("region", secondaryCode, market.iso2) : "",
      secondary_reason: secondaryCode ? "最高优先级剩余官方/区域官方/高覆盖商业语言" : "无第二官方、区域官方或功能人口占比达到10%的语言",
      english_supplement_required: selected.englishSupplement,
      english_supplement_language_code: selected.englishSupplement ? "en" : "",
      english_supplement_language_tag: selected.englishSupplement ? "en" : "",
      language_source_status: selected.fallback ? "CLDR_MISSING_FALLBACK" : "CLDR_SUPPLIED",
      language_source_url: args["fetch-cldr"] ? CLDR_URL : "",
      captured_at_utc: CAPTURED_AT,
    };
  });

  const activeCodes = [...new Set(matrix.flatMap((m) => [m.primary_language_code, m.secondary_language_code, m.english_supplement_language_code]).filter(Boolean))].sort();
  const translationReceipts = [];
  const translatedByCode = new Map();
  if (!OFFLINE && !TERMS_INPUT) await pool(activeCodes, 4, async (code, index) => {
    const target = translationCode(code);
    let status = "SUCCESS", error = "", translated = [], back = [];
    try {
      translated = await translateBatch(target, PHRASES);
      const manual = MANUAL[target] || MANUAL[languageTag(code).split("-")[0]] || {};
      translated = translated.map((value, i) => manual[PHRASES[i][0]] || value);
      back = await backTranslateBatch(target, translated);
      translatedByCode.set(code, { translated, back, target });
    } catch (exc) {
      status = "BLOCKED"; error = `${exc.name}: ${exc.message}`;
      if (code === "en") { translated = PHRASES.map((x) => x[1]); back = translated; translatedByCode.set(code, { translated, back, target: "en" }); status = "SUCCESS"; error = ""; }
    }
    translationReceipts.push({ receipt_id: `TR-${stableId(code, CAPTURED_AT)}`, language_code: code, translation_code: target, phrase_count: PHRASES.length, status, error, source_url: "https://translate.googleapis.com/", captured_at_utc: CAPTURED_AT });
    if ((index + 1) % 20 === 0 || index + 1 === activeCodes.length) console.log(`translations ${index + 1}/${activeCodes.length}`);
  });

  const termRows = [];
  if (TERMS_INPUT) {
    const supplied = (await fs.readFile(TERMS_INPUT, "utf8")).replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean).map(JSON.parse);
    const seen = new Set();
    for (const term of supplied) {
      const key = String(term.language_code || "") + "|" + String(term.term_key || "");
      if (seen.has(key)) throw new Error("Duplicate supplied term key");
      if (!activeCodes.includes(term.language_code) || !PHRASES.some(([key]) => key === term.term_key)) throw new Error("Unknown supplied term language/key");
      if (!clean(term.term_local)) throw new Error("Empty supplied term");
      seen.add(key);
      termRows.push({ ...term, term_id: "TERM-" + stableId(term.language_code, term.term_key, term.term_local), captured_at_utc: CAPTURED_AT });
    }
  } else if (OFFLINE) {
    for (const code of activeCodes) {
      const manual = MANUAL[languageTag(code).split("-")[0]] || {};
      for (const [key, english] of PHRASES) {
        const local = code === "en" ? english : manual[key];
        if (!local) continue;
        termRows.push({ term_id: "TERM-" + stableId(code, key, local), language_code: code, language_tag: languageTag(code), term_key: key, term_en: english, term_local: local, validation_status: "ACCEPTED_CURATED", translation_source: code === "en" ? "SOURCE_ENGLISH" : "CURATED_INDUSTRY_TERM", captured_at_utc: CAPTURED_AT });
      }
    }
  }
  for (const code of activeCodes) {
    const result = translatedByCode.get(code);
    if (!result) continue;
    const manual = MANUAL[result.target] || MANUAL[languageTag(code).split("-")[0]] || {};
    PHRASES.forEach(([key, english], i) => {
      const local = clean(result.translated[i]);
      const back = clean(result.back[i]);
      const score = code === "en" ? 1 : similarity(english, back);
      const manualHit = Boolean(manual[key]);
      const validationStatus = translatedTermStatus({ curated: manualHit, sourceEnglish: code === "en", similarity: score });
      termRows.push({ term_id: `TERM-${stableId(code, key, local)}`, language_code: code, language_tag: languageTag(code), language_name_en: nativeName("language", "en", languageTag(code)), language_name_native: nativeName("language", code, languageTag(code)), script: scriptOf(code), term_key: key, term_en: english, term_local: local, back_translation_en: back, back_translation_similarity: Number(score.toFixed(4)), validation_status: validationStatus, translation_source: manualHit ? "CURATED_INDUSTRY_TERM" : code === "en" ? "SOURCE_ENGLISH" : "PUBLIC_MACHINE_TRANSLATION_WITH_BACKCHECK", captured_at_utc: CAPTURED_AT });
    });
  }

  const tasks = makeTasks(matrix, termRows);
  for (const market of matrix) {
    for (const [prefix, slot] of [["primary", "PRIMARY"], ["secondary", "SECONDARY"], ["english_supplement", "ENGLISH_SUPPLEMENT"]]) {
      const code = market[prefix + "_language_code"];
      const count = tasks.filter((task) => task.market_code === market.market_code && task.language_slot === slot).length;
      market[prefix + "_task_status"] = !code ? "NOT_APPLICABLE" : count === 10 ? "READY" : count > 0 ? "BLOCKED_PARTIAL_TERM_VALIDATION" : "BLOCKED_TERM_VALIDATION";
      market[prefix + "_generated_task_count"] = count;
    }
  }

  await writeRows("market_language_matrix", matrix);
  await writeRows("multilingual_product_terms", termRows);
  await writeRows("market_search_tasks", tasks);
  await writeRows("translation_receipts", translationReceipts.sort((a, b) => a.language_code.localeCompare(b.language_code)));

  const manifest = {
    status: matrix.every((m) => m.primary_task_status === "READY" && !Object.entries(m).some(([k, v]) => k.endsWith("_task_status") && String(v).startsWith("BLOCKED"))) ? "FOUNDATION_READY" : "FOUNDATION_PARTIAL_TERM_BLOCKERS",
    execution_mode: OFFLINE ? "OFFLINE" : "NETWORK_TRANSLATION",
    generated_at_utc: CAPTURED_AT,
    inputs: {
      regions: await fileInfo(REGIONS),
      terms: TERMS_INPUT ? await fileInfo(TERMS_INPUT) : null,
      cldr: await fileInfo(cldrPath),
    },
    counts: {
      region_rows: allMarkets.length,
      in_scope_markets: markets.length,
      active_language_codes: activeCodes.length,
      translated_language_codes: translatedByCode.size,
      term_rows: termRows.length,
      search_tasks: tasks.length,
      primary_ready: matrix.filter((m) => m.primary_task_status === "READY").length,
      primary_blocked: matrix.filter((m) => m.primary_task_status !== "READY").length,
      secondary_ready: matrix.filter((m) => m.secondary_task_status === "READY").length,
      secondary_not_applicable: matrix.filter((m) => m.secondary_task_status === "NOT_APPLICABLE").length,
      secondary_blocked: matrix.filter((m) => m.secondary_task_status === "BLOCKED_TERM_VALIDATION").length,
      english_supplement_markets: matrix.filter((m) => m.english_supplement_required).length,
    },
  };
  await fs.writeFile(path.join(ROOT, "checkpoints", "FOUNDATION_READY.json"), JSON.stringify(manifest, null, 2), "utf8");
  console.log(JSON.stringify(manifest, null, 2));
}

await main();
