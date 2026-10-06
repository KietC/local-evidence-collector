---
name: market-discovery
description: Plan and run evidence-led public manufacturer and distributor discovery with this repository's local stages, optional customer priority ordering, reviewed multilingual terms, and a review handoff. Use for market research and candidate verification, not outreach sending or CRM modification.
---

# Market discovery

Use the market-discovery module shipped in this repository. It is integrated with
the CLI and local control panel; a reviewed handoff is not a CRM import.

## Find the implementation

Resolve `../..` from the directory containing this `SKILL.md`, not from the
caller's working directory. That is the repository root when this skill remains
under `skills/market-discovery/`. Verify that its `package.json` contains the
`market:discovery` command, then read [the workflow and input contracts](../../docs/MARKET_DISCOVERY.md).
Run commands from that root. If the skill was copied elsewhere, use an explicitly
selected checkout and verify the same package script; do not guess a production
workspace or scan unrelated disks. No global skill installation is required.

## Select and run the next stage

- Preserve the requested countries, product scope, languages, and stop point.
  Reuse the selected local runtime and its receipts. CLI `--root` is required;
  examples explicitly use the ignored `runtime/market-discovery`, which is also
  the usual control-panel default. An external local runtime is useful for real work.
- Run `npm run market:check` for synthetic bridge/legacy regressions, then `demo`
  (or `npm run market:test`) for installation checks. These use synthetic local fixtures and prove
  neither live search coverage nor a verified business result.
- An optional `priority` stage reads an explicitly supplied minimal customer
  projection and HMAC key. Never open CRM cases, mail, attachments or profiles to
  construct it implicitly. Ranking may change scan order only: it cannot change
  identity, evidence, manufacturer status, scores or buying intent. Its output is
  still confidential even when names are replaced by HMAC references.
  The next `penetrate` stage consumes the local hash-bound domain order before
  applying its limit. Only unambiguous `AUTO_MATCHED` official domains qualify;
  shared domains and unresolved matches do not. A bad pointer/map blocks the
  stage instead of being ignored. Inspect the priority receipt when this happens;
  do not alter hashes or evidence to force a pass. Search queries do not include
  customer fields or rankings.
- For `plan`, bind a stable CLDR release and the selected region table. CLDR
  territory-language metadata does not validate industry vocabulary. Supply
  reviewed product/role terms and preserve unsupported language/task gaps.
  Unreviewed translations and back-translation alone do not establish acceptance.
  Query-eligible term states are exactly `ACCEPTED_CURATED`, `ACCEPTED_REVIEWED`
  and `ACCEPTED_SOURCE_ENGLISH`; do not revive older automatic-acceptance states.
- For `search` and `penetrate`, use the bounded flags and network opt-in described
  in the workflow. Search results are candidate URLs. Retain relevant official
  identity, product and role evidence; CAPTCHA, throttling and unavailable pages
  are source gaps, not zero results. Do not change proxies or resume an unrelated
  crawler as a side effect.
- For `verify`, require every selected candidate to have nonempty IDENTITY,
  PRODUCT and ROLE evidence. Regex matches are machine checks requiring human
  review. A brand/dealer listing does not prove a manufacturing site. Country
  filters, TLDs and phone prefixes do not establish an entity's actual location.
- Before `handoff`, review the public record against its cited sources. Preserve
  distinct legal entities that share a website. Supply explicit stable entity
  keys and source hashes/timestamps. The bridge validates structure; it does not
  independently verify the truth of a company statement.

## Report the actual result

Use `npm run market:discovery -- --stage=<stage> --root=<local-runtime>` and report
the resulting state, counts, receipt paths, and unresolved gaps. The local UI is
another entry to those stages, not a broader authorization or completeness claim.
The handoff retains `crm_binding=null` and `handoff_state=review_required`.
Do not fabricate record IDs, capture PASS, factory verification or CRM acceptance.

Keep runtime inputs, rankings, keys, discovered companies, evidence pages and
outputs local and out of commits. Public source may include generic code, schemas,
documentation and synthetic tests. No stage authorizes CRM writes, messages,
outreach or uploading runtime data. Honor any separately authorized source-code
publication request without treating it as permission to publish the data.
