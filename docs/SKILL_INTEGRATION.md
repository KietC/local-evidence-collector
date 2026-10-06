# Repository Skill Integration / 仓库技能集成
## English
Both Skills are distributed **inside this repository**; no separate repository,
global installation or agent process is necessary. Source code remains usable
without an agent. Loading a Skill provides instructions; it does not run the
collector or any market stage automatically.

| Skill | Use for | Local entry |
| --- | --- | --- |
| Evidence Pipeline Guard | Evidence status, chronology, recovery decisions and source-only packaging | [`skills/evidence-pipeline-guard/SKILL.md`](../skills/evidence-pipeline-guard/SKILL.md) |
| Market Discovery | Region/language planning, public manufacturer/dealer research, optional scan ordering and reviewed handoff | [`skills/market-discovery/SKILL.md`](../skills/market-discovery/SKILL.md) |

### Use Market Discovery in place

Give the agent the repository-local Skill path and the selected runtime:

```text
Read skills/market-discovery/SKILL.md from this checkout.
Use the integrated market:discovery workflow with my selected local runtime.
Start from the available regions, stable CLDR and reviewed terminology.
Keep customer priority local and apply it only to scan order.
Produce a review handoff; do not modify CRM or send outreach.
```

When the client already discovers repository Skills, `$market-discovery` selects
the same instructions. Discovery support is client-specific; an explicit path
works without changing global configuration. From the Skill directory, `../..`
is this repository root. The agent verifies its `package.json` command and reads
[`docs/MARKET_DISCOVERY.md`](MARKET_DISCOVERY.md) before running the CLI. If only
the Skill file is copied elsewhere, those relative module/docs links are not
self-contained; select the actual checkout instead of guessing a data directory.

The Skill guides stage selection and evidence interpretation. The npm command
and control panel implement the stages. A positive search or regex result stays
pending review, and the final public handoff does not create a CRM record.

### Optional global copy of Evidence Pipeline Guard
This optional recipe concerns the self-contained evidence Skill only. It is not
required for Market Discovery and was not automatically executed by this change.
Windows PowerShell, at the repository root:
```powershell
$SkillHome = Join-Path $env:USERPROFILE '.codex\skills'
$Destination = Join-Path $SkillHome 'evidence-pipeline-guard'
if (Test-Path -LiteralPath $Destination) { throw 'Skill exists: compare and back it up first.' }
New-Item -ItemType Directory -Force -Path $SkillHome | Out-Null
Copy-Item -LiteralPath .\skills\evidence-pipeline-guard -Destination $Destination -Recurse
```
For a custom agent skill home, change the destination explicitly. Other agents can read SKILL.md if they support this convention; discovery/reload is client specific. The Python helpers are not required to load the instructions.

### Invoke
```text
$evidence-pipeline-guard Review the current local capture.
Use exact metadata receipts only. Distinguish owner progress, counts, hashes,
semantic quality and source completeness. Do not restart, delete or upload.
```

### Metadata advisory utility
Python 3.11+, standard library only:
```bash
python skills/evidence-pipeline-guard/scripts/assess_run.py --packet examples/metadata-observation.synthetic.json
```
The sample should yield an advisory synthetic state; check the actual command
result. Packet fields are independent observations supplied by the caller, not
automatically measured values. `hash_bindings_verified=true` is not proof unless
an independent verifier actually performed the check.

Exit 0 means the packet was assessed, not production success. Inspect the `status` and `error_codes`. Invalid/count-mismatched packets fail closed. No raw run receipts or customer files should be passed as the packet.

### Source ZIP utility
```bash
python skills/evidence-pipeline-guard/scripts/prepare_private_bundle.py --root approved-source --allowlist approved-source-list.json --output reviewed-source.zip
```
The allowlist contains `schema=1` and `files[{path,sha256}]`. Generate actual SHA-256 values from reviewed source; descriptive placeholder digests are rejected. ZIP output must be new, outside the input root, with an existing parent folder.

Its historical filename contains "private"; this does not make contents safe for a private/public upload. The tool never uploads. It rejects all `.env*` files (including `.env.example`), denied directories and unbound hashes. To export this entire repository, use a separately reviewed explicit source manifest; do not loosen the helper silently. Validation of market stages does not also validate these separate evidence utilities.

## 简体中文
两个技能都位于本仓库，无需另建仓库、全局安装或启动 agent 进程；没有 agent
仍可用 CLI/界面。加载技能只提供指令，不自动执行采集或市场发现。

Market Discovery 应直接读取 `skills/market-discovery/SKILL.md`。从该技能目录
向上两级定位仓库，核对 `package.json` 的 `market:discovery` 命令，再读取
[输入与阶段契约](MARKET_DISCOVERY.md)。不要把 Skill 单独复制后假定仍能找到原仓库。
客户端支持仓库技能发现时可用 `$market-discovery`；否则明确给出技能路径即可。
技能指导阶段选择，npm 命令和控制面板执行阶段；排名只调整扫描顺序，交接不写 CRM。

英文全局复制命令仅是 Evidence Pipeline Guard 的可选用法，本次不会自动执行。
已有同名目录时先比较备份，不覆盖。各客户端加载或刷新方式不同，Python 不是读取指令的前提。

证据技能调用示例要求只读准确元数据，不授权重启、删除或上传。状态工具仅评估调用者提供的独立观察，不会自动测量 owner 或核验数据库；传入 true 不能冒充证据。退出码 0 仅表示评估结束，要看 status/error_codes，不能当生产 PASS。是否通过以实际执行结果为准。

源码 ZIP 工具需真实哈希白名单，输出必须位于输入外的新文件，父目录须已存在。历史文件名含 private 不等于内容可上传，工具没有网络上传功能；它会拒绝包括 .env.example 在内的所有 .env 文件。要导出整个仓库应另用经过审查的源码 manifest，不擅自放宽规则。市场模块测试通过不代表这些独立证据工具也完成了测试。
