# Optional Skill Integration / 可选技能集成
## English
The Skill is distributed **inside this repository**; no separate repository or agent process is necessary. Source code remains usable without an agent.

### Install without overwriting another Skill
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
The sample should yield an advisory synthetic state; **the command has not been re-executed for this release**. Packet fields are independent observations supplied by the caller, not automatically measured values. `hash_bindings_verified=true` is not proof unless an independent verifier actually performed the check.

Exit 0 means the packet was assessed, not production success. Inspect the `status` and `error_codes`. Invalid/count-mismatched packets fail closed. No raw run receipts or customer files should be passed as the packet.

### Source ZIP utility
```bash
python skills/evidence-pipeline-guard/scripts/prepare_private_bundle.py --root approved-source --allowlist approved-source-list.json --output reviewed-source.zip
```
The allowlist contains `schema=1` and `files[{path,sha256}]`. Generate actual SHA-256 values from reviewed source; descriptive placeholder digests are rejected. ZIP output must be new, outside the input root, with an existing parent folder.

Its historical filename contains "private"; this does not make contents safe for a private/public upload. The tool never uploads. It rejects all `.env*` files (including `.env.example`), denied directories and unbound hashes. To export this entire repository, use a separately reviewed explicit source manifest; do not loosen the helper silently. The new helpers have no fresh execution validation in this release.

## 简体中文
技能直接位于本仓库，不需要另建仓库或启动 agent 进程；没有 agent 仍可使用采集器。按英文 PowerShell 命令复制到技能目录；已有同名目录时先比较备份，不覆盖。自定义技能目录需显式修改；各客户端加载或刷新方式不同，Python 不是读取技能指令的前提。

调用示例要求只读准确元数据，不授权重启、删除或上传。状态工具仅评估调用者提供的独立观察，不会自动测量 owner 或核验数据库；传入 true 不能冒充证据。退出码 0 仅表示评估结束，要看 status/error_codes，不能当生产 PASS。示例命令本次未重新执行。

源码 ZIP 工具需真实哈希白名单，输出必须位于输入外的新文件，父目录须已存在。历史文件名含 private 不等于内容可上传，工具没有网络上传功能；它会拒绝包括 .env.example 在内的所有 .env 文件。要导出整个仓库应另用经过审查的源码 manifest，不擅自放宽规则。本次新工具尚无新执行验收。
