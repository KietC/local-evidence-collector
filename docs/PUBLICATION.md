# Public Release Boundary

## English

This repository includes the desktop shell, full capture engine, browser management, evidence storage, queue and repair logic, relation/message helpers, UI, adapter contract, synthetic tests and developer tools.

The release replaces private record bindings with operator configuration, production origins with reserved or loopback fixtures, service-specific route names with generic record routes, and business workspace defaults with a repository-local runtime. Source comments and documentation are English-first and Chinese-second.

Excluded: real records, customer examples, captured responses, cookies, browser profiles, credentials, production adapter overrides, private operator configuration, historical downstream cleaning pipelines, model weights, runtime, caches, node_modules and compiled output.

The absence of those artifacts is a publication rule, not a promise that operating the software cannot produce sensitive files. Only an allowlisted source tree is committed. Source and synthetic validation do not certify a live production capture.

## 简体中文

公开版本包含桌面、完整采集引擎、浏览器管理、证据存储、队列和修复、关系与消息补采、界面、适配器、合成测试及开发工具。私有记录绑定改为操作者配置，生产来源改为保留域名或本机演示，专用路由改为通用记录路由，默认目录改为项目内运行目录。

不包含真实记录、客户样例、响应正文、Cookie、浏览器配置、凭证、生产适配器覆盖、本地操作者配置、历史清洗流水线、模型、缓存、依赖安装目录和编译输出。运行软件仍可能生成敏感资产，因此只能提交白名单源码，合成测试不能证明真实生产采集完整。
