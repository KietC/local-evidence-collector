"""Create a confidential priority overlay from two explicit minimal projections."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sys
from datetime import datetime, timezone

from .priority_overlay import build_priority_overlay, ordered_public_entities, domain_scan_order
from .public_handoff import pairs_object
from .runtime_paths import validate_location, runtime_child

MAX_BYTES = 10 * 1024 * 1024
MAX_ROWS = 10000


def read_projection(path: Path) -> tuple[list[dict], str]:
    if not path.is_file() or path.suffix.lower() != ".jsonl":
        raise ValueError("EXPLICIT_JSONL_FILE_REQUIRED")
    if path.stat().st_size > MAX_BYTES:
        raise ValueError("INPUT_SIZE_LIMIT")
    with path.open("rb") as handle:
        raw = handle.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError("INPUT_SIZE_LIMIT")
    lines = raw.decode("utf-8-sig").splitlines()
    if not 1 <= len(lines) <= MAX_ROWS or any(not line.strip() for line in lines):
        raise ValueError("INPUT_ROWS_INVALID")
    def reject_constant(_: str) -> None:
        raise ValueError("NONFINITE_VALUE_FORBIDDEN")
    rows = [json.loads(line, object_pairs_hook=pairs_object, parse_constant=reject_constant) for line in lines]
    if any(not isinstance(row, dict) for row in rows):
        raise ValueError("MINIMAL_PROJECTION_REQUIRED")
    return rows, hashlib.sha256(raw).hexdigest()


def run(root: Path, run_id: str, customers_file: str, entities_file: str) -> dict:
    root = validate_location(root)
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", run_id) or run_id.casefold() in {"latest", "manifest", "index", "status", "checkpoint", "lock", "current", "metadata", "receipts"}:
        raise ValueError("RUN_ID_INVALID")
    encoded = os.environ.get("MARKET_DISCOVERY_HMAC_KEY", "")
    if not re.fullmatch(r"[0-9a-fA-F]{64,256}", encoded) or len(encoded) % 2:
        raise ValueError("LOCAL_HMAC_KEY_REQUIRED")
    key = bytes.fromhex(encoded)
    customers_path = runtime_child(root, customers_file)
    entities_path = runtime_child(root, entities_file)
    if any(part.casefold() in {"cases", "training_runs", "mail", "emails", "browser", "profiles", "cookies"}
           for p in (customers_path, entities_path) for part in p.relative_to(root).parts):
        raise ValueError("PRIVATE_INPUT_PATH_FORBIDDEN")
    customers, customers_sha = read_projection(customers_path)
    entities, entities_sha = read_projection(entities_path)
    overlay = build_priority_overlay(customers, entities, key)
    ordered = ordered_public_entities(entities, overlay)
    output = runtime_child(root, Path("private") / "priority" / run_id)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.mkdir(exist_ok=False)
    artifacts = []
    for name, records in (("priority_overlay.jsonl", overlay), ("ordered_public_entities.jsonl", ordered)):
        body = ("\n".join(json.dumps(row, ensure_ascii=False, sort_keys=True) for row in records) + "\n").encode()
        with (output / name).open("xb") as handle:
            handle.write(body)
        artifacts.append({"path": name, "bytes": len(body), "sha256": hashlib.sha256(body).hexdigest()})
    domain_order = {"schema": "market_discovery.priority_domain_order.v1", "publication": "LOCAL_CONFIDENTIAL",
                    "usage": "SCAN_ORDER_ONLY", "eligibility": "AUTO_MATCHED_ONLY",
                    "input_sha256": {"customers": customers_sha, "public_entities": entities_sha},
                    "domains": domain_scan_order(entities, overlay)}
    map_body = (json.dumps(domain_order, ensure_ascii=False, sort_keys=True) + "\n").encode()
    with (output / "domain_scan_order.json").open("xb") as handle:
        handle.write(map_body)
    map_sha = hashlib.sha256(map_body).hexdigest()
    artifacts.append({"path": "domain_scan_order.json", "bytes": len(map_body), "sha256": map_sha})
    counts = {"records": len(overlay), "matched": sum(r["review_state"] == "AUTO_MATCHED" for r in overlay),
              "needs_review": sum(r["review_state"] == "NEEDS_REVIEW" for r in overlay),
              "no_match": sum(r["review_state"] == "NO_PUBLIC_MATCH" for r in overlay)}
    manifest = {"schema": "market_discovery.priority_manifest.v1", "status": "LOCAL_CONFIDENTIAL",
                "generated_at": datetime.now(timezone.utc).isoformat(), "counts": counts,
                "input_sha256": {"customers": customers_sha, "public_entities": entities_sha},
                "artifacts": artifacts, "network_used": False, "crm_write": False,
                "usage": "SCAN_ORDER_ONLY", "publication": "LOCAL_CONFIDENTIAL"}
    with (output / "manifest.json").open("x", encoding="utf-8") as handle:
        json.dump(manifest, handle, ensure_ascii=False, indent=2)
    pointer = {"schema": "market_discovery.priority_latest.v1", "run_id": run_id,
               "domain_order_sha256": map_sha, "input_sha256": domain_order["input_sha256"]}
    temporary = output.parent / ("latest-" + run_id + ".tmp")
    with temporary.open("x", encoding="utf-8") as handle:
        json.dump(pointer, handle, sort_keys=True)
    os.replace(temporary, output.parent / "latest.json")
    return counts


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--customers", default="inputs/customer_projection.jsonl")
    parser.add_argument("--public-entities", default="inputs/public_entities.jsonl")
    args = parser.parse_args(argv)
    try:
        counts = run(args.root, args.run_id, args.customers, args.public_entities)
    except (ValueError, OSError, UnicodeError) as exc:
        allowed = {"LOCAL_HMAC_KEY_REQUIRED", "INPUT_SIZE_LIMIT", "INPUT_ROWS_INVALID", "MINIMAL_PROJECTION_REQUIRED",
                   "PRIVATE_INPUT_PATH_FORBIDDEN", "PATH_OUTSIDE_RUNTIME", "SOURCE_TREE_RUNTIME_REFUSED", "REPARSE_PATH_FORBIDDEN",
                   "DUPLICATE_ID", "COUNTRY_ISO2_REQUIRED", "INVALID_TEXT_FIELD", "INVALID_RANK", "INVALID_OFFICIAL_DOMAIN",
                   "DUPLICATE_JSON_KEY", "NONFINITE_VALUE_FORBIDDEN", "EXPLICIT_JSONL_FILE_REQUIRED", "RUN_ID_INVALID"}
        allowed.add("PRIVATE_RUNTIME_ROOT_REFUSED")
        code = str(exc) if str(exc) in allowed else "PRIORITY_INPUT_OR_FILESYSTEM_ERROR"
        print(json.dumps({"status": "FAIL", "error_code": code}), file=sys.stderr)
        return 2
    print(json.dumps({"status": "LOCAL_CONFIDENTIAL", "counts": counts, "network_used": False}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
