"""Validate one public JSONL input and create an exclusive offline review handoff.

This proposed bridge does not import into, read from, or contact a CRM.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import ipaddress
import json
import re
import stat
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qsl, urlsplit, urlunsplit
from .runtime_paths import validate_location, runtime_child

INPUT_SCHEMA = "market_discovery.public_review.v1"
OUTPUT_SCHEMA = "market_discovery.public_handoff.v1"
SOURCE_ROOT = Path(__file__).resolve().parents[1]
MAX_BYTES, MAX_ROWS = 10 * 1024 * 1024, 10000
FIELDS = frozenset(("schema", "public_entity_key", "company_name", "country_code",
                    "official_website", "source_language", "roles", "products",
                    "identity_evidence", "role_evidence", "product_evidence",
                    "review_status", "reviewed_at"))
EVIDENCE_FIELDS = frozenset(("source_url", "source_sha256", "observed_at", "excerpt"))
ROLES = frozenset(("manufacturer", "distributor", "dealer", "importer", "exporter", "service_provider"))
PRIVATE_DIRS = frozenset(("cases", "training_runs", "runtime", "raw", "mail", "emails",
                          "customer_exports", "browser", "profiles", "cookies", "deliveries"))
SECRET_QUERY = frozenset(("token", "accesstoken", "refreshtoken", "idtoken", "bearer", "authorization",
                         "auth", "apikey", "apitoken", "authtoken", "oauthtoken", "oauthcode", "authorizationcode",
                         "clientsecret", "clientassertion", "assertion", "signature", "sig", "password", "passwd",
                         "pwd", "secret", "secretkey", "sharedsecret", "key", "session", "sessionid", "sessiontoken",
                         "jsessionid", "phpsessid", "securitytoken", "credential", "credentials", "xapikey",
                         "xauthtoken", "xaccesstoken", "awsaccesskeyid", "ossaccesskeyid", "googleaccessid", "keypairid"))
COUNTRIES = frozenset("AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split())


class HandoffError(ValueError):
    """Content-free validation failure, safe for command-line diagnostics."""


def fail(code: str) -> None:
    raise HandoffError(code)


def text(value: object, limit: int = 500) -> str:
    if not isinstance(value, str):
        fail("TEXT_REQUIRED")
    value = " ".join(unicodedata.normalize("NFKC", value).split())
    if not value or len(value) > limit or any(unicodedata.category(c) == "Cc" for c in value):
        fail("TEXT_INVALID")
    return value


def exact_fields(value: object, expected: frozenset | set) -> dict:
    if not isinstance(value, dict) or set(value) != expected:
        fail("SCHEMA_FIELDS_INVALID")
    return value


def timestamp(value: object) -> str:
    value = text(value, 40)
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})", value):
        fail("TIMESTAMP_TIMEZONE_REQUIRED")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    except ValueError:
        fail("TIMESTAMP_INVALID")


def public_url(value: object) -> str:
    value = text(value, 2048)
    if any(c.isspace() for c in value) or "\\" in value:
        fail("URL_INVALID")
    try:
        parsed = urlsplit(value)
        host = (parsed.hostname or "").encode("idna").decode("ascii").lower().rstrip(".")
        port = parsed.port
    except (ValueError, UnicodeError):
        fail("URL_INVALID")
    if parsed.scheme not in {"http", "https"} or not host or "%" in host or len(host) > 253 or parsed.username is not None or parsed.password is not None:
        fail("PUBLIC_HTTP_URL_REQUIRED")
    if parsed.fragment or port not in {None, 80, 443}:
        fail("URL_FRAGMENT_OR_PORT_FORBIDDEN")
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        if "." not in host or host.endswith((".localhost", ".local", ".internal", ".invalid", ".test", ".example", ".onion",
                                              ".lan", ".home", ".corp", ".intranet", ".localdomain", ".arpa")):
            fail("PUBLIC_HOST_REQUIRED")
        if not all(re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label) for label in host.split(".")):
            fail("PUBLIC_HOST_REQUIRED")
        if host.split(".")[-1].isdigit():
            fail("PUBLIC_HOST_REQUIRED")
    else:
        if not address.is_global:
            fail("PUBLIC_HOST_REQUIRED")
    keys = {re.sub(r"[-_]", "", key.casefold()) for key, _ in parse_qsl(parsed.query, keep_blank_values=True)}
    if keys & SECRET_QUERY or any(k.startswith(("xamz", "xgoog", "xoss")) for k in keys):
        fail("CREDENTIAL_QUERY_FORBIDDEN")
    authority = f"[{host}]" if ":" in host else host
    if port is not None and port != (443 if parsed.scheme == "https" else 80):
        authority += f":{port}"
    return urlunsplit((parsed.scheme, authority, parsed.path or "/", parsed.query, ""))


def evidence(value: object, reviewed_at: str) -> list[dict]:
    if not isinstance(value, list) or not 1 <= len(value) <= 20:
        fail("EVIDENCE_REQUIRED")
    result = []
    for item in value:
        item = exact_fields(item, EVIDENCE_FIELDS)
        digest = item["source_sha256"]
        if not isinstance(digest, str) or not re.fullmatch("[0-9a-fA-F]{64}", digest):
            fail("SHA256_INVALID")
        observed = timestamp(item["observed_at"])
        if datetime.fromisoformat(observed.replace("Z", "+00:00")) > datetime.fromisoformat(reviewed_at.replace("Z", "+00:00")):
            fail("EVIDENCE_AFTER_REVIEW")
        result.append({"source_url": public_url(item["source_url"]), "source_sha256": digest.lower(),
                       "observed_at": observed, "excerpt": text(item["excerpt"], 2000)})
    return result


def string_list(value: object, allowed: frozenset | None = None) -> list[str]:
    if not isinstance(value, list) or not 1 <= len(value) <= 50:
        fail("NONEMPTY_LIST_REQUIRED")
    result = [text(item, 120) for item in value]
    if len(set(result)) != len(result) or (allowed is not None and not set(result) <= allowed):
        fail("LIST_INVALID")
    return result


def validate_record(value: object) -> dict:
    row = exact_fields(value, FIELDS)
    if row["schema"] != INPUT_SCHEMA or row["review_status"] != "approved_public":
        fail("APPROVED_PUBLIC_INPUT_REQUIRED")
    key = row["public_entity_key"]
    if not isinstance(key, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]{2,159}", key):
        fail("EXPLICIT_ENTITY_KEY_REQUIRED")
    country = text(row["country_code"], 2).upper()
    if country not in COUNTRIES:
        fail("COUNTRY_INVALID")
    language = text(row["source_language"], 35).lower()
    if not re.fullmatch(r"[a-z]{2,3}(?:-[a-z0-9]{2,8})*", language):
        fail("LANGUAGE_INVALID")
    reviewed = timestamp(row["reviewed_at"])
    roles, products = string_list(row["roles"], ROLES), string_list(row["products"])
    identity = exact_fields(row["identity_evidence"], {"company_name", "country_code", "official_website"})
    role_refs = exact_fields(row["role_evidence"], set(roles))
    product_refs = exact_fields(row["product_evidence"], set(products))
    return {"schema": OUTPUT_SCHEMA, "lead_id": hashlib.sha256((OUTPUT_SCHEMA + "\0" + key).encode()).hexdigest(),
            "public_entity_key": key, "company_name": text(row["company_name"]), "country_code": country,
            "official_website": public_url(row["official_website"]), "source_language": language,
            "roles": roles, "products": products,
            "identity_evidence": {k: evidence(v, reviewed) for k, v in identity.items()},
            "role_evidence": {k: evidence(v, reviewed) for k, v in role_refs.items()},
            "product_evidence": {k: evidence(v, reviewed) for k, v in product_refs.items()},
            "public_reviewed_at": reviewed, "handoff_state": "review_required", "crm_binding": None}


def pairs_object(pairs: list[tuple]) -> dict:
    result = {}
    for key, value in pairs:
        if key in result:
            fail("DUPLICATE_JSON_KEY")
        result[key] = value
    return result


def checked_path(path: Path, input_file: bool = False, runtime_root: Path | None = None) -> Path:
    path = path.absolute()
    parts = path.parts
    if runtime_root is not None:
        try:
            path = runtime_child(runtime_root, path)
            parts = path.relative_to(runtime_root.resolve()).parts
        except ValueError:
            fail("PATH_OUTSIDE_RUNTIME")
    if input_file and any(part.casefold() in PRIVATE_DIRS for part in parts):
        fail("PRIVATE_INPUT_PATH_FORBIDDEN")
    for ancestor in [path, *path.parents]:
        if ancestor.exists() or ancestor.is_symlink():
            info = ancestor.lstat()
            if stat.S_ISLNK(info.st_mode) or getattr(info, "st_file_attributes", 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT:
                fail("REPARSE_PATH_FORBIDDEN")
    path = path.resolve()
    if input_file and (not path.is_file() or path.suffix.lower() != ".jsonl"):
        fail("EXPLICIT_JSONL_FILE_REQUIRED")
    return path


def csv_safe(value: object) -> str:
    result = str(value)
    return "'" + result if result.lstrip().startswith(("=", "+", "-", "@")) or result.startswith(("\t", "\r", "\n")) else result


def encode_json(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")


def build(input_path: Path, output_dir: Path, runtime_root: Path | None = None, synthetic_only: bool = False) -> dict:
    source = checked_path(input_path, input_file=True, runtime_root=runtime_root)
    destination = checked_path(output_dir, runtime_root=runtime_root)
    if destination == SOURCE_ROOT or SOURCE_ROOT in destination.parents:
        fail("OUTPUT_MUST_BE_OUTSIDE_SOURCE")
    try:
        validate_location(destination)
    except ValueError:
        fail("OUTPUT_MUST_BE_OUTSIDE_SOURCE")
    if destination.exists() or not destination.parent.is_dir():
        fail("OUTPUT_REQUIRES_NEW_DIRECTORY_EXISTING_PARENT")
    if source.stat().st_size > MAX_BYTES:
        fail("INPUT_SIZE_LIMIT")
    with source.open("rb") as handle:
        raw = handle.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        fail("INPUT_SIZE_LIMIT")
    try:
        lines = raw.decode("utf-8-sig").splitlines()
    except UnicodeError:
        fail("UTF8_REQUIRED")
    if not 1 <= len(lines) <= MAX_ROWS or any(not line.strip() for line in lines):
        fail("INPUT_ROWS_INVALID")
    records, keys = [], set()
    for line in lines:
        try:
            value = json.loads(line, object_pairs_hook=pairs_object)
        except json.JSONDecodeError:
            fail("JSON_INVALID")
        row = validate_record(value)
        if synthetic_only:
            row["synthetic_only"] = True
            row["handoff_state"] = "synthetic_fixture_only"
        if row["public_entity_key"] in keys:
            fail("DUPLICATE_ENTITY_KEY")
        keys.add(row["public_entity_key"])
        records.append(row)
    records.sort(key=lambda row: row["public_entity_key"])
    fields = ("lead_id", "public_entity_key", "company_name", "country_code", "official_website", "source_language", "roles", "products", "handoff_state")
    csv_buffer = io.StringIO(newline="")
    writer = csv.writer(csv_buffer, lineterminator="\n")
    writer.writerow(fields)
    for row in records:
        writer.writerow([csv_safe("; ".join(row[key]) if isinstance(row[key], list) else row[key]) for key in fields])
    payloads = {"handoff.jsonl": b"".join(encode_json(row) for row in records),
                "handoff.csv": csv_buffer.getvalue().encode("utf-8-sig")}
    manifest = {"schema": "market_discovery.handoff_manifest.v1", "status": "REVIEW_REQUIRED",
                "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "input_sha256": hashlib.sha256(raw).hexdigest(), "input_bytes": len(raw),
                "input_records": len(records), "output_records": len(records), "network_used": False,
                "synthetic_only": synthetic_only,
                "crm_read": False, "crm_write": False,
                "artifacts": [{"path": name, "bytes": len(body), "sha256": hashlib.sha256(body).hexdigest()}
                              for name, body in payloads.items()]}
    destination.mkdir(exist_ok=False)
    for name, body in {**payloads, "manifest.json": encode_json(manifest)}.items():
        with (destination / name).open("xb") as handle:
            handle.write(body)
    return manifest


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--root", type=Path, help="Optional explicit runtime boundary for integrated use")
    parser.add_argument("--synthetic-fixture", action="store_true", help="Label invented test fixtures; never a production approval")
    args = parser.parse_args(argv)
    try:
        result = build(args.input, args.output, runtime_root=args.root, synthetic_only=args.synthetic_fixture)
    except (HandoffError, OSError) as exc:
        print(json.dumps({"status": "FAIL", "error": str(exc) if isinstance(exc, HandoffError) else "FILESYSTEM_ERROR"}), file=sys.stderr)
        return 2
    print(json.dumps({"status": result["status"], "records": result["output_records"], "network_used": False, "crm_write": False}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
