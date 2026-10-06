# Market Discovery / 多语种市场发现

[README](../README.md) · [Deployment](../DEPLOY.md) · [Repository skill](../skills/market-discovery/SKILL.md)

## English

### One repository, separate local data

Market discovery extends this repository with planning, search, public-page
inspection, verification, optional local priority ordering and a reviewed public
handoff. It shares the application's command and control-panel entry points.
It does not insert candidates into the collector's record queue or write CRM
records. The generic collector adapter still needs its own source-specific
identity, response and pagination acceptance checks.

The workflow is:

```text
Optional minimal customer ranking -> local domain order -+
                                                        v
Regions + stable CLDR + reviewed terms -> plan -> search -> penetrate
                                                        |
                                identity / product / role verification
                                                        |
                                  human public-data review -> handoff
```

Code, documentation and synthetic tests are versioned here. Inputs, local customer
projections, HMAC keys, queries, discovered companies, evidence pages, receipts and
handoffs belong in an ignored local runtime, not a commit. Pseudonymous priority
outputs remain confidential. Publicly accessible source pages do not make an
entire working dataset appropriate to publish.

### Entry points

Run from the repository root with Node.js 24+; Python 3.11+ is required for the
priority and handoff bridges. The CLI requires an explicit `--root`; the examples
select `runtime/market-discovery`. The control panel supplies its configured root,
which normally defaults to that directory. Use a deliberate external local root
for real work when appropriate.

```powershell
npm run market:discovery -- --stage=demo --root=runtime/market-discovery
npm run market:discovery -- --stage=plan --root=runtime/market-discovery
npm run market:discovery -- --stage=search --root=runtime/market-discovery --markets=DE,FR --limit=2 --concurrency=1 --allow-network
npm run market:discovery -- --stage=penetrate --root=runtime/market-discovery --limit=2 --concurrency=1 --allow-network
npm run market:discovery -- --stage=verify --root=runtime/market-discovery
npm run market:discovery -- --stage=handoff --root=runtime/market-discovery
```

These select individual stages; they do not silently approve evidence or launch
every stage. Live search/page retrieval requires an explicit network opt-in. The
desktop control panel also exposes market discovery; it uses the same stage
boundaries. Review the runtime path and stage result before proceeding.

For the control panel, set `MARKET_DISCOVERY_ROOT` before starting the application;
its default is `market-discovery` beneath the configured capture runtime (normally
`runtime/market-discovery`). The panel selects stage, markets, limit, concurrency
and network opt-in for public discovery/demo, and provides Start/Cancel plus
status/counts. Confidential priority ordering uses the CLI. The panel cannot supply
an arbitrary filesystem root or command. CLI `--root` is an explicit local
operator choice. Customer input contents and keys are not shown in the status UI.

For search/page inspection, `--limit` accepts 1–100; search concurrency accepts
1–4. `verify` evaluates the explicitly prepared specification file rather than
silently truncating its evidence list. `plan` defaults to offline
inputs; the CLI's `--fetch-cldr` requires `--allow-network`. Review and pin any downloaded
CLDR source before using it as the accepted language baseline. `verify` without
network opt-in uses supplied offline fixtures; use `--allow-network` deliberately
for live source URLs. Do not interpret an offline receipt as a live verification.
An empty market selection covers configured tasks/candidates up to the limit;
it does not mean unlimited work or proof of global coverage. The controller can
bind a safe `--run-id`; reusing an existing run ID is rejected.

Each stage writes `stages/<stage>/<run_id>.json` and `stages/<stage>/latest.json`
under runtime, using `market_discovery.stage_receipt.v1`. States are `RUNNING`,
`COMPLETE`, `PARTIAL`, `BLOCKED`, `FAILED` and `CANCELLED`. Read the state and relevant counts
(`tasks`, `markets`, `candidates`, `pattern_passes`, `held`, `records`,
`output_records`, `matched`, `needs_review`, `no_match`, `network_requests`), not
only a process exit code. `COMPLETE` means that stage's work completed, not that
all markets or all business claims are confirmed. `demo` uses a separate synthetic
child runtime and never approves real candidates.

### Planning inputs

The planning stage consumes local source files beneath the selected runtime:

| Input | Contract |
| --- | --- |
| `inputs/regions.csv` | `market_code,iso2,iso3,m49,country_zh,country_en,commercial_major_region_zh,commercial_subregion_zh,in_scope`; market codes unique, `in_scope` is `true` or `false`. |
| `inputs/cldr.xml` | CLDR territory and language-population metadata. Use a stable release; retain its version, license and SHA-256 with the runtime inputs. No CLDR dataset is bundled. |
| `inputs/reviewed_terms.jsonl` | Optional reviewed `language_code`, `term_key`, `term_local`, `validation_status` records. Query-eligible statuses are exactly `ACCEPTED_CURATED`, `ACCEPTED_REVIEWED`, `ACCEPTED_SOURCE_ENGLISH`. |

The integrated dispatcher uses these fixed runtime input paths; it does not
accept arbitrary `--regions`, `--cldr`, `--terms-input` or `--expected-markets`
paths. The underlying legacy scripts retain lower-level maintenance parameters;
the integrated entry point and this document define the operator workflow.
Planning emits `data/market_language_matrix.jsonl`,
`data/multilingual_product_terms.jsonl`, `data/market_search_tasks.jsonl` and a
content-bound receipt. Without supplied terminology, the historical dictionary
has limited language coverage and leaves missing query families blocked. A task
count is planned work, not executed search coverage.

CLDR describes language use; it does not certify translations of technical
products, manufacturers or dealers. Review terms in their local industry context.
English can supplement selected local languages. Preserve unsupported language
slots instead of silently dropping them.
Automatic back-translation remains `REVIEW_REQUIRED_BACKTRANSLATION` or
`TRIAL_ONLY`, even with a high similarity value, and cannot enter accepted queries.

### Search, page inspection and verification

Search discovers candidate URLs. `penetrate` inspects selected public pages for
the relevant identity, product and business-role evidence. It is a research stage,
not a vulnerability test. Keep requests bounded and preserve blocked/unavailable
sources as gaps. Search snippets, directory badges, copied listings and shared
brand logos do not independently prove a factory or an actual operating location.

After selecting candidates, prepare `data/search_candidate_specs.jsonl`. Each
spec has a safe `id`, a `family` of `MANUFACTURER` or `DEALER`, and a nonempty
`evidence` array. Each evidence gate contains `axis`, `url` and nonempty regex
`pattern`. Together the gates must cover `IDENTITY`, `PRODUCT` and `ROLE`.
Offline fixtures also provide `file`, relative to runtime, and optionally
`content_type`.

Regex verification is a mechanical observation. Even a `NEW_KEEP_*` result keeps
`manual_review_required=true` and `export_eligible=false`. Offline receipts cannot
be reused as live evidence. A reviewer must separately prepare approved public
records for handoff. The bridge does not convert a positive pattern match into a
verified company, purchasing intention or manufacturing-site audit.

### Optional local priority

Use the `priority` stage only when a caller has already supplied a permitted,
minimal local projection. It does not fetch customers from CRM or enumerate
customer directories.

| Input | Allowed fields |
| --- | --- |
| `inputs/customer_projection.jsonl` | `local_id`, `legal_name`, `country`, `official_domain`, `primary_rank`, `secondary_rank`. |
| `inputs/public_entities.jsonl` | `public_entity_key`, `legal_name`, `country`, `official_domain`. |
| `MARKET_DISCOVERY_HMAC_KEY` environment variable | 64–256 hexadecimal characters, even length, representing at least 32 key bytes. No key CLI argument; never commit it. |

Set the key privately in the process environment before launching, then run:

```powershell
npm run market:discovery -- --stage=priority --root=runtime/market-discovery
```

Priority outputs go under `private/priority/<run_id>` in the selected runtime.
The key must remain stable to keep the local HMAC references stable; treat a
changed key as a new identity namespace rather than silently mixing outputs.
The stage emits `priority_overlay.jsonl`, `ordered_public_entities.jsonl` and
`domain_scan_order.json`, then updates the local pointer
`private/priority/latest.json`. The domain-order document uses
`market_discovery.priority_domain_order.v1` and contains `input_sha256` plus
`domains[{official_domain,scan_order,review_state}]`. Only `AUTO_MATCHED` entities
with an unambiguous official domain enter it. A shared public domain is excluded
even when legal-name-plus-country matching identified one entity.

On the next `penetrate` stage, the dispatcher checks that pointer's schema/run ID,
the map's SHA-256, input-hash agreement and map schema before making any website
request. A malformed or mismatched map blocks the stage; absence of a pointer
uses ordinary discovery ordering. With a valid map, targets are ordered by scan
order, then their original discovery count and host, before applying the task
limit. The stage receipt records the map and input hashes. Customer fields and
rankings do not enter search queries, and candidate evidence and scores are not
changed.

Ranks are positive integers or absent/null. The primary rank orders work; the
secondary rank is a tie-breaker and fallback. Exact unique official-domain or
legal-name-plus-country matches can connect a projection to a public entity for
ordering. Shared-domain ambiguity and country/domain contradictions require
review. Unknown/unmatched companies remain eligible for ordinary discovery.

The result contains HMAC references, `scan_order`, matched public keys and an
explicit `SCAN_ORDER_ONLY`/`LOCAL_CONFIDENTIAL` designation. It never raises an
evidence stage or changes product fit, manufacturer status, buying intent or
fact content. An exact identity match for scheduling is not a business-quality
endorsement.

### Reviewed public handoff

The dispatcher reads `inputs/approved_public.jsonl`. Input schema is
`market_discovery.public_review.v1`. Every input record declares
`review_status=approved_public` and includes an explicit stable
`public_entity_key`, normalized company name/country/website/language, nonempty
roles and products, and a timezone-bearing review timestamp. `identity_evidence`
must cover company name, country and website; `role_evidence` and
`product_evidence` must cover every selected role and product.

Each evidence item has exactly `source_url`, `source_sha256`, `observed_at`,
`excerpt`. The bridge rejects unknown fields, missing evidence, malformed hashes
or timestamps, duplicate entity keys, credential-bearing URLs and known private
host forms. It performs no network requests or DNS resolution. Its finite URL
rules cannot identify every private value, and a correctly shaped hash does not
prove that source bytes or an excerpt are true. Human review remains part of the
input contract.

The outputs are evidence-bearing `handoff.jsonl`, formula-safe UTF-8 CSV and a
manifest binding the actual input/output bytes, sizes and record counts. Every
record keeps `crm_binding=null` and `handoff_state=review_required`. Output
directories are new and exclusive at `outputs/handoff/<run_id>` in runtime;
existing handoffs are not overwritten. The Python bridge must write outside its
source module, so the explicit runtime is the data destination. A filesystem failure can leave partial output; a complete receipt
is required before consuming it.

This handoff is integrated into this repository's market-discovery workflow. It
is not a live CRM importer. A future CRM write adapter needs explicit identity
binding, field mapping, duplicate handling and acceptance checks; no current
stage manufactures those bindings or starts a CRM write.

### Verification and limits

From the repository root, run `npm run market:check` for synthetic Python bridge,
dispatcher and legacy-stage regressions, then `npm run market:test` for the offline integrated
demo. To run only the Python bridge regressions:

```powershell
Push-Location modules/market-discovery
try { python -B -m unittest discover -s tests -v }
finally { Pop-Location }
```

The dispatcher also honors `MARKET_DISCOVERY_PYTHON` for an explicitly selected
Python executable; otherwise it uses `python`. Configure it before launching the
desktop when its process environment cannot find the required interpreter.

Use synthetic checks for term acceptance, missing language slots, incomplete
search receipts, empty identity/product/role evidence, ambiguous entity matching,
priority-only ordering, duplicate keys, URL credentials, output isolation, CSV
formula handling and byte/count closure. Run the repository checks documented in
[deployment](../DEPLOY.md) before release. Synthetic success does not establish
live search availability, real company truth or completed market coverage.

## 简体中文

### 在本仓库内使用

市场发现直接集成在当前仓库的 CLI 和本机控制面板中：可选最小客户排名仅调整
扫描顺序；地区表、稳定 CLDR 和已审核行业词生成任务；搜索发现候选，页面深入
检查保留身份、产品、角色证据，机械核验后再人工复核并生成交接。它不会把候选
自动送入采集队列，也不会写入 CRM。

从仓库根目录运行上方 `npm run market:discovery -- --stage=... --root=...`。
CLI 的 `--root` 必填，上述示例显式选择已忽略的 `runtime/market-discovery`；
本机控制面板通常默认使用此目录，并在调用阶段时传入。`demo` 只运行合成样例；
真实查询或网页访问需要显式启用联网。Node.js 24+ 运行阶段编排，优先级与交接
桥接需要 Python 3.11+。技能就在 [skills/market-discovery](../skills/market-discovery/SKILL.md)，
无需全局安装。

### 输入与人工判断

地区表、CLDR 和词条契约见英文表格。固定 CLDR 稳定版本与哈希；语言人口信息
不是行业翻译验收。可入查询的状态仅为 `ACCEPTED_CURATED`、`ACCEPTED_REVIEWED`、
`ACCEPTED_SOURCE_ENGLISH`；自动回译即使相似度高仍须复核，缺失语言保留阻断，
不能把英文任务数说成各地区本地语言均已完成。

`search_candidate_specs.jsonl` 的每个候选必须提供 `IDENTITY`、`PRODUCT`、`ROLE`
三条证据轴。搜索结果或品牌 Logo 不是工厂证明；总部、生产地点和经销市场要分开。
正则命中仍需人工复核，离线样例回执不能升级真实线上证据。

客户优先级输入只允许已准备好的最小投影，不能借此读取客户目录、邮件或附件。
主榜名次优先，副榜只用于同序和兜底。精确域名或法律名称+国家可用于排队关联，
同域多实体和冲突保留待核。排名、HMAC 引用和匹配结果仍敏感，只保存在本机；
不改变任何厂家阶段、产品匹配、事实内容、成交概率或评分。
priority 生成 `domain_scan_order.json` 并更新本地 latest 指针。下一次 penetrate
在请求官网前核对指针、映射及输入哈希，只让无歧义 `AUTO_MATCHED` 官网域名进入
调序；共享域名即使通过名称+国家关联也不入映射。先按 scan_order、原发现次数、
域名排序，再应用任务上限。缺少指针时沿用普通发现顺序，映射不一致时阻断；
回执保留相关哈希。客户字段和排名不会进入搜索查询，也不改变证据或评分。

人工批准的公开交接记录仍输出 `review_required` 和空 CRM 绑定。结构校验、
SHA-256 与时间校验不能代替企业事实核查，官网自述也不能提升为实地工厂验收。
源码、文档、合成测试可以公开；真实输入、密钥、排名、查询、候选、证据和结果
留在忽略的数据目录。任何阶段都不自动发送开发信、消息或写 CRM。
