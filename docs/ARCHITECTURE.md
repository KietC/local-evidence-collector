# Architecture, Evidence and Recovery

## English

### Module boundaries

| Component | Owns | Does not prove |
| --- | --- | --- |
| Adapter | Origin, routes, tabs and response-count contract | Completeness of an external export |
| BrowserManager | Local browser connection and record scope | Data correctness |
| CaptureEngine | Observed capture, bounded pagination and reconciliation | Hidden or undisclosed source records |
| EvidenceStore | Local files, SHA-256 indexes and session artifacts | Business truth |
| Control server | Queue coordination, one-shot isolation and repair state | Public multi-user authorization |
| Desktop | Dedicated session, UI and child-server lifecycle | A secure remote deployment |

Captured raw responses, request bodies, screenshots, DOM, local viewers and manifests may contain confidential information. They remain under the ignored output workspace. Header masking is not whole-document anonymization.

### Capture sequence

1. Validate record scope and create local session identity.
2. Install capture guards before navigation.
3. Capture configured tabs and observed network responses.
4. Expand approved pagination without changing record filters.
5. Fetch message details and discovered document resources with separate concurrency bounds.
6. Reconcile counts, response bodies, artifacts and failure classifications.
7. Persist explicit complete/incomplete state and session-bound manifests.

### Concurrency and recovery

Pagination, message detail and large binary downloads use distinct bounded concurrency settings. Large binary transfers materialize data in the Node heap; unlimited downloads can exhaust memory. Do not equate maximum concurrency with maximum throughput.

Directory locks include a local PID and acquisition time, but do not implement a distributed fenced lease. PID reuse and crash windows remain limitations. Atomic replacement and append-only session artifacts improve recovery but are not a full transactional database. Preserve incomplete sessions, inspect their manifests, and resume through the explicit control path. Do not delete locks or invent PASS receipts.

The optional reviewer integration is inactive without an ignored local configuration. Enabling it is a separate operator decision and can execute a locally configured command; keep captured content out of external prompts.

## 简体中文

适配器负责范围和字段契约，浏览器管理器负责本机连接，采集引擎负责有界请求与对账，证据存储负责本地文件和哈希。它们不能自动证明源系统没有隐藏记录，也不能把哈希一致当作业务内容正确。

流程为：范围验证、创建会话、导航前安装门禁、标签和网络采集、分页、消息与附件、守恒核对、写入明确完成或不完整状态。正文、请求体、截图、DOM 和查看器都可能敏感，必须留在被忽略的本地输出目录；遮蔽认证头不等于全量脱敏。

分页、消息详情、大文件各有并发上限。大文件会占用 Node 堆内存，不能无限增加并发。PID 锁不是分布式 fencing lease，原子文件替换也不是完整数据库事务；仍须保留不完整会话并按控制入口恢复，不能手工伪造 PASS。

可选审查器默认关闭，启用后可能执行本地配置命令。启用与对外模型处理是独立决定，不能把本地证据直接发送到外部提示词。
