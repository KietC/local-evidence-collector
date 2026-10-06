# Run evidence and completion

## Establish the unit

Label counts as objects, sources, events, blocks, pages, candidate representatives, or model decisions. Do not compare different units as if they were growth or loss.

Use disjoint status buckets and the additive identity:

```text
input = completed + quarantined + unsupported + failed + pending
```

Do not subtract excluded categories from an input conservation equation. Cross-check both row count and unique stable IDs; sum-of-shards alone cannot detect cross-shard duplication.

## Ownership and progress

A credible RUNNING observation needs an owner token, PID and start-time match, lease/fencing generation, heartbeat freshness, and actual progress evidence. A public status string or a matching PID alone is insufficient. PID reuse and worker/launcher double-counting are known hazards.

If owner_alive=false and public_status=RUNNING, classify stale running. A documented intentional pause is not unexpected owner death. No receipt is not proof of data loss.

A single low-CPU sample cannot prove a stall. Check the configured observation window and all available progress signals. Do not confuse the last completed counter update with a hung large shard.

## Receipts and PASS

Bind the exact files, not just hash strings supplied by a caller. Reject stale paths, self-hashing receipt manifests, missing artifacts, mismatched code/input hashes, skipped required gates, placeholder dependencies, and production claims based only on synthetic fixtures.

Separate artifact identity, execution success, schema fidelity, relational fidelity, source completeness, and delivery completeness. An audit may finish successfully while its production verdict remains FAIL_CLOSED.

## Scope and recovery

Do not load an old handoff's DONE into a successor queue. Use package-owned baselines for independent writers and a separately reconciled global baseline at integration. Show an explicit package ID and complete entry paths.

Preserve a checkpoint, predecessor reference, valid shard receipts, and an intentional-pause marker before a requested restart. No destructive lock cleanup or arbitrary generation reuse.

## Metadata helper

`assess_run.py` accepts this content-free envelope:

```json
{
  "input_count": 100,
  "status_counts": {"COMPLETED": 90, "PENDING": 10},
  "owner_alive": true,
  "owner_identity_verified": true,
  "public_status": "RUNNING",
  "progress_observed": true,
  "receipt_present": false,
  "scope": "production",
  "hash_bindings_verified": false,
  "lineage_verified": false,
  "semantic_quality_verified": false,
  "source_completeness_verified": false,
  "unique_id_count": 100,
  "error_count": 0,
  "intentional_pause": false
}
```

Boolean verification fields are observations supplied by an independent verifier, not evidence produced by this helper. Even the strongest output is `READY_FOR_INDEPENDENT_REVIEW`, never a new production PASS.

## 中文要点

先声明计数单位；所有状态必须互斥且相加守恒。运行态要核 owner 身份和实际增长。旧工作包、旧 receipt、合成验收和 caller 自报的 true 都不能冒充当前生产完成。
