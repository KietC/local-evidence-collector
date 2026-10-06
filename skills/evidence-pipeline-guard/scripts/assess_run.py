#!/usr/bin/env python3
"""EN: Assess a content-free observation packet; never execute or certify a run.
ZH: 评估纯元数据观察包，不执行生产，也不产生生产认证。
"""
import argparse
import hashlib
import json
import re
from pathlib import Path

STATES = {"COMPLETED", "QUARANTINED", "UNSUPPORTED", "FAILED", "PENDING",
          "SEQUENCE_ONLY", "NATIVE_UNCALIBRATED", "CONFLICT_QUARANTINED",
          "INTERVAL_ONLY", "UNKNOWN", "CORROBORATED_EXACT", "CALIBRATED_NATIVE"}


def assess(packet):
    """EN: Derive a conservative advisory verdict from explicit observations.
    ZH: 根据明确观察值产生保守建议状态。
    """
    if not isinstance(packet, dict):
        raise ValueError("PACKET_SCHEMA_INVALID")
    total = packet.get("input_count")
    buckets = packet.get("status_counts")
    if type(total) is not int or total < 0 or not isinstance(buckets, dict) or not buckets:
        raise ValueError("COUNTS_SCHEMA_INVALID")
    if not set(buckets).issubset(STATES):
        raise ValueError("STATUS_BUCKET_NOT_ALLOWLISTED")
    if any(type(v) is not int or v < 0 for v in buckets.values()):
        raise ValueError("STATUS_COUNT_INVALID")
    errors = []
    if sum(buckets.values()) != total:
        errors.append("COUNT_CONSERVATION_MISMATCH")
    unique = packet.get("unique_id_count")
    if unique is not None:
        if type(unique) is not int or unique < 0:
            raise ValueError("UNIQUE_COUNT_INVALID")
        if unique != total:
            errors.append("UNIQUE_ID_COVERAGE_MISMATCH")
    for name in ("owner_alive", "owner_identity_verified", "progress_observed",
                 "receipt_present", "hash_bindings_verified", "lineage_verified",
                 "semantic_quality_verified", "source_completeness_verified",
                 "intentional_pause"):
        if name in packet and packet[name] is not None and type(packet[name]) is not bool:
            raise ValueError("OBSERVATION_BOOLEAN_INVALID")
    count = packet.get("error_count", 0)
    if type(count) is not int or count < 0:
        raise ValueError("ERROR_COUNT_INVALID")
    if count:
        errors.append("UPSTREAM_ERRORS_PRESENT")
    if errors:
        status = "FAIL_CLOSED_ADVISORY"
    elif packet.get("intentional_pause") is True:
        status = "INTENTIONALLY_PAUSED"
    elif packet.get("public_status") == "RUNNING" and packet.get("owner_alive") is False:
        status = "STALE_RUNNING_OWNER_DEAD"
        errors.append(status)
    elif packet.get("owner_alive") is True and packet.get("owner_identity_verified") is not True:
        status = "OWNER_IDENTITY_UNVERIFIED"
    elif packet.get("owner_alive") is True and packet.get("progress_observed") is True:
        status = "RUNNING_OBSERVED"
    elif packet.get("receipt_present") is not True:
        status = "RECEIPT_PENDING_UNVERIFIED"
    elif packet.get("hash_bindings_verified") is not True:
        status = "ARTIFACT_BINDINGS_UNVERIFIED"
    elif packet.get("scope") == "synthetic":
        status = "SYNTHETIC_ONLY"
    elif packet.get("lineage_verified") is not True:
        status = "LINEAGE_UNVERIFIED"
    elif packet.get("semantic_quality_verified") is not True:
        status = "SEMANTIC_QUALITY_UNVERIFIED"
    elif packet.get("source_completeness_verified") is not True:
        status = "SOURCE_COMPLETENESS_UNVERIFIED"
    else:
        status = "READY_FOR_INDEPENDENT_REVIEW"
    return {"stage": "RUN_EVIDENCE_ADVISORY", "status": status,
            "counts": {"input_count": total, "status_sum": sum(buckets.values()),
                       "status_counts": dict(sorted(buckets.items())),
                       "unique_id_count": unique, "error_count": count},
            "hashes": {}, "error_codes": errors, "local_report_paths": []}


def main():
    # EN: Parse explicit CLI inputs; no collector startup or implicit network action.
    # ZH: 只解析明确 CLI 输入，不启动采集器或隐式网络动作。
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--packet", type=Path, required=True)
    args = parser.parse_args()
    try:
        # EN: Read only an explicit metadata packet, with a bounded size.
        # ZH: 只读取显式指定且有大小上限的元数据包。
        with args.packet.open("rb") as stream:
            raw = stream.read(1024 * 1024 + 1)
        if len(raw) > 1024 * 1024:
            raise ValueError("PACKET_SIZE_LIMIT")
        report = assess(json.loads(raw.decode("utf-8-sig")))
        report["hashes"]["observation_packet_sha256"] = hashlib.sha256(raw).hexdigest()
    except (OSError, ValueError, TypeError, UnicodeError) as exc:
        code = str(exc)
        if not re.fullmatch(r"[A-Z][A-Z0-9_]{2,80}", code):
            code = "PACKET_READ_OR_SCHEMA_ERROR"
        report = {"stage": "RUN_EVIDENCE_ADVISORY", "status": "FAIL_CLOSED_ADVISORY",
                  "counts": {}, "hashes": {}, "error_codes": [code], "local_report_paths": []}
    print(json.dumps(report, ensure_ascii=True, sort_keys=True))
    return 1 if report["status"].startswith("FAIL_CLOSED") else 0


if __name__ == "__main__":
    raise SystemExit(main())
