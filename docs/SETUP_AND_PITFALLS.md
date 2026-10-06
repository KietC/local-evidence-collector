# Setup, Evidence and Recovery Pitfalls / 配置、证据与恢复避坑

## English
| Symptom / temptation | Root cause or limit | Correct action | Stop condition |
| --- | --- | --- | --- |
| Changing an origin should connect any application | Adapter JSON is not a semantic parser | Define source-specific identity, fields, pagination and relations | Unknown schema or cross-record scope |
| .env settings have no effect | No dotenv loader is shipped | Set variables in the launcher terminal | Effective configuration unknown |
| Window or health is running, no evidence progresses | Availability and useful work differ | Check exact owner identity, CPU time, I/O and counts together | Owner dead without terminal receipt |
| Repeated Resume might repair terminal failure | Unchanged input repeats the same failure | Preserve receipts and use a documented successor | Same unexplained error repeats |
| Delete lock/checkpoint to unblock | Destroys ownership and recovery evidence | Identify the owner and documented transition | PID identity cannot be established |
| PID exists, therefore owner is valid | PID can be reused | Include start time, workspace and progress in independent inspection | Existing PID-only lock insufficient |
| Use 96 browser owners on a 96-core CPU | Capture is browser/network/state constrained | Keep one scoped owner, separate API/detail/binary concurrency | Multiple writers or memory pressure |
| Increase binary concurrency with page concurrency | Large response bodies enter Node heap | Bound binary transfers separately | RAM/temp/free-space margin exhausted |
| More workers cannot accelerate the last large source | Partition is too coarse | Future parsing uses format-safe microshards, not whole-source Futures | No safe range locator |
| Repeated full scans find current state | Metadata barriers waste I/O | Reuse exact manifests and current pointers | Stale/ambiguous authority |
| Hash/receipt PASS means source data is correct | Hash proves bytes only | Separately reconcile semantic extraction and upstream totals | Unsupported completeness claim |
| Messages count closes but timestamps empty | Generic normalization lost source fields | Inspect native source-family fields, preserve UNKNOWN | Claimed time capability has zero extraction |
| Source ordinal provides calendar chronology | Ordinal is local ordering only | Keep source-local order, verified timestamps and relations distinct | Fabricated absolute dates |
| Near similarity permits deleting questions | Similarity is only a candidate | Keep distinct issues; reversible grouping with traceable members | Model disagreement or missing context |
| Entire batch discarded for one bad result | Batch error fan-out | Preserve valid slots and bound failed-item retry | Missing slots concealed |
| FTS remains correct after base data changes | Derived index has its own binding | Freeze base, rebuild index, bind both versions | Index/base mismatch |
| Cache deletion based on age alone | Active/successor references can remain | Verify references, owner, hashes and rebuildability first | Only filename/size suggests safe deletion |
| Private repository permits uploading captures | Private GitHub is still external storage | Export source-only allowlist | Any captured content/session/credential selected |
| Boolean PASS fields certify a gate | Caller claims are not independent evidence | Bind verifier, inputs, artifact hashes and explicit counts | Placeholders or self-referential manifests |
| Fastest run requires fixed 95% CPU | Throughput, skew and memory bound stages | Optimize measured records/s and safe decomposition | Resource pressure or slower throughput |

References for concurrency and indexing: [Python process pools](https://docs.python.org/3/library/concurrent.futures.html#processpoolexecutor), [hashlib](https://docs.python.org/3/library/hashlib.html), [SQLite Backup API](https://www.sqlite.org/backup.html), [DuckDB FTS](https://duckdb.org/docs/stable/core_extensions/full_text_search.html). Downstream practices are guidance, **not downstream processing implementations shipped by this collector**.

## 简体中文
| 现象或误区 | 原因 | 正确动作 | 必须停止的条件 |
| --- | --- | --- | --- |
| 换域名就能适配任何应用 | JSON 配置不是语义 parser | 定义源家族身份、字段、分页和关系 | schema 未知或跨记录 |
| .env 没生效 | 没有自动加载器 | 在启动终端设置变量 | 有效配置不明 |
| running/健康正常却无产出 | 可用不等于有有效工作 | 同看 owner 身份、CPU 时间、I/O、计数 | owner 死亡且无终态 receipt |
| 反复 Resume 修复失败 | 相同输入重复相同错误 | 保存证据，使用合法 successor | 同一未解释错误重复 |
| 删除锁和 checkpoint | 破坏恢复与所有权证据 | 确认 owner 和状态转换 | 身份无法证明 |
| PID 存在就可靠 | PID 会复用 | 独立核验启动时间、工作区和进度 | PID-only 锁不足 |
| 多核机器开几十个采集 owner | 浏览器、网络及可变状态有限制 | 单 scoped owner，分别限制请求并发 | 多 writer 或内存压力 |
| 大文件并发和小 JSON 一样 | 二进制进入 Node 堆 | 单独压低下载并发 | 内存、temp、空间无余量 |
| 尾部大源加 worker 就快 | 分片粒度错误 | 后续采用格式安全 microshard | 无安全范围 locator |
| 每轮重新全盘扫描 | metadata barrier | 复用准确 manifest/current | 权威资产陈旧或歧义 |
| hash/PASS 证明业务正确 | 只证明字节身份 | 语义提取与源总量单独验收 | 无证据宣称完整 |
| 正文有、时间全空 | 通用 normalization 丢字段 | 重读源家族结构，未知保持 UNKNOWN | 声称能力但覆盖为零 |
| ordinal 是绝对时间 | 只是本地顺序 | 区分局部序列、真实时间和关系 | 猜测绝对日期 |
| 相似即可删问题 | 相似只产生候选 | 可恢复分组并保留所有成员 | 分歧或上下文不足 |
| 一条错整批丢 | 错误扩散 | 保留有效槽，有限重试失败项 | 缺项被隐藏 |
| 基表变化 FTS 仍有效 | 索引为独立 derivative | 重建并绑定基表版本 | 版本不匹配 |
| 老缓存可直接删 | 可能仍被引用 | 核 owner、引用、哈希和可重建性 | 只有名称或大小证据 |
| 私密仓库可放客户数据 | 仍是外传 | 只传源码白名单 | 正文、会话、凭据被选中 |
| 手写 PASS 就通过 | 调用者声明不独立 | 绑定 verifier、输入、产物和计数 | 占位或自引用 manifest |
| 必须每核 95% | 吞吐、倾斜和内存约束 | 按吞吐和安全分解优化 | 压力过大或更慢 |

上述下游清洗、时间、FTS 和并行经验属于指导规则，不代表采集器已经实现这些下游组件。官方参考链接见英文段；不能把参考架构当作现有生产能力。
