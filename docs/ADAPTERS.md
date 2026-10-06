# Adapter Development

## English

The public adapter is a **synthetic record application contract**, not an anonymized production configuration. It ships complete tab, endpoint, count-path and asset-host settings for local contract tests.

1. Copy `adapters/generic/v1/adapter.json` to an ignored local path.
2. Set `CAPTURE_ADAPTER_PATH` to that path.
3. Define an exact `origin`, `record_path`, `record_list_url`, and numeric `record_id` query field.
4. Specify `root_tabs`, label groups, queue shape, dynamic/message endpoints, document endpoints, expected endpoint methods, and total-count paths.
5. Verify response field meanings and pagination closure with synthetic fixtures before using a live record application.
6. Adapt engine assumptions where necessary. Generic labels do not make incompatible API schemas equivalent.

The loader validates origin credentials, required contract sections, endpoint scope, tab uniqueness, restricted routes, and endpoint methods. API parameters and response structures remain part of the engine's v1 record schema. Message details, documents and relation edges require additional source-specific acceptance tests. Arbitrary plugins or dynamic code are not loaded from adapter JSON.

### Small configuration example

```json
{
  "schema": 1,
  "adapter_id": "my-local-record-app-v1",
  "origin": "http://127.0.0.1:4877",
  "record_path": "/records/view",
  "record_list_url": "http://127.0.0.1:4877/records"
}
```

This is an **excerpt**, not a complete loadable adapter. Use the shipped full JSON for every required field. Never paste access tokens, cookies, record identities or tenant-specific data into a tracked adapter.

Useful synthetic checks: numeric identity, wrong origin, restricted route, duplicate tabs, zero counts, missing response slots, page size drift, repeated rows, malformed message payload, attachment aliases and expired resources.

## 简体中文

默认适配器是**虚构记录应用的完整契约**，不是生产配置脱敏副本。它包含标签、端点、计数字段和资源域名，供本地契约测试使用。

将完整 JSON 复制到被忽略的本地路径，通过 `CAPTURE_ADAPTER_PATH` 指定，然后逐项定义页面、记录标识、标签、队列、动态、消息、附件、请求方法和计数路径。上方示例只是片段，不能单独作为完整适配器加载。

域名变化不会自动修复响应语义、分页或关系结构。必要时应修改引擎中的 v1 记录模型，并先添加合成验收测试。加载器验证来源、必需区段、端点范围、标签唯一性和受限路径；JSON 不会加载任意代码插件。

禁止把令牌、Cookie、真实记录 ID 或租户数据写入受 Git 跟踪的适配器。重点测试来源冲突、标识异常、零计数、缺失响应、重复分页、消息格式错误、附件别名和过期资源。
