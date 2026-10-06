# Third-Party Notices

## English

This source tree does not vendor third-party libraries or browser binaries. Packages are installed separately from the npm lockfile.

| Dependency | Role | Upstream license |
| --- | --- | --- |
| playwright-core | Browser automation | Apache-2.0 |
| Electron | Desktop shell | MIT; bundled Chromium includes additional notices |
| TypeScript | Compiler and development tooling | Apache-2.0 |
| tsx | Development runner | MIT |
| @types/node | Node type definitions | MIT |

Consult the installed dependency's own LICENSE/NOTICE and Electron's distribution notices before redistributing bundled binaries. This file does not replace upstream notices or classify all transitive dependencies.

## 简体中文

源码树不内置第三方库或浏览器二进制，依赖通过 npm lockfile 单独安装。上表说明主要直接依赖及上游许可证。若发布含二进制的安装包，应保留依赖与 Electron/Chromium 自带的 LICENSE/NOTICE；本文件不能代替上游完整声明，也未覆盖全部传递依赖。
