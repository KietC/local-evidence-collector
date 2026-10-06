// A local scan-order overlay is never an evidence or quality score.
export function normalizedOfficialDomain(value) {
  try {
    const url = new URL(String(value).includes('://') ? String(value) : `https://${value}`);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    return url.hostname.toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
  } catch { return ''; }
}

export function priorityDomainMap(document) {
  if (document?.schema !== 'market_discovery.priority_domain_order.v1'
    || document.eligibility !== 'AUTO_MATCHED_ONLY' || !Array.isArray(document.domains)) throw new Error('PRIORITY_MAP_SCHEMA_INVALID');
  const map = new Map();
  for (const row of document.domains) {
    if (row?.review_state !== 'AUTO_MATCHED') continue;
    const host = normalizedOfficialDomain(row.official_domain);
    if (!host || !Number.isSafeInteger(row.scan_order) || row.scan_order < 1) throw new Error('PRIORITY_MAP_ROW_INVALID');
    map.set(host, Math.min(map.get(host) ?? Infinity, row.scan_order));
  }
  return map;
}

export function orderDiscoveredTargets(targets, document = null) {
  const ranks = document ? priorityDomainMap(document) : new Map();
  const rank = (row) => ranks.get(normalizedOfficialDomain(row.host || row.url)) ?? Infinity;
  return [...targets].sort((a, b) => {
    const ar = rank(a), br = rank(b);
    if (ar !== br) return ar < br ? -1 : 1;
    return (b.discovery_count || 0) - (a.discovery_count || 0) || String(a.host || '').localeCompare(String(b.host || ''));
  });
}
