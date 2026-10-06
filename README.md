# Local Evidence Collector
**Save website records locally, or research public manufacturers and dealers across selected markets.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D24-green.svg)](package.json)
[English](#english) | [简体中文](#简体中文)

## English

### Choose the job you want to do

This project has **two separate workflows**. Capture saves records from a website you have adapted. Market Discovery finds and reviews public company leads. Neither workflow writes CRM records or sends outreach.

| Your job | Choose | Input → result | First task |
| --- | --- | --- | --- |
| Preserve one website record and its supporting material | **Capture** | Accepted website adapter + selected record → local pages, observed responses, messages/files where available, source indexes and missing-item status | Run the local record demo below. |
| Find manufacturers/dealers in selected regions and languages | **Market Discovery** | Region table + language metadata + reviewed product terms → search candidates, evidence checks and an approved JSONL/CSV handoff | Run the offline market demo below. |

Use it when you need to:

- **Review a website record later:** preserve its original pages and files locally instead of relying on a changing screen.
- **Resume incomplete collection:** see which configured items failed or are missing before explicitly retrying them.
- **Research a market:** plan local-language searches, inspect public company pages, and keep reviewed leads separate from unverified results.

### See a small result first

The capture demo serves **invented record `1001`** at `http://127.0.0.1:4877/records`. Most related collections are empty; it demonstrates the local workflow, not a real customer archive or large-scale completeness.

The offline market demo uses invented inputs to exercise the stage chain and save local receipts. It makes no live business search and approves no real company. Choose either demo in [Quick start](#quick-start); you do not need a commercial-platform login for them.

### Real platforms and development background

The capture workflow grew out of **OKKI / Xiaoman CRM** record collection. This public repository generalizes that engine and ships a **local synthetic adapter**, not the real OKKI adapter. For the OKKI-specific application, see [CRM Evidence Workbench](https://github.com/KietC/crm-evidence-workbench). Changing an adapter's domain alone does not adapt a new service.

| Platform or source | Role here | Current capability and limit |
| --- | --- | --- |
| OKKI / Xiaoman CRM | Development background of record capture | The platform-specific adapter is in the CRM workbench; this repository defaults to the synthetic loopback service on port `4877`. |
| Bing RSS, Seznam, DuckDuckGo, Brave, Yahoo US / Japan, Baidu, Sogou and Naver | Market-search sources | The [search implementation](modules/market-discovery/legacy/run_multisource_search.mjs) selects regional and rotating global engines for a task. Live requests need explicit network opt-in; blocked pages, changed markup and partial results remain visible. This is not a promise that every engine currently works. |
| Company official websites | Candidate page inspection | Selected public pages supply identity/product/role evidence. Patterns and search snippets still need human review. |
| Unicode CLDR | Region/language planning | [Planning code](modules/market-discovery/legacy/prepare_foundation.mjs) uses territory/language metadata from a supplied stable release. CLDR data is not bundled and does not validate technical translations. |
| Google Translate public endpoint | Optional terminology candidates | Online planning without supplied reviewed terms can request translation/back-translation at `translate.googleapis.com`. Machine candidates remain pending review and cannot become accepted query terms merely because back-translation looks similar. No paid Translate API client or availability guarantee is bundled. |
| Codex | Optional operator/agent guidance | Repository Skills guide evidence review and market work; they are not automatically invoked by capture. |

**SignalHire, LinkedIn and Facebook are not shipped as ready-to-run capture adapters.** Finding a link to one of these services does not add its login, pagination or profile reader. A new capture source needs its own fields, responses, identity and relationship checks using the [adapter acceptance checklist](docs/ADAPTER_ACCEPTANCE.md).

### Start here
| Goal | Read first |
| --- | --- |
| Install on a new machine | [Ordered deployment](DEPLOY.md) |
| Diagnose configuration, low CPU or incomplete capture | [Setup and pitfalls](docs/SETUP_AND_PITFALLS.md) |
| Adapt a record application | [Adapter guide](docs/ADAPTERS.md), [acceptance checklist](docs/ADAPTER_ACCEPTANCE.md) |
| Understand core implementation | [Core code map](docs/CORE_CODE_GUIDE.md) |
| Find manufacturers/dealers across languages | [Market discovery workflow](docs/MARKET_DISCOVERY.md) |
| Install/use the optional Skill | [Skill integration](docs/SKILL_INTEGRATION.md) |
| Package an allowed source release | [Public release boundary](docs/PUBLICATION.md), [release review](docs/PUBLIC_RELEASE_REVIEW.md) |

### How the workflows work

Capture uses an Electron desktop shell and Playwright engine. It saves scoped pages, observed responses and configured related material; hashes and session checks expose gaps. The integrated market module has its own CLI/control-panel stages and private runtime. An optional local customer ranking changes scan order only, never evidence or company status.

The bundled **Evidence Pipeline Guard** Skill supplies guidance and two independent Python utilities. It is not a capture hook, does not change the collector's state machine, and does not certify production data.

- Dedicated desktop browser, loopback control UI and scoped navigation.
- Observed API responses, bounded pagination, message details and relation windows.
- Documents, attachments, screenshots, DOM snapshots and local viewers.
- SHA-256 deduplication, source indexes and session-bound reconciliation.
- Incomplete-state reporting, explicit one-shot capture and deferred repair.
- Separate concurrency controls for small API pages, message detail and large binaries.
- English-first Chinese-second documentation and source annotations.
- Reusable Skill for status evidence, chronology/lineage, performance/recovery and source-only exports.
- Integrated market planning, bounded public discovery, evidence review and JSONL/CSV handoff.
- Optional confidential priority overlay that affects scan order, never evidence or company status.

### Quick start
Requirements: Node.js **24+**, npm, and an Electron-supported desktop. Python **3.11+** is needed for the market priority/handoff bridges and optional evidence Skill utilities. No GPU, Qwen, API key or agent account is required for basic capture. Windows is the primary desktop platform.

```bash
git clone https://github.com/KietC/local-evidence-collector.git
cd local-evidence-collector
npm ci
npm run build
npm run smoke
```

Terminal A:
```bash
npm run demo
```
Terminal B, from the same repository:
```bash
npm run desktop
```

Expected: a local control pane and the synthetic record list at `http://127.0.0.1:4877/records`. Opening a window or answering `/healthz` only proves availability, not successful capture. Read [DEPLOY.md](DEPLOY.md) for external runtime paths, environment inheritance, one-shot isolation and acceptance order.

### Market discovery

From this same repository, run the offline synthetic demo:

```bash
npm run market:discovery -- --stage=demo --root=runtime/market-discovery
```

The same command selects `plan`, `search`, `penetrate`, `verify`, `handoff` or
`priority`; the local control panel exposes the public discovery stages and demo.
Run confidential priority ordering explicitly through the CLI. Real planning uses
operator-supplied regions, stable CLDR metadata and reviewed terminology. Live
search requires `--allow-network` and bounded market/limit settings. Pattern
verification stays pending human review; handoff requires separately approved
public records and keeps `crm_binding=null`. Read the [input contracts and
receipts](docs/MARKET_DISCOVERY.md) before running a real market.
After `priority`, `penetrate` consumes the hash-bound local ordering of unambiguous
matched public domains before applying its task limit; evidence and scores remain
unchanged.

### Choose a related project

| If your next task is… | Project | Relationship |
| --- | --- | --- |
| Capture and review an OKKI customer history | [CRM Evidence Workbench](https://github.com/KietC/crm-evidence-workbench) | Platform-specific CRM application; do not substitute this generic demo adapter. |
| Prepare and compare an exhibitor directory | [Exhibitor Research Archive](https://github.com/KietC/exhibitor-research-archive) | Separate portal/list preparation workflow. |
| Investigate who manufactures one exact product | [FactoryTrace](https://github.com/KietC/factorytrace) | Reviewed market leads and original sources can be research inputs; an automatic handoff adapter is not shipped. |
| Transcribe local audio/video attachments | [Polyglot Media Workbench](https://github.com/KietC/polyglot-media-workbench) | Separate media-processing tool; no automatic capture-to-ASR pipeline here. |
| Read compatible phone captions on a PC | [Caption Relay](https://github.com/KietC/caption-relay) | Separate live-text transport; does not recognize audio in this collector. |

### Configuration
| Variable | Role | Default / requirement |
| --- | --- | --- |
| `CAPTURE_ADAPTER_PATH` | Complete adapter JSON | `adapters/generic/v1/adapter.json` |
| `CAPTURE_OUTPUT_ROOT` | Private evidence destination | `runtime/data`; use an external local folder for real use |
| `CAPTURE_RUNTIME_ROOT` | Browser state, locks, logs | `runtime`; separate it from source control |
| `CAPTURE_CAPTURE_PORT` | Loopback control | desktop 3211; standalone 3210 |
| `CAPTURE_CDP_PORT` | Loopback browser debugging | desktop 9334; standalone 9333 |
| `CAPTURE_ONE_SHOT_RECORD_ID` | Explicit isolated record | unset; numeric fixture 1001 for demo |
| `CAPTURE_QUEUE_COORDINATOR` | Coordinator participation | set 0 for the one-shot launcher |
| `CAPTURE_API_PAGE_CONCURRENCY` | API-page concurrency | bounded by engine; measure before increasing |
| `CAPTURE_MAIL_DETAIL_CONCURRENCY` | Message-detail concurrency | independent from binary downloads |
| `CAPTURE_RESOURCE_DOWNLOAD_CONCURRENCY` | Binary concurrency | keep conservative; responses can enter Node heap |
| `CAPTURE_NODE_HEAP_MB` | Desktop child Node heap | child defaults to 8192 MiB; not a total system memory limit |
| `MARKET_DISCOVERY_ROOT` | Control-panel market runtime | `market-discovery` beneath the configured capture runtime; ordinarily `runtime/market-discovery` |
| `MARKET_DISCOVERY_HMAC_KEY` | Optional priority-stage local key | 64–256 even-length hexadecimal characters; never commit it or put it in a command argument |
| `MARKET_DISCOVERY_PYTHON` | Explicit Python executable for bridge stages | `python` from the launching process environment |

`.env.example` is documentation, **not an auto-loaded configuration**. Set variables in the terminal that launches the application. Keep local overrides, cookies and reviewer configuration outside the tracked tree. Standalone browser mode additionally needs a locally installed compatible Chrome/Edge.

### Architecture
```text
Adapter JSON -> BrowserManager -> CaptureEngine -> EvidenceStore
                                      |                 |
                               bounded requests    hashes / manifests
                                                        |
                                             UI / explicit repair

Optional Skill -> metadata assessment / source-only ZIP
                 (not a capture hook or production verifier)

Market Discovery UI / CLI -> plan -> search -> penetrate -> verify -> review handoff
                               ^
                     optional local priority (scan order only)
```

The runtime and audit helpers have different trust boundaries. A helper's caller-supplied booleans are observations, not independently verified facts. Existing PID locks do not implement process-start-time fencing. Some file replacements have crash windows. Read the known limits before using live evidence.

### Validation and limits
Maintainers can explicitly run:
```bash
npm run check
npm run build
npm test
npm run smoke
npm run verify:source
npm run market:check
npm run market:test
```
The optional evidence Skill's Python helpers are separate from collector npm
tests. `market:check` runs synthetic Python bridge and legacy-stage checks;
`market:test` exercises the synthetic integrated stage chain. These checks cover their own module
contracts; see [deployment](DEPLOY.md). Run results must be reported from the
actual checks, not inferred from this command list. A source privacy review is not
behavioral validation.

Synthetic PASS, UI completion, byte hashes and local package integrity do not establish external-source completeness, correct event timestamps or a fully usable downstream dataset. A source-only release excludes customer material; running capture can still create sensitive local data. Never expose control/CDP ports or publish runtime contents.

### Project map
```text
src/                 # capture engine and desktop/control modules
adapters/generic/v1/ # complete synthetic record contract
ui/ electron/        # interface and preload code
examples/            # local synthetic service
scripts/ tools/      # launch and developer tooling
modules/market-discovery/ # public discovery stages and local Python bridges
docs/                # implementation, acceptance, recovery and publication
skills/market-discovery/ # repository-local market workflow instructions
skills/evidence-pipeline-guard/
  SKILL.md           # optional agent workflow
  references/        # evidence, time, performance, publication rules
  scripts/           # stdlib-only advisory and allowlisted ZIP utilities
```

### References, help and license
Documentation structure follows [Playwright](https://github.com/microsoft/playwright), [Puppeteer](https://github.com/puppeteer/puppeteer) and [GitHub README guidance](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes), without copying their implementation or claiming endorsement. See [style research](docs/README_STYLE_RESEARCH.md).

Report reproducible issues using synthetic examples. Do not attach private logs or browser profiles. See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
**MIT**, including newly added Skill/docs/helpers. The English [LICENSE](LICENSE) is authoritative; dependencies retain their own licenses.

---

## 简体中文

### 先选你要做的事

本项目有**两条独立路线**：采集路线保存已适配网站的记录；市场发现路线寻找和审查公开企业线索。两者都不写 CRM，也不自动发送开发消息。

| 你的任务 | 选哪条路线 | 输入 → 产出 | 第一个小任务 |
| --- | --- | --- | --- |
| 保存一条网站记录及支持材料 | **Capture 采集** | 已验收适配器 + 指定记录 → 本地页面、已观察响应、可用消息/文件、来源索引和缺失状态 | 运行下方本机记录演示。 |
| 在指定地区和语言中寻找厂家/经销商 | **Market Discovery 市场发现** | 地区表 + 语言资料 + 已审核产品词 → 搜索候选、材料检查和已批准 JSONL/CSV 交接文件 | 运行下方离线市场演示。 |

适合三个场景：

- **日后复盘网站记录：**把原始页面与文件保存在本机，方便回看，不依赖不断变化的网页。
- **继续未完成的采集：**先看哪些已配置项目失败或缺失，再明确补采。
- **开展市场研究：**规划当地语言搜索、查看公开企业页面，将已审线索与未经核实的结果分开。

### 先看一个小结果

采集演示在 `http://127.0.0.1:4877/records` 提供**虚构记录 `1001`**。多数关联集合为空，只演示本机流程，不代表真实客户档案或大规模完整采集。

离线市场演示用虚构输入走完阶段链并保存本地回执，不搜索真实企业、不批准真实候选。按下方安装步骤选其中一条路线，演示都不需要商业平台登录。

### 真实平台与开发背景

采集流程最初来自 **OKKI / 小满 CRM** 的记录保存工作。本公开仓库将引擎通用化，默认只附**本机虚构适配器**；真实 OKKI 适配器在 [CRM Evidence Workbench](https://github.com/KietC/crm-evidence-workbench)。换一个域名不能完成新平台适配。

| 平台或来源 | 在这里的作用 | 当前能力与限制 |
| --- | --- | --- |
| OKKI / 小满 CRM | 记录采集的开发背景 | 平台专用适配器在 CRM 工作台；本仓库默认使用 `4877` 端口的本机虚构服务。 |
| Bing RSS、Seznam、DuckDuckGo、Brave、Yahoo 美国/日本、百度、搜狗、Naver | 市场搜索来源 | [搜索实现](modules/market-discovery/legacy/run_multisource_search.mjs)按任务选择地区引擎与轮换全球引擎。联网须明确开启；阻断、页面变化和部分结果保留，不承诺所有引擎当前都能使用。 |
| 企业官方网站 | 深入检查候选页面 | 从选定公开页面整理主体、产品、业务角色材料；正则匹配和搜索摘要仍需人工审查。 |
| Unicode CLDR | 地区与语言规划 | [规划代码](modules/market-discovery/legacy/prepare_foundation.mjs)读取使用者提供的稳定版地区/语言资料；不附 CLDR 数据，也不用于证明专业术语翻译正确。 |
| Google Translate 公共接口 | 可选术语候选 | 联网规划且未提供已审核词条时，可通过 `translate.googleapis.com` 翻译与回译。机器候选仍待审核，回译相似不能自动成为已接受查询词；不附付费 Translate API 客户端，也不保证该接口可用。 |
| Codex | 可选人员/代理工作指导 | 仓库 Skill 指导证据复核与市场研究，不会由采集器自动调用。 |

**本仓库没有 SignalHire、LinkedIn 或 Facebook 的开箱采集适配器。** 找到这些平台的链接，不等于具备登录、分页和个人资料读取能力。接新来源要按[适配器验收表](docs/ADAPTER_ACCEPTANCE.md)核对字段、响应、身份和关联关系。

### 按顺序使用
新机先读 [DEPLOY.md](DEPLOY.md)；配置或卡住时读[配置与避坑](docs/SETUP_AND_PITFALLS.md)；接新系统读[适配器指南](docs/ADAPTERS.md)和[验收表](docs/ADAPTER_ACCEPTANCE.md)；核心实现见[源码地图](docs/CORE_CODE_GUIDE.md)；安装技能见[集成说明](docs/SKILL_INTEGRATION.md)。

基础采集需要 Node.js 24+、npm 和 Electron 支持的桌面系统，主要支持 Windows。市场优先级/交接桥接及证据技能辅助工具需要 Python 3.11+。基础采集不需要 GPU、本地 Qwen、模型 API key 或 agent 账号。
```bash
git clone https://github.com/KietC/local-evidence-collector.git
cd local-evidence-collector
npm ci
npm run build
npm run smoke
```
第一个终端运行 `npm run demo`，第二个终端运行 `npm run desktop`。预期出现本机控制界面和 `http://127.0.0.1:4877/records` 虚构列表。界面出现或健康接口正常不等于采集成功。

多语种发现先运行 `npm run market:discovery -- --stage=demo --root=runtime/market-discovery`。
真实工作依次准备地区、稳定 CLDR、已审核行业词，再选择 plan/search/penetrate/verify/handoff；
有客户最小排名投影时可运行 priority。联网需显式 `--allow-network`，合成 demo 不访问真实市场。
priority 的本地哈希绑定域名顺序会用于下一次 penetrate，仅对无歧义精确匹配调序，
不改变证据、评分，也不把客户字段带入搜索查询。
完整输入、阶段回执和人工复核边界见[市场发现](docs/MARKET_DISCOVERY.md)。

### 后续任务选哪个项目

| 接下来要做什么 | 项目 | 关系 |
| --- | --- | --- |
| 保存并复盘 OKKI 客户历史 | [CRM Evidence Workbench](https://github.com/KietC/crm-evidence-workbench) | 平台专用 CRM 应用，不能用本仓库虚构适配器替代。 |
| 整理、比较展商名册 | [Exhibitor Research Archive](https://github.com/KietC/exhibitor-research-archive) | 独立的网站名单准备流程。 |
| 调查某款精确产品的制造方 | [FactoryTrace](https://github.com/KietC/factorytrace) | 已审市场线索和原件可作调查输入，尚未提供自动交接适配器。 |
| 转写本地音视频附件 | [Polyglot Media Workbench](https://github.com/KietC/polyglot-media-workbench) | 独立媒体处理工具，这里没有自动“采集→ASR”流程。 |
| 在电脑读兼容手机字幕 | [Caption Relay](https://github.com/KietC/caption-relay) | 独立实时文字传输，不在本采集器里识别声音。 |

### 两条路线的实现

采集由 Electron 桌面界面和 Playwright 引擎处理，保存限定记录、已观察响应及配置的关联材料，通过哈希与会话检查显示缺口。市场模块有自己的 CLI/控制面板阶段和私有运行目录；可选客户排名只改变扫描顺序，不改变事实与公司状态。

附带 **Evidence Pipeline Guard** 是指导流程及两个独立 Python 工具，不是采集钩子，不修改采集状态机，也不认证生产数据。

### 配置顺序与边界
先确定源码目录，再确定外部私有 evidence/runtime 目录，再设置完整适配器路径和端口，最后启动。上方表格列出全部主要变量。`.env.example` 不会自动加载；必须在启动应用的同一终端设置环境变量。

默认证据在 `runtime/data`，状态在 `runtime`；真实使用建议放到源码目录外。桌面控制/CDP 默认 3211/9334，独立服务默认 3210/9333。单记录启动器要求 `-NoAutoNext`，并将 coordinator 设置为 0。`-ResumeExisting` 只是兼容参数，实际续采取决于控制界面的请求。

分页、消息、大文件并发分别调节。大文件进入 Node 堆，不能拿几十个 CPU 核直接换成几十个浏览器 owner。`CAPTURE_NODE_HEAP_MB` 只限制桌面子服务的 V8 堆，不是整机内存限额。

### 验证、限制与开源范围
维护者可按英文命令检查采集器和市场发现模块。证据技能的 Python 辅助工具与采集器 npm 测试分开；市场发现有自己的模块检查和合成 demo。具体通过结果以实际运行回执为准，源码隐私检查不等于行为验收。

PID 锁没有进程启动时间 fencing，部分替换存在崩溃窗口。合成测试、哈希、窗口完成和本地包完整不能证明外部系统没有遗漏，也不能证明时间与关系语义正确。模型只能产生派生判断，不能覆盖源事实。

公开副本包含采集源码、UI、完整合成适配器、开发工具和通用技能，不包含客户记录、生产配置、Cookie、浏览器会话、缓存、原始历史或模型。真实运行仍可能生成敏感文件，控制/CDP 端口不得对外暴露。提交 issue 使用合成样例，不附私人日志。

README 结构参考 Playwright、Puppeteer 和 GitHub 官方指南，不复制其实现、不宣称背书或同等能力。全部新增内容随项目采用 MIT；以英文 LICENSE 为准，依赖仍遵循各自许可证。
