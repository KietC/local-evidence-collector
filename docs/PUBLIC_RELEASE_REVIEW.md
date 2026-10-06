# Public Release Review and Exclusions / 公开发布审查与排除项
## English
This update merges the generic Skill into the collector repository, **not** into capture runtime. Original production source, business captures and prior private upload candidates are outside the release boundary. Other research/media repositories remain independent.

Included: previously published source assets, bilingual annotation improvements, ordered deployment and pitfalls, optional Skill, stdlib helper sources and a synthetic metadata example. The project root MIT licence also covers the new authored files.

Excluded: original company/system bindings, client identifiers, business examples, absolute production paths, cookies, browser profiles, operator configuration, capture logs/requests/responses, private history, source-location maps, audit databases, model weights, node_modules, compiled output and temporary archives.

Publication uses the existing remote tree as baseline and a root-relative explicit list. File bytes must match that baseline before annotation; unexpected drift stops the release. Sensitive-token/company-marker screening reports counts and error codes, never matched credential contents. The release manifest lists relative paths and file hashes without original local paths.

A pattern scan plus source-only selection reduces leakage risk but cannot prove absolute privacy or absence of every sensitive literal. Existing public history is not re-audited or rewritten by this update. No npm/Python behavioral tests are rerun for this documentation/comment integration. No production hardening or data completeness PASS is claimed.

Publishing is an external action. Runtime/private data remain local regardless of public or private destination. Repo visibility does not authorize captured content disclosure.

## 简体中文
本次将通用 skill 合并到采集器源码仓库，不接入采集运行时。原生产源码、业务采集资料和上轮私密上传候选均不在范围，其他研究和媒体仓库保持独立。新增文件随根目录采用 MIT。

包含既有公开源码、双语注释改进、顺序部署/避坑指南、可选 skill、标准库工具源码和虚构元数据例子。排除原公司/系统绑定、客户标识、业务样例、生产绝对路径、Cookie/profile、操作者配置、采集日志/请求/响应、私有历史、源路径地图、数据库、模型、安装依赖、编译输出和临时归档。

源文件先与远端当前树逐项校对，不明漂移停止。审查不输出匹配到的凭据，只给计数和错误码。发布 manifest 只有相对路径和哈希，无本机原路径。模式检查加白名单降低风险，不能证明绝对无敏感内容；不重审或重写既有公开历史。

本次不重新运行 npm/Python 行为测试，不宣称生产硬化或无遗漏。公开/私密上传都是外部操作，仓库可见性不能授权外传采集数据。
