# Contributing

## English

Open an issue describing a reproducible problem or a proposed adapter contract. Use synthetic fixtures only. Do not attach private captures, authentication data, or production identifiers.

```bash
npm ci
npm run build
npm run check
npm test
npm run market:check
npm run smoke
npm run manifest:source
npm run verify:source
```

Keep comments English-first and Chinese-second. Preserve input scope, response semantics, immutable evidence and explicit failure states. Include regression tests for pagination, identity, resource aliases and privacy boundaries. Describe any adapter schema or runtime compatibility change in the pull request.

Refresh the source-only manifest after source edits. Its hashes use UTF-8/LF normalization for cross-platform checkout; the checker independently verifies every listed file. Runtime evidence is excluded.

## 简体中文

提交可复现问题或适配器契约提案，使用合成样例，不附带私有采集、认证信息或生产标识。提交前运行上方构建、类型检查、测试、冒烟和源码检查。

注释英文在前、中文在后。保持输入范围、响应语义、不可变证据和明确失败状态；分页、标识、资源别名和隐私边界变化必须补回归测试，契约或运行兼容变化须在 PR 中说明。

改动源码后刷新 source manifest；哈希统一按 UTF-8/LF 计算，校验器逐文件独立复核，运行证据不进入清单。
