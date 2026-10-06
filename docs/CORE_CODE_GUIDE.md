# Core Code and Trust Boundaries / 核心代码与信任边界
## English
Read in this order; names are entry points, not execution-coverage proof.

| File | Read for | Critical boundary |
| --- | --- | --- |
| `src/types.ts` | Adapter, response, capture and reconciliation contracts | Fields do not imply extraction coverage |
| `src/adapter.ts` | Adapter loader, numeric record URL and origin/route policies | Exact origin; credential-bearing navigation refused |
| `src/browser-manager.ts` | Dedicated browser/CDP, page selection and record queue | Do not attach an unrelated owner |
| `src/electron-main.ts` | Desktop session, IPC sender, browser view, child server | Cookie/profile storage private; reviewer off without local config |
| `src/server.ts` | Loopback operations, one-shot and repair coordination | Local control, not an authenticated Internet service |
| `src/capture-engine.ts` | Navigation guards, page/replay scope, details, downloads and reconciliation | Preserve observed request filters; bounded binary heap |
| `src/evidence-store.ts` | SHA dedup, identities, session outputs and viewers | Index/latest are derivatives, immutable session is authority |
| `src/runtime-lock.ts` | Process/directory coordination | PID-only identity and stale cleanup have race limits |
| `src/case-inventory.ts` | Previously completed case lookup | Directory existence is not valid completion evidence |
| `src/deferred-repair-queue.ts` | Incomplete classification and explicit repair | No silent endless retries |
| `src/auto-next.ts` | Terminal-state queue progression | Persisted result before advancing |
| `src/relation-window-capture.ts` | Bound related message windows | Exact case/record binding required |
| `src/supplemental-mail-fetch.ts` | Supplemental message fetch | Explicit source manifest, not broad discovery |
| `src/codex-monitor.ts`, `src/codex-wake-policy.ts` | Optional reviewer lifecycle | No automatic right to export raw evidence |
| `src/smoke.ts` | Synthetic asset and URL checks | Not live capture completeness |
| `skills/evidence-pipeline-guard/scripts/assess_run.py` | Metadata advisory | Caller observations, never a production PASS |
| `skills/evidence-pipeline-guard/scripts/prepare_private_bundle.py` | Hash-bound source ZIP | No network upload; heuristic secrets check |
| `scripts/market-discovery.mjs` | CLI stage dispatch and local runtime receipts | Explicit inputs and bounded stages; no implicit CRM write |
| `src/market-discovery.ts` | Control-panel stage validation, local process ownership and metadata status | Fixed scripts/options; runtime selected before launch |
| `modules/market-discovery/legacy/` | Regions/languages/terms, search candidates and pattern verification | Planned tasks and regex matches are not verified companies |
| `modules/market-discovery/bridge/priority_overlay.py`, `priority_cli.py` | Minimal local projections and hash-bound domain ordering consumed by `penetrate` | HMAC output stays confidential; shared domains excluded; ordering only |
| `modules/market-discovery/bridge/public_handoff.py` | Strict reviewed-public JSONL, CSV and manifest | Null CRM binding; structure checks do not prove facts |
| `modules/market-discovery/tests/` | Synthetic bridge regressions | Never use customer evidence as test fixtures |
| `skills/market-discovery/SKILL.md` | Repository workflow and next-stage selection | Resolve repository from the skill location; no global install needed |

Read [Market Discovery](MARKET_DISCOVERY.md) for stage input/output contracts and
the control-panel workflow. This module lives in the same repository but has a
separate data flow from record capture: it must not manufacture `record_id`, a
capture PASS or a CRM write from a public lead. Its optional ranking projection
changes processing order without changing entity evidence or status.

Example origin guard:
```ts
// EN: Compare exact origin and refuse credentials embedded in a navigation URL.
// ZH: 精确比较 origin，并拒绝在导航地址中嵌入账号密码。
const url = new URL(rawUrl);
return ["http:", "https:"].includes(url.protocol)
    && !url.username && !url.password
    && url.origin === adapter.origin;
```
This navigation check is not by itself an attachment/redirect/network firewall or a complete SSRF proof.

Known implementation limits: PID locks are not fenced leases; some runtime writes remove the target before rename; desktop auto-restart exists; blocked-host lists are not OS-level network isolation. The Skill explains conservative operation; it does **not** repair these code paths. Future fixes need focused behavioral/crash tests before new production claims.

## 简体中文
按上表先看契约，再看适配器、浏览器与桌面、控制服务、引擎、存储、锁和修复。模块名出现在测试中不等于真实执行覆盖。

`adapter.ts` 的 origin/URL 检查限制导航范围，不能独自证明附件重定向安全、网络隔离或完整 SSRF 防护。`capture-engine.ts` 保持已观察请求的记录过滤并分别限制下载；`evidence-store.ts` 保存会话证据，latest 和索引只是派生入口；`runtime-lock.ts` 主要依靠 PID，仍有复用和竞态限制。

市场发现入口是 `scripts/market-discovery.mjs`，模块在 `modules/market-discovery/`，
操作契约见[市场发现](MARKET_DISCOVERY.md)。它与采集器同仓库运行，数据流仍独立：
排名只调整扫描顺序，公开候选不能伪造成数字 record_id、capture PASS 或已写入 CRM。
`skills/market-discovery/SKILL.md` 提供可在仓库原位读取的流程技能，不需全局安装。

桌面 Cookie、profile、原始请求和响应都属于私有本地数据。可选审查器默认未配置，不能因为代码存在就授权外传。Python 状态工具只评估调用者提供的观察值；ZIP 工具不上传，秘密检查仍为启发式。

已知局限还包括部分 runtime 写入先删目标再 rename、桌面已有自动重启、域名拦截不等于系统级断网。技能文档不是这些实现的修复证明。后续修复必须有专门行为和 crash 验收，不能借本次文档发布宣称生产硬化完成。
