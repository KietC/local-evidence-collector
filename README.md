# Local Evidence Collector

**A local-first desktop collector for browser records, related messages, documents, and verifiable evidence.**

[![CI](https://github.com/KietC/local-evidence-collector/actions/workflows/ci.yml/badge.svg)](https://github.com/KietC/local-evidence-collector/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D24-green.svg)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-source-blue.svg)](src)

[English](#english) | [简体中文](#简体中文)

## English

### Overview

Local Evidence Collector combines an Electron desktop shell with a Playwright capture engine and a configurable record adapter. It keeps captured evidence on your machine and records hashes, provenance, pagination checks, and explicit failure states.

This is a **generalized source release**, not a ready-made connector for a named commercial service. The shipped adapter targets a **synthetic loopback demo only**. To use another record application, you must implement and test its page, field, response, and relationship contracts. Changing an origin alone is not sufficient.

### Features

- Desktop browser and local control UI.
- Record-scoped capture, root-tab traversal, observed response capture, and bounded pagination.
- Related message detail, tracking, and relation-window capture.
- Documents, attachments, screenshots, DOM snapshots, and local evidence viewers.
- SHA-256 content deduplication, source indexes, append-only session artifacts, and reconciliation checks.
- Explicit incomplete states, deferred repair queues, isolated one-shot capture, and runtime locks.
- Configurable API, message-detail, and binary-download concurrency.
- English-first bilingual source documentation and synthetic regression tests.

### Quick start

Requirements: Node.js 24+, npm, and an Electron-supported desktop environment. The standalone browser mode additionally needs Chrome or Edge. Windows is the primary supported desktop platform; do not assume every OS-specific operation is portable.

```bash
git clone https://github.com/KietC/local-evidence-collector.git
cd local-evidence-collector
npm ci
npm run build
npm test
npm run smoke
```

Start the synthetic fixture service in one terminal:

```bash
npm run demo
```

Then start the desktop app in another terminal:

```bash
npm run desktop
```

The demo is served at `http://127.0.0.1:4877/records`. Open the synthetic record from the list. The demo provides illustrative response shapes for adapter development; a complete browser-capture run must still satisfy every reconciliation check. A fixture server responding successfully is not a completeness claim.

### Configuration

| Variable | Purpose | Default |
| --- | --- | --- |
| `CAPTURE_ADAPTER_PATH` | Local adapter JSON | `adapters/generic/v1/adapter.json` |
| `CAPTURE_OUTPUT_ROOT` | Evidence workspace; contains `cases/` | `runtime/data/` |
| `CAPTURE_RUNTIME_ROOT` | Instance state and browser data | `runtime/` |
| `CAPTURE_CAPTURE_PORT` | Loopback control port | `3210` server / `3211` desktop |
| `CAPTURE_CDP_PORT` | Loopback browser debugging port | `9333` server / `9334` desktop |
| `CAPTURE_ONE_SHOT_RECORD_ID` | Isolated record identity | unset |
| `CAPTURE_UI_GAP_REVISIT_RECORD_ID` | Explicitly authorized revisit identity | unset |
| `CAPTURE_API_PAGE_CONCURRENCY` | Pagination concurrency | bounded in source |
| `CAPTURE_MAIL_DETAIL_CONCURRENCY` | Message-detail concurrency | bounded in source |
| `CAPTURE_RESOURCE_DOWNLOAD_CONCURRENCY` | Large binary concurrency | bounded in source |

Keep local adapter overrides outside the tracked tree, or under ignored `config/local/`. **Never commit credentials, browser profiles, cookie files, or captured records.** `.env.example` documents variables; environment files are not automatically loaded.

For isolated Windows capture:

```powershell
.\scripts\capture-one.ps1 -RecordId 1001 -NoAutoNext
```


### Architecture and source map

```text
Adapter JSON -> BrowserManager -> CaptureEngine
                                     |
                                     v
                               EvidenceStore
                                     |
                       manifests + reconciliation
                                     |
                    local UI / optional repair queue
```

| Source | Responsibility |
| --- | --- |
| [`src/adapter.ts`](src/adapter.ts) | Adapter validation, URL scope, telemetry and AI-host policy |
| [`src/browser-manager.ts`](src/browser-manager.ts) | Dedicated browser, record-page lookup and queue traversal |
| [`src/capture-engine.ts`](src/capture-engine.ts) | Full capture orchestration, bounded concurrency and reconciliation |
| [`src/evidence-store.ts`](src/evidence-store.ts) | Evidence persistence, hash indexes and local viewers |
| [`src/server.ts`](src/server.ts) | Loopback control server, one-shot and deferred repair operations |
| [`src/electron-main.ts`](src/electron-main.ts) | Desktop shell, isolated browser session and local server lifecycle |
| [`src/relation-window-capture.ts`](src/relation-window-capture.ts) | Exact-bound message relation supplementation |
| [`src/supplemental-mail-fetch.ts`](src/supplemental-mail-fetch.ts) | Explicit-bound supplemental message fetch |
| [`src/runtime-lock.ts`](src/runtime-lock.ts) | Local process and directory locks |

Optional reviewer integration code is included for completeness, but **no reviewer configuration, thread identity, executable binding, or model credentials are shipped**. It is inactive without local configuration and is not needed for basic capture.

### Verification and limits

```bash
npm run check
npm test
npm run smoke
npm run verify:source
```

Tests use synthetic records. They do not certify a live service's export completeness. Hashes establish byte identity, not factual accuracy. Captures can be incomplete when a service hides history, changes pagination, removes messages, returns expired links, or omits data. Read the reconciliation status instead of assuming a finished UI means complete evidence.

A secret-pattern scan is a release aid, not proof that every possible sensitive literal is absent. Browser session data and captured content are private local artifacts, even if authentication headers are masked. The control service must remain loopback-only; do not expose the control or CDP ports to the Internet.

### Documentation

- [Adapter development](docs/ADAPTERS.md)
- [Architecture, evidence and recovery](docs/ARCHITECTURE.md)
- [Public-release review and exclusions](docs/PUBLICATION.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Design and documentation references](docs/REFERENCES.md)

### License

MIT. See [LICENSE](LICENSE). Dependencies retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The English license text is authoritative; Chinese documentation is explanatory.

---

## 简体中文

### 项目简介

Local Evidence Collector 是一个本地优先的浏览器证据采集器，结合 Electron 桌面界面、Playwright 采集引擎和可配置记录适配器。采集结果保存在本机，并记录哈希、来源、分页核对结果和明确的失败状态。

这是**通用化源码版本**，不是某个商业平台的现成连接器。默认适配器只连接**本机合成演示服务**。接入其他记录系统时，必须实现并验证其页面、字段、响应和关系契约；仅修改域名并不足够。

### 功能

- 桌面浏览器与本地控制界面。
- 单记录范围采集、标签遍历、已观察网络响应和有界分页。
- 相关消息详情、追踪和关系窗口回填。
- 文档、附件、截图、DOM 快照和本地证据查看器。
- SHA-256 内容去重、来源索引、追加式会话产物和守恒核对。
- 明确的不完整状态、延后修复队列、隔离单次采集和运行锁。
- 可配置的分页、消息详情和大文件下载并发。
- 英文在前、中文在后的源码注释，以及合成回归测试。

### 快速开始

需要 Node.js 24+、npm 和 Electron 支持的桌面环境。独立浏览器模式还需要 Chrome 或 Edge。当前主要支持 Windows 桌面；不能假设所有系统操作都能跨平台使用。

```bash
git clone https://github.com/KietC/local-evidence-collector.git
cd local-evidence-collector
npm ci
npm run build
npm test
npm run smoke
```

一个终端运行 `npm run demo`，另一个终端运行 `npm run desktop`。演示地址为 `http://127.0.0.1:4877/records`，列表和记录均为虚构数据。演示服务可用于开发适配器，但完整浏览器采集仍须通过全部对账；接口能够返回不等于采集完整。

### 配置与隐私

配置变量见上方英文表格。`CAPTURE_ADAPTER_PATH` 指定本地适配器，`CAPTURE_OUTPUT_ROOT` 指定证据工作区，`CAPTURE_RUNTIME_ROOT` 指定运行状态和浏览器数据位置。默认全部位于项目的 `runtime/` 内，不引用原生产工作区。

本地配置应存放在 Git 跟踪范围外或被忽略的 `config/local/` 内。**不得提交登录凭证、Cookie、浏览器配置目录或真实记录。** `.env.example` 仅用于说明，程序不会自动加载环境文件。

Windows 单记录隔离启动：

```powershell
.\scripts\capture-one.ps1 -RecordId 1001 -NoAutoNext
```

实际脚本路径为 `scripts/capture-one.ps1`。`-ResumeExisting` 是兼容参数；是否续采由控制界面的实际采集请求决定，不会仅凭启动参数宣称已续跑。

### 验证与限制

```bash
npm run check
npm test
npm run smoke
npm run verify:source
```

测试仅使用合成记录，不能证明真实源系统的导出完整性。哈希证明字节身份，不证明内容真实正确。历史不可见、分页变更、消息删除、链接过期和接口缺项均可能导致不完整结果，应查看对账状态，而不是把界面结束当作完整证明。

秘密模式检查不能保证发现所有敏感字面量。即使认证头已遮蔽，浏览器会话和采集正文仍是本地私有资产。控制服务与 CDP 端口必须只监听本机，不应对互联网暴露。

### 开发文档与许可证

完整模块索引、适配器开发、架构、恢复、公开发布边界、贡献说明和安全策略均在上方文档入口。可选审查器代码未附带配置、任务标识、可执行文件绑定或模型凭证；默认不运行，也不是基础采集的必要依赖。

采用 MIT 许可证，依赖保留各自许可证。以 [LICENSE](LICENSE) 的英文条款为准；中文说明不替代许可证正文。
