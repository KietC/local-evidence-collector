# Ordered Deployment and First Synthetic Capture / 顺序部署与首次合成采集

[English](#english) | [简体中文](#简体中文)

## English
Do these steps in order. The guide describes commands to run, not a claim they have run successfully on your machine. Stop at a failed checkpoint; do not launch a second owner to conceal the first failure.

### 1. Install prerequisites
Install Node.js 24+ and npm from the official Node.js distribution. Electron is installed through the dependency lock; a GPU and Python are not collector prerequisites.
```powershell
node --version
npm.cmd --version
```
Expected: Node major >=24. If PATH is stale, open a new terminal; do not silently mix two Node installations.

### 2. Get the source and dependencies
```powershell
git clone https://github.com/KietC/local-evidence-collector.git
Set-Location -LiteralPath .\local-evidence-collector
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
npm.cmd run smoke
if ($LASTEXITCODE -ne 0) { throw 'Synthetic asset smoke failed.' }
```
`npm ci` uses the committed lock. Electron's install may need a download. Do not replace it with an unpinned dependency update when a proxy/download fails. `playwright-core` does not install a general browser fleet.

### 3. Choose private output before launching
For Windows, configure the same terminal that will start the desktop:
```powershell
$AppSource = (Get-Location).Path
$PrivateHome = Join-Path $env:LOCALAPPDATA 'LocalEvidenceCollector'
$env:CAPTURE_ADAPTER_PATH = (Resolve-Path .\adapters\generic\v1\adapter.json).Path
$env:CAPTURE_OUTPUT_ROOT = Join-Path $PrivateHome 'evidence'
$env:CAPTURE_RUNTIME_ROOT = Join-Path $PrivateHome 'state'
$env:CAPTURE_CAPTURE_PORT = '3211'
$env:CAPTURE_CDP_PORT = '9334'
New-Item -ItemType Directory -Force -Path $env:CAPTURE_OUTPUT_ROOT,$env:CAPTURE_RUNTIME_ROOT | Out-Null
```
These are generic per-user examples, not a prescribed production location. Change the parent deliberately when storage policy requires it. Evidence, state and source are separate. Browser state remains private even if filenames look harmless.

For POSIX shells:
```bash
export CAPTURE_ADAPTER_PATH="$PWD/adapters/generic/v1/adapter.json"
export CAPTURE_OUTPUT_ROOT="$HOME/.local/share/local-evidence-collector/evidence"
export CAPTURE_RUNTIME_ROOT="$HOME/.local/share/local-evidence-collector/state"
export CAPTURE_CAPTURE_PORT=3211
export CAPTURE_CDP_PORT=9334
mkdir -p "$CAPTURE_OUTPUT_ROOT" "$CAPTURE_RUNTIME_ROOT"
```
Desktop platform support is subject to Electron and platform-specific code; these shell examples do not certify cross-platform support.

### 4. Check ports and ownership
```powershell
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object LocalPort -in 3211,9334,4877 |
    Select-Object LocalAddress,LocalPort,OwningProcess
```
If a port is already bound, identify its owner. Do not kill unrelated processes or attach blindly to an unknown healthy server. Choose another control/CDP pair if appropriate; the synthetic demo currently uses fixed port 4877. Do not start desktop and standalone owners against the same evidence/state workspace.

### 5. Start the synthetic service
In a separate terminal at the source root:
```powershell
npm.cmd run demo
```
Expected: `Synthetic demo: http://127.0.0.1:4877/records`.
```powershell
Invoke-RestMethod 'http://127.0.0.1:4877/healthz'
```
Expected: `synthetic=true`. The fixture lists record 1001 and mostly zero-count collections; it is not a realistic-volume benchmark or a complete live-service contract.

### 6. Start the desktop
Return to the configured terminal:
```powershell
npm.cmd run desktop
```
Expected: local control pane and synthetic record list. Open the synthetic record and initiate capture through the UI. Review scope, response slots, pagination and reconciliation; do not label the run complete merely because the fixture returns 200.

Alternative one-shot launcher, instead of a concurrent ordinary desktop:
```powershell
.\scripts\capture-one.ps1 -RecordId 1001 -NoAutoNext
```
It launches/builds the desktop with explicit isolated identity. It does not itself promise a finished capture. `-ResumeExisting` is compatibility-only; `-RevisitUiGaps` is an explicit revisit request, not automatic repair authorization. Set variables again in any new terminal.

### 7. Check acceptance before a real adapter
Use [ADAPTER_ACCEPTANCE.md](docs/ADAPTER_ACCEPTANCE.md). Bind artifact counts, unique records, exact scope and missing/error buckets. Preserve incomplete sessions.
```powershell
npm.cmd run check
npm.cmd run build
npm.cmd test
npm.cmd run smoke
npm.cmd run verify:source
```
These are optional explicit maintainer validation commands. npm tests use synthetic inputs, do not cover the Python helpers, and cannot prove live export completeness. Do not configure the optional reviewer until privacy, its executable/workspace and operator policy have been separately reviewed.

### 8. Stop, resume or update safely
Use the application's stop/cancel controls. Preserve manifests and checkpoints before shutdown. Confirm owner identity and descendant exit before reopening a workspace. Existing PID locks have known limits; do not manually remove a lock just to make startup proceed.
Keep source updates separate from evidence. Retain old session artifacts; a successor uses changed input/config/code bindings. Never silently retry the same failed input until its cause is understood.

## 简体中文

本指南必须按顺序操作；写出命令不代表你的机器已经验证通过。遇到失败检查点立即处理原因，不用第二个 owner 掩盖第一个失败。

### 1. 安装前提
安装官方 Node.js 24+ 和 npm，先执行英文段的版本命令。Electron 由锁定依赖安装；基础采集不需要 GPU 或 Python。PATH 仍指向旧版本时换新终端，不混用解释器。

### 2. 下载源码、安装、构建、资源检查
从仓库根目录依次执行英文 PowerShell 命令。每一步必须检查退出码。`npm ci` 使用现有 lock；Electron 下载失败应修复下载条件，不擅自升级依赖。项目使用 `playwright-core`，不会自动安装通用浏览器集合。

### 3. 启动前先确定私有目录
英文示例将 evidence/state 放到通用的本机用户数据目录，源码单独保存。按本机存储政策修改父目录，不照抄他人的生产路径。必须在真正启动程序的同一个终端设置变量；新终端不继承之前终端的临时变量。`.env.example` 不会自动加载。POSIX 命令只是环境配置参考，不等于已认证跨平台兼容。

### 4. 端口和 owner
检查 3211、9334、4877 的监听进程；占用时先确认身份，不能直接杀进程，也不能仅因健康接口正常就认定属于本次任务。桌面和独立服务不得共享同一 evidence/state owner。演示端口 4877 当前固定。

### 5. 演示服务
新终端在源码根目录运行 `npm.cmd run demo`，再检查 `/healthz` 的 `synthetic=true`。演示仅有虚构记录 1001，多数集合为零，不是大规模性能或真实业务完整性样本。

### 6. 桌面与单记录
返回配置好的终端运行 `npm.cmd run desktop`，进入虚构记录，再由界面发起采集。HTTP 200 和窗口出现不能当作完整采集。
也可选择英文段中的单记录启动器，而不是同时启动两个桌面。`-NoAutoNext` 必填；`-ResumeExisting` 只是兼容参数；`-RevisitUiGaps` 表示显式回访，不代表自动修复授权。启动器不保证采集已完成。

### 7. 验收后再接真实适配器
核对来源、唯一记录、分页、响应槽、缺失和错误；不完整会话必须保留。英文命令是维护者可主动运行的合成检查，Python 工具不在 npm 测试内。接真实系统仍须专门验收；可选 reviewer 默认不配置，必须另审隐私、命令和工作区。

### 8. 安全停止、恢复和升级
用应用取消/停止入口，保留 manifest/checkpoint。确认 owner 与子进程已退出后再重开。现有 PID 锁有局限，不能手删锁绕过。更新源码不覆盖 evidence，输入或配置变化用 successor，失败原因未知时不反复执行相同输入。
