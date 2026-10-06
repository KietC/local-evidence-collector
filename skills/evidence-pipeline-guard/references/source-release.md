# Source-only release / 仅源码发布
## English
Public and private GitHub are external storage. Source publication never authorizes capture data, customer records, cookies, credentials or private path maps.
Use a generalized source snapshot, exact per-file allowlist and hashes. Ignore files are a convenience, not the complete boundary. Reject links/reparse ancestors, private directories, runtime data, histories and credential literals. Preserve licences and dependency locks.
The ZIP helper takes `--root`, `--allowlist`, `--output`; schema is `{"schema":1,"files":[{"path":"README.md","sha256":"actual_64_hex_digest"}]}`. It validates real hashes, refuses existing output and does not upload. Placeholder digests are invalid; every .env file is rejected.
Confirm account, repository, visibility and current head before publishing. A changed head requires review, not a force push. Public-source metadata must contain only relative paths.
If the user asks for preview only, stop before external mutation. If the user explicitly requests public publication through completion, publish only the reviewed source candidate to the confirmed public destination. Do not treat a past private-destination request as a current public upload authorization.
Keep full conversations, local source indexes and private audit receipts outside the repository. Pattern screening is heuristic; it cannot certify comprehensive privacy. Separate source-release review from behavior tests and production-data quality.
## 简体中文
公开和私密 GitHub 都是外部存储。发布源码不授权上传采集数据、客户记录、Cookie、凭据或私有路径地图。
使用已通用化源码、逐文件白名单及哈希；ignore 不是完整门禁。拒绝 link/reparse、私有目录、runtime、历史和秘密字面量，保留许可证与依赖锁。
ZIP 工具使用英文列出的参数和真实 64 位哈希；占位哈希无效、已有输出拒绝、所有 .env 拒绝，且工具不上传。
上传前确认账号、目标、可见性和当前 head；head 变化要重新裁决，不强推。公开元数据只放相对路径。用户只要预览时停止；本轮明确要求公开上传到底时，仅上传经过审查的源码候选。历史私密授权不能自动转为公开授权。
完整对话、本机源路径索引和私有 receipt 留在仓库外。模式检查有误报和漏报，不能认证绝对隐私；源码审查、行为测试、生产数据质量分别报告。
