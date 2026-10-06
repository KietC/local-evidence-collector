"""Synthetic fixtures only; the bridge never connects to a network or CRM."""
import copy
import csv
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import urlunsplit

from bridge import public_handoff as bridge


def record(key="registry:NL:synthetic-a"):
    reference = {"source_url": "https://example.com/about", "source_sha256": "ab" * 32,
                 "observed_at": "2026-01-01T00:00:00Z", "excerpt": "Synthetic company identity and product statement."}
    return {"schema": bridge.INPUT_SCHEMA, "public_entity_key": key, "company_name": "  Example   Company  ",
            "country_code": "nl", "official_website": "HTTPS://EXAMPLE.COM", "source_language": "NL-nl",
            "roles": ["manufacturer"], "products": ["water equipment"],
            "identity_evidence": {field: [copy.deepcopy(reference)] for field in ("company_name", "country_code", "official_website")},
            "role_evidence": {"manufacturer": [copy.deepcopy(reference)]},
            "product_evidence": {"water equipment": [copy.deepcopy(reference)]},
            "review_status": "approved_public", "reviewed_at": "2026-01-02T01:00:00+01:00"}


def save(root, rows):
    source = root / "synthetic_public.jsonl"
    source.write_text("\n".join(json.dumps(row, ensure_ascii=False) for row in rows) + "\n", encoding="utf-8")
    return source


class PublicHandoffTests(unittest.TestCase):
    def test_normalization_stable_identity_and_review_state(self):
        first = bridge.validate_record(record())
        second = bridge.validate_record(record())
        self.assertEqual(first["lead_id"], second["lead_id"])
        self.assertEqual(first["company_name"], "Example Company")
        self.assertEqual(first["country_code"], "NL")
        self.assertEqual(first["official_website"], "https://example.com/")
        self.assertEqual(first["source_language"], "nl-nl")
        self.assertIsNone(first["crm_binding"])
        self.assertEqual(first["handoff_state"], "review_required")

    def test_same_domain_different_entities_remain_separate_and_hashes_close(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = save(root, [record("registry:NL:synthetic-b"), record()])
            manifest = bridge.build(source, root / "result")
            self.assertEqual(manifest["output_records"], 2)
            self.assertEqual(manifest["input_sha256"], hashlib.sha256(source.read_bytes()).hexdigest())
            rows = [json.loads(line) for line in (root / "result/handoff.jsonl").read_text(encoding="utf-8").splitlines()]
            self.assertNotEqual(rows[0]["lead_id"], rows[1]["lead_id"])
            for artifact in manifest["artifacts"]:
                body = (root / "result" / artifact["path"]).read_bytes()
                self.assertEqual((len(body), hashlib.sha256(body).hexdigest()), (artifact["bytes"], artifact["sha256"]))

    def test_non_ascii_names_and_csv_formulas_are_preserved_safely(self):
        row = record()
        row["company_name"] = "=HYPERLINK(\"https://example.com\")"
        row["products"] = ["日本語 معدات المياه"]
        row["product_evidence"] = {row["products"][0]: row["role_evidence"]["manufacturer"]}
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            bridge.build(save(root, [row]), root / "result")
            rows = list(csv.DictReader(io.StringIO((root / "result/handoff.csv").read_text(encoding="utf-8-sig"))))
            self.assertTrue(rows[0]["company_name"].startswith("'="))
            self.assertEqual(rows[0]["products"], row["products"][0])
        for text in ("=cmd", "+cmd", "-cmd", "@cmd", "  =cmd", "\tcmd", "\rcmd", "\ncmd"):
            self.assertTrue(bridge.csv_safe(text).startswith("'"))

    def test_unknown_fields_are_rejected_at_every_level(self):
        for extra in ("crm_binding", "company_id", "contacts", "customer_export", "cookie"):
            row = record()
            row[extra] = "synthetic"
            with self.subTest(extra=extra), self.assertRaisesRegex(bridge.HandoffError, "SCHEMA_FIELDS_INVALID"):
                bridge.validate_record(row)
        row = record()
        row["role_evidence"]["manufacturer"][0]["unexpected"] = "synthetic"
        with self.assertRaisesRegex(bridge.HandoffError, "SCHEMA_FIELDS_INVALID"):
            bridge.validate_record(row)

    def test_identity_role_product_evidence_is_mandatory(self):
        for group, key in (("identity_evidence", "company_name"), ("identity_evidence", "country_code"),
                           ("identity_evidence", "official_website"), ("role_evidence", "manufacturer"),
                           ("product_evidence", "water equipment")):
            row = record()
            row[group][key] = []
            with self.subTest(group=group, key=key), self.assertRaisesRegex(bridge.HandoffError, "EVIDENCE_REQUIRED"):
                bridge.validate_record(row)

    def test_private_urls_and_url_credentials_are_rejected(self):
        urls = ("http://127.0.0.1/", "http://10.0.0.1/", "http://[::1]/", "http://localhost/",
                "http://service.internal/", "http://metadata.google.internal/", "file:///synthetic",
                urlunsplit(("https", "name:pass@example.com", "/", "", "")), "https://example.com/?access_token=synthetic",
                "https://example.com/?X-Amz-Credential=synthetic", "http://2130706433/",
                "http://127.1/", "https://example.com/#fragment", "https://example.com:3211/",
                "http://office.lan/", "http://router.home.arpa/", "http://[2606:4700:4700::1111%25eth0]/")
        for url in urls:
            with self.subTest(url=url), self.assertRaises(bridge.HandoffError):
                bridge.public_url(url)

    def test_invalid_hash_timestamp_identity_and_review_fail(self):
        for key, value in (("review_status", "unreviewed"), ("reviewed_at", "2026-01-02"),
                           ("public_entity_key", ""), ("country_code", "ZZ"), ("roles", [])):
            row = record()
            row[key] = value
            with self.subTest(key=key), self.assertRaises(bridge.HandoffError):
                bridge.validate_record(row)
        for field, value in (("source_sha256", "short"), ("observed_at", "2027-01-01T00:00:00Z"), ("excerpt", "")):
            row = record()
            row["role_evidence"]["manufacturer"][0][field] = value
            with self.subTest(field=field), self.assertRaises(bridge.HandoffError):
                bridge.validate_record(row)

    def test_credential_query_aliases_are_normalized_before_rejection(self):
        aliases = ("accessToken", "client_secret", "sig", "Access-Token", "CLIENT_SECRET", "clientSecret",
                   "refresh_token", "idToken", "apiKey", "api-key", "api_token", "authToken", "client_assertion",
                   "shared_secret", "secretKey", "sessionToken", "JSESSIONID", "PHPSESSID", "x-api-key",
                   "AWSAccessKeyId", "OSSAccessKeyId", "key-pair-id", "x_amz_credential", "xGoogSignature",
                   "x_oss_security_token", "%61ccessToken")
        for key in aliases:
            with self.subTest(key=key), self.assertRaisesRegex(bridge.HandoffError, "CREDENTIAL_QUERY_FORBIDDEN"):
                bridge.public_url(f"https://example.com/about?{key}=synthetic")
        self.assertEqual(bridge.public_url("https://example.com/products?lang=en&category=water"),
                         "https://example.com/products?lang=en&category=water")

    def test_duplicate_identity_refuses_output_without_merging(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with self.assertRaisesRegex(bridge.HandoffError, "DUPLICATE_ENTITY_KEY"):
                bridge.build(save(root, [record(), record()]), root / "result")
            self.assertFalse((root / "result").exists())

    def test_duplicate_json_key_and_nonfinite_values_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "synthetic.jsonl"
            source.write_text('{"schema":"a","schema":"b"}\n', encoding="utf-8")
            with self.assertRaisesRegex(bridge.HandoffError, "DUPLICATE_JSON_KEY"):
                bridge.build(source, root / "result")
            row = record()
            row["country_code"] = float("nan")
            with self.assertRaises(bridge.HandoffError):
                bridge.build(save(root, [row]), root / "result")

    def test_private_input_path_is_rejected_before_open(self):
        with patch.object(Path, "open", side_effect=AssertionError("must not read")):
            with self.assertRaisesRegex(bridge.HandoffError, "PRIVATE_INPUT_PATH_FORBIDDEN"):
                bridge.build(Path(tempfile.gettempdir()) / "cases" / "synthetic.jsonl", Path(tempfile.gettempdir()) / "synthetic_result")

    def test_output_must_be_new_and_outside_source(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = save(root, [record()])
            with self.assertRaisesRegex(bridge.HandoffError, "OUTPUT_MUST_BE_OUTSIDE_SOURCE"):
                bridge.build(source, bridge.SOURCE_ROOT / "synthetic_result")
            (root / "result").mkdir()
            with self.assertRaisesRegex(bridge.HandoffError, "OUTPUT_REQUIRES_NEW_DIRECTORY"):
                bridge.build(source, root / "result")

    def test_size_limit_checked_before_input_read(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = save(root, [record()])
            with patch.object(bridge, "MAX_BYTES", 1), self.assertRaisesRegex(bridge.HandoffError, "INPUT_SIZE_LIMIT"):
                bridge.build(source, root / "result")

    def test_symlink_input_and_output_parent_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = save(root, [record()])
            try:
                (root / "alias.jsonl").symlink_to(source)
                (root / "alias_dir").symlink_to(root, target_is_directory=True)
            except OSError:
                self.skipTest("Host cannot create a synthetic symlink")
            with self.assertRaisesRegex(bridge.HandoffError, "REPARSE_PATH_FORBIDDEN"):
                bridge.build(root / "alias.jsonl", root / "result")
            with self.assertRaisesRegex(bridge.HandoffError, "REPARSE_PATH_FORBIDDEN"):
                bridge.build(source, root / "alias_dir" / "result")

    def test_cli_runs_offline_and_is_repeat_safe(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = save(root, [record()])
            command = [sys.executable, "-B", "-m", "bridge.public_handoff", "--input", str(source), "--output", str(root / "result")]
            result = subprocess.run(command, cwd=bridge.SOURCE_ROOT, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout)["status"], "REVIEW_REQUIRED")
            again = subprocess.run(command, cwd=bridge.SOURCE_ROOT, capture_output=True, text=True)
            self.assertEqual(again.returncode, 2)
            self.assertNotIn(str(source), again.stderr)


if __name__ == "__main__":
    unittest.main()
