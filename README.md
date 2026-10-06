# Local Evidence Collector
**Local browser evidence capture and multilingual market discovery, with local review workflows and repository Skills.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D24-green.svg)](package.json)
[English](#english) | [简体中文](#简体中文)

## English

### What this project does
An Electron desktop shell and Playwright engine collect record-scoped pages, observed responses, related messages and attachments into a local evidence workspace. Content hashes, session artifacts and explicit reconciliation states make failures visible.

The bundled **Evidence Pipeline Guard** Skill adds operational guidance and two independent Python utilities. It is not automatically invoked by the collector, does not change its state machine, and does not turn a capture into a production-certified dataset.

The integrated **Market Discovery** module adds region/language planning, public
manufacturer/dealer research, evidence checks and a reviewed public handoff. Its
optional local customer ranking changes scan order only. Use the CLI or the local
control panel; real inputs, rankings, keys and results stay in ignored local runtime
storage. No stage writes CRM records or sends outreach.

**The shipped adapter and demo contain synthetic loopback data only. This is not a ready-made connector for a commercial service.** Another source needs its own field, response, pagination, identity and relationship acceptance checks. An origin change alone is insufficient.

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

### Features
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

### 项目是什么
Electron 桌面界面与 Playwright 引擎将指定记录的页面、已观察响应、相关消息和附件保存到本机，并通过哈希、会话产物和明确对账状态暴露失败。

新增的 **Evidence Pipeline Guard** 是可选技能及两个独立 Python 工具，不会自动接入采集器、不修改其状态机，也不产生生产数据认证。默认适配器和演示只包含本机虚构数据，不是任何商业平台的现成连接器。换域名不能替代字段、分页、身份及关系验收。

**Market Discovery** 已在同一仓库集成地区/语言任务、公开厂家与经销商发现、证据核验和人工复核后的交接，可从 CLI 或本机控制面板运行。可选本地客户排名只改变扫描顺序；真实输入、排名、密钥和结果留在忽略的数据目录。流程不写 CRM，也不自动发送开发信。

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

### 配置顺序与边界
先确定源码目录，再确定外部私有 evidence/runtime 目录，再设置完整适配器路径和端口，最后启动。上方表格列出全部主要变量。`.env.example` 不会自动加载；必须在启动应用的同一终端设置环境变量。

默认证据在 `runtime/data`，状态在 `runtime`；真实使用建议放到源码目录外。桌面控制/CDP 默认 3211/9334，独立服务默认 3210/9333。单记录启动器要求 `-NoAutoNext`，并将 coordinator 设置为 0。`-ResumeExisting` 只是兼容参数，实际续采取决于控制界面的请求。

分页、消息、大文件并发分别调节。大文件进入 Node 堆，不能拿几十个 CPU 核直接换成几十个浏览器 owner。`CAPTURE_NODE_HEAP_MB` 只限制桌面子服务的 V8 堆，不是整机内存限额。

### 验证、限制与开源范围
维护者可按英文命令检查采集器和市场发现模块。证据技能的 Python 辅助工具与采集器 npm 测试分开；市场发现有自己的模块检查和合成 demo。具体通过结果以实际运行回执为准，源码隐私检查不等于行为验收。

PID 锁没有进程启动时间 fencing，部分替换存在崩溃窗口。合成测试、哈希、窗口完成和本地包完整不能证明外部系统没有遗漏，也不能证明时间与关系语义正确。模型只能产生派生判断，不能覆盖源事实。

公开副本包含采集源码、UI、完整合成适配器、开发工具和通用技能，不包含客户记录、生产配置、Cookie、浏览器会话、缓存、原始历史或模型。真实运行仍可能生成敏感文件，控制/CDP 端口不得对外暴露。提交 issue 使用合成样例，不附私人日志。

README 结构参考 Playwright、Puppeteer 和 GitHub 官方指南，不复制其实现、不宣称背书或同等能力。全部新增内容随项目采用 MIT；以英文 LICENSE 为准，依赖仍遵循各自许可证。
