"""Local-only priority overlay, adapted from the historical v1.1 foundation.

Inputs are explicit minimal projections, never a CRM directory or mail corpus.
Output is pseudonymous but still confidential: keep it outside source control.
No network, CRM writes, evidence promotion or scoring takes place here.
"""
from __future__ import annotations

import hashlib
import hmac
import re
import unicodedata
from urllib.parse import urlsplit


def normalized_name(value: str) -> str:
    # Preserve non-Latin characters. Do not silently strip all Cyrillic/Arabic.
    return " ".join(unicodedata.normalize("NFKC", value).casefold().split())


def official_host(value: str | None) -> str:
    if not value:
        return ""
    url = urlsplit(value if "://" in value else "https://" + value)
    if url.scheme not in {"https", "http"} or url.username or url.password:
        raise ValueError("INVALID_OFFICIAL_DOMAIN")
    host = (url.hostname or "").strip(".").encode("idna").decode().lower()
    host = host.removeprefix("www.")
    if "." not in host or not re.fullmatch(r"[a-z0-9.-]+", host):
        raise ValueError("INVALID_OFFICIAL_DOMAIN")
    return host


def customer_ref(key: bytes, local_id: str) -> str:
    if len(key) < 32 or not local_id:
        raise ValueError("KEY_OR_ID_INVALID")
    return "CUST-" + hmac.new(key, ("priority-v2|" + local_id).encode(), hashlib.sha256).hexdigest()


def build_priority_overlay(customers: list[dict], public_entities: list[dict], key: bytes) -> list[dict]:
    """Only exact unique domain or exact legal-name+country matches auto-link.

    Primary 70/30 ranking wins; storage-only rank is a tie breaker and fallback.
    Multiple entities sharing one domain stay NEEDS_REVIEW, not auto-merged.
    No customer names, raw IDs or rankings' underlying values leave this output.
    """
    if len(key) < 32:
        raise ValueError("KEY_TOO_SHORT")
    customer_fields = {"local_id", "legal_name", "country", "official_domain", "primary_rank", "secondary_rank"}
    public_fields = {"public_entity_key", "legal_name", "country", "official_domain"}
    for rows, allowed, id_field in [(customers, customer_fields, "local_id"),
                                     (public_entities, public_fields, "public_entity_key")]:
        seen = set()
        for row in rows:
            if set(row) - allowed or not isinstance(row.get(id_field), str) or not row[id_field]:
                raise ValueError("MINIMAL_PROJECTION_REQUIRED")
            if row[id_field] in seen:
                raise ValueError("DUPLICATE_ID")
            seen.add(row[id_field])
            if row.get("country") and not re.fullmatch(r"[A-Z]{2}", row["country"]):
                raise ValueError("COUNTRY_ISO2_REQUIRED")
            for field in ("legal_name", "official_domain"):
                if row.get(field) is not None and not isinstance(row[field], str):
                    raise ValueError("INVALID_TEXT_FIELD")
    for row in customers:
        for name in ("primary_rank", "secondary_rank"):
            if row.get(name) is not None and (type(row[name]) is not int or row[name] < 1):
                raise ValueError("INVALID_RANK")
    by_host, by_legal, customer_host_identities = {}, {}, {}
    for row in customers:
        host = official_host(row.get("official_domain"))
        if host:
            # Multiple customer rows at one host may be distinct operating entities.
            identity = (normalized_name(row.get("legal_name") or ""), row.get("country"))
            customer_host_identities.setdefault(host, set()).add(identity if identity[0] else row["local_id"])
    for row in public_entities:
        host = official_host(row.get("official_domain"))
        if host:
            by_host.setdefault(host, []).append(row)
        name = normalized_name(row.get("legal_name") or "")
        if name and row.get("country"):
            by_legal.setdefault((name, row["country"]), []).append(row)
    large = float("inf")
    ordered = sorted(customers, key=lambda r: (r.get("primary_rank") is None,
        r.get("primary_rank") or large, r.get("secondary_rank") or large,
        customer_ref(key, r["local_id"])))
    output = []
    for position, row in enumerate(ordered, 1):
        host = official_host(row.get("official_domain"))
        matches = by_host.get(host, []) if host else []
        basis = "EXACT_DOMAIN" if matches else "NONE"
        # Known conflicting countries are not safe auto-links, even at a shared host.
        conflict = len(customer_host_identities.get(host, set())) > 1 or any(
            row.get("country") and m.get("country") and row["country"] != m["country"] for m in matches)
        name = normalized_name(row.get("legal_name") or "")
        if not matches and name and row.get("country"):
            matches = by_legal.get((name, row["country"]), [])
            basis = "EXACT_LEGAL_NAME_COUNTRY" if matches else "NONE"
            conflict = conflict or any(host and official_host(m.get("official_domain")) and
                host != official_host(m.get("official_domain")) for m in matches)
        state = "AUTO_MATCHED" if len(matches) == 1 and not conflict else (
            "NEEDS_REVIEW" if matches else "NO_PUBLIC_MATCH")
        output.append({
            "schema": "customer_priority_overlay.v2", "customer_ref": customer_ref(key, row["local_id"]),
            "scan_order": position, "primary_rank": row.get("primary_rank"),
            "secondary_rank": row.get("secondary_rank"), "match_basis": basis, "review_state": state,
            "matched_public_entity_keys": sorted(m["public_entity_key"] for m in matches),
            "usage": "SCAN_ORDER_ONLY", "publication": "LOCAL_CONFIDENTIAL",
        })
    return output


def ordered_public_entities(entities: list[dict], overlay: list[dict]) -> list[dict]:
    """Reorder a copy; never mutate evidence, stages, scores or entity contents."""
    priority = {}
    for row in overlay:
        if row["review_state"] == "AUTO_MATCHED":
            for entity_key in row["matched_public_entity_keys"]:
                priority[entity_key] = min(priority.get(entity_key, float("inf")), row["scan_order"])
    return sorted((dict(e) for e in entities), key=lambda e: (
        priority.get(e["public_entity_key"], float("inf")), e["public_entity_key"]))


def domain_scan_order(entities: list[dict], overlay: list[dict]) -> list[dict]:
    """Only unambiguous matched public domains may change scan order."""
    by_key = {row["public_entity_key"]: row for row in entities}
    host_counts = {}
    for entity in entities:
        host = official_host(entity.get("official_domain"))
        if host:
            host_counts[host] = host_counts.get(host, 0) + 1
    order = {}
    for row in overlay:
        keys = row.get("matched_public_entity_keys", [])
        if row.get("review_state") != "AUTO_MATCHED" or len(keys) != 1:
            continue
        entity = by_key.get(keys[0])
        host = official_host(entity.get("official_domain")) if entity else ""
        rank = row.get("scan_order")
        if host and host_counts.get(host) == 1 and type(rank) is int and rank >= 1:
            order[host] = min(order.get(host, rank), rank)
    return [{"official_domain": host, "scan_order": rank, "review_state": "AUTO_MATCHED"}
            for host, rank in sorted(order.items(), key=lambda pair: (pair[1], pair[0]))]
