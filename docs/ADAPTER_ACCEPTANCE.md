# Adapter Acceptance Checklist / 适配器验收表
## English
Use the complete synthetic JSON as a contract template, not a commercial-service preset. Acceptance is source-family/version specific. Capture evidence remains local; never put a real origin, tenant, cookie, record identifier or response example in a public patch.

| Area | Required checks |
| --- | --- |
| Identity | Exact origin/path/query identity; wrong origin, nonnumeric ID, credential URL rejected |
| UI | Full loaded tabs/filters, transient navigation and zero-data states |
| Requests | Exact method/route/record binding; preserve observed POST filters |
| Pagination | Expected totals, unique items, page cap, duplicate/repeated page, changing totals |
| Messages | Detail body, sent/received semantics, native ID, thread/reply/edit relations where supported |
| Attachments | Message/object association, alias identity, binary body, expiry/failure count, permitted host |
| Errors | Unsupported/missing/quarantine buckets retained; no missing-as-zero coercion |
| Recovery | Interrupted session retained; same record authority verified; no false completion |
| Safety | Private output, owner isolation, bounded memory/temp, no unsolicited external reviewer |
| Result | Every claimed capability has tested extraction evidence; unknown remains unknown |

Reconciliation must be **mutually exclusive** at one declared unit. For example:
```text
expected_items = captured_unique + explicitly_missing + unsupported + quarantined
```
Do not mix files, pages, messages and events in the same equation. A discovered count is not an independently reconciled source-system total. Track G0 observed export separately from source-system closure if you extend the system.

HTML attributes, MIME part IDs, SQLite snapshots and source-native locators are important for downstream normalization; this collector's browser evidence does not substitute for those adapters. Use local private source-family Gold Sets for semantic validation without uploading their content.

## 简体中文
完整 synthetic JSON 只是契约模板，不是商业平台预设。验收绑定源家族和版本；真实域名、租户、Cookie、记录 ID 和响应样本不得进入公开 patch。

必须分别核身份、完整加载的标签、精确请求过滤、分页与唯一性、消息详情与时间语义、附件关联及过期失败、错误隔离、恢复与资源安全。任何声称的能力都要有实际提取证据，未知保持未知。

守恒使用同一种单位、互斥状态，不能把文件/页/消息/事件混算。观察到的数量不等于和源系统应有总量闭合。HTML 属性、MIME part、SQLite 一致快照和原生 locator 是下游所需信息，浏览器采集器不能冒充这些 normalization Adapter。Gold Set 留在本地私有区域，公开只报告计数和状态。
