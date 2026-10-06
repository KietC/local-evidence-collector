import json
import os
from pathlib import Path
import secrets
import tempfile
import unittest
from unittest.mock import patch

from bridge.priority_cli import run


class PriorityCliTests(unittest.TestCase):
    def fixture(self, root):
        (root / "inputs").mkdir()
        (root / "inputs/customer_projection.jsonl").write_text(json.dumps({"local_id": "synthetic-secret-id", "official_domain": "example.com", "primary_rank": 1}) + "\n", encoding="utf-8")
        (root / "inputs/public_entities.jsonl").write_text(json.dumps({"public_entity_key": "synthetic-public", "official_domain": "example.com"}) + "\n", encoding="utf-8")

    def test_missing_key_is_rejected_before_input_read(self):
        with tempfile.TemporaryDirectory() as temporary, patch.dict(os.environ, {"MARKET_DISCOVERY_HMAC_KEY": ""}):
            with self.assertRaisesRegex(ValueError, "LOCAL_HMAC_KEY_REQUIRED"):
                run(Path(temporary), "fixture", "inputs/absent.jsonl", "inputs/absent.jsonl")

    def test_local_overlay_is_exclusive_and_confidential(self):
        with tempfile.TemporaryDirectory() as temporary, patch.dict(os.environ, {"MARKET_DISCOVERY_HMAC_KEY": secrets.token_hex(32)}):
            root = Path(temporary)
            self.fixture(root)
            result = run(root, "fixture", "inputs/customer_projection.jsonl", "inputs/public_entities.jsonl")
            self.assertEqual(result["matched"], 1)
            output = root / "private/priority/fixture/priority_overlay.jsonl"
            content = output.read_text(encoding="utf-8")
            self.assertNotIn("synthetic-secret-id", content)
            self.assertEqual(json.loads(content)["publication"], "LOCAL_CONFIDENTIAL")
            with self.assertRaises(FileExistsError):
                run(root, "fixture", "inputs/customer_projection.jsonl", "inputs/public_entities.jsonl")
            self.assertEqual(output.read_text(encoding="utf-8"), content)

    def test_projection_cannot_escape_explicit_runtime(self):
        with tempfile.TemporaryDirectory() as temporary, patch.dict(os.environ, {"MARKET_DISCOVERY_HMAC_KEY": secrets.token_hex(32)}):
            root = Path(temporary)
            with self.assertRaisesRegex(ValueError, "PATH_OUTSIDE_RUNTIME"):
                run(root, "fixture", "../outside.jsonl", "inputs/public_entities.jsonl")


if __name__ == "__main__":
    unittest.main()
