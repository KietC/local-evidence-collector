<#
EN: Support the local collector within the explicit module scope; no live evidence is included in this source.
ZH: 在明确模块范围内辅助本地采集器；本源码不包含真实采集证据。
#>
<#
EN: Start one isolated record capture without modifying an existing workspace.
ZH: 启动单条隔离采集，不修改现有工作区。
#>
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^\d+$')][string]$RecordId,
  [switch]$NoAutoNext, [switch]$ResumeExisting, [switch]$RevisitUiGaps,
  [switch]$SkipBuild
)
$ErrorActionPreference = 'Stop'
if (-not $NoAutoNext) { throw 'Explicit -NoAutoNext is required.' }
$env:CAPTURE_ONE_SHOT_RECORD_ID = $RecordId
$env:CAPTURE_QUEUE_COORDINATOR = '0'
if ($RevisitUiGaps) { $env:CAPTURE_UI_GAP_REVISIT_RECORD_ID = $RecordId }
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
  if (-not $SkipBuild) { & npm.cmd run build; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
  & npm.cmd run desktop
  exit $LASTEXITCODE
} finally { Pop-Location }
