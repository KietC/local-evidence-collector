---
name: evidence-pipeline-guard
description: Resume, review, scale, or package local evidence-processing workflows without confusing checkpoints, synthetic tests, coverage, chronology, and production completion. Use for existing capture/cleaning pipelines or their source-only exports, not unrelated development.
---

# Evidence Pipeline Guard

Keep the user's present outcome fixed. Apply only the relevant mode below; do not re-run every historical audit.

## Non-negotiable distinctions

- A collector, a normalized dataset, a semantic derivative, and a source release are separate deliverables.
- A checksum proves byte identity, not business truth, semantic fidelity, privacy, or source-system completeness.
- Test/package/local-integrity PASS does not imply production/data-quality PASS.
- Processing coverage is not successful extraction coverage.
- Source-local ordinal order is not conversation order or absolute chronology.
- History is evidence of what was reported then, not current authorization or current process state.

## Start narrowly

1. State the requested outcome, input unit, accepted states, and stop point.
2. Use the registered source map and exact current pointers/receipts. Do not enumerate customer directories or rescan disks to rediscover known assets.
3. Inspect code/control metadata only unless the user separately authorizes local content processing. No raw customer material, browser sessions, cookies, credentials, or private filenames in agent-facing reports or uploads.
4. Bind the current input, script, configuration, dependency, and output hashes. A changed baseline needs a successor, not silent reuse.
5. Before a side effect, establish exact ownership and an idempotency key. Read-only inspection never grants permission to resume, terminate, delete, download, or upload.

## Choose a mode

- **Resume/status:** read [run-evidence.md](references/run-evidence.md). Use `scripts/assess_run.py` only on a purpose-built metadata packet; it is not a process monitor or a production verifier.
- **Time/lineage:** read [temporal-lineage.md](references/temporal-lineage.md). Keep unsupported temporal conclusions unknown.
- **Performance/recovery:** read [performance-recovery.md](references/performance-recovery.md). Optimize work decomposition and measured throughput, not a fixed CPU percentage.
- **Source export:** read [source-release.md](references/source-release.md). Use `scripts/prepare_private_bundle.py` on an explicit source allowlist. It never uploads.

## Decision boundary

Do not restart a healthy owner merely because CPU is low. Compare CPU time, I/O, completed shards, and writer/checkpoint progress over a relevant window. A final published receipt must independently close counts, uniqueness, lineage, errors, and artifact hashes.

For a failed terminal run, preserve evidence and use its documented successor transition. Do not repeatedly resume the same unchanged failed input. Never manually remove locks or rewrite status to manufacture recovery.

For a state that cannot be proved, report `UNVERIFIED`, `BLOCKED`, or an explicit preliminary status. Do not fabricate a percentage confidence or finite ETA.

## Report

Use stage/status/counts/hashes/error_codes/local_report_paths. Keep reports content-free. Calculate ETA from sustained measured throughput, remaining work, and a separately stated serial tail. State unknown tail cost instead of repeating a stale optimistic estimate.

## 中文使用说明

这是一个按需调用的避坑技能，不是自动启动生产的授权。先确认本轮目标，再选状态、时间血缘、性能恢复或源码打包模式。覆盖、顺序、测试通过、架构冻结和业务数据正确必须分开表述。
