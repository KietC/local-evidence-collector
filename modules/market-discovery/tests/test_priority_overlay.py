import unittest
from bridge.priority_overlay import build_priority_overlay, ordered_public_entities, domain_scan_order


class OverlayTests(unittest.TestCase):
    def setUp(self):
        self.key = bytes(range(32))
        self.entities = [
            {"public_entity_key": "alpha", "official_domain": "https://example.com", "legal_name": "Пример", "country": "US"},
            {"public_entity_key": "beta", "official_domain": "https://example.org", "legal_name": "示例公司", "country": "CN"},
        ]

    def test_primary_then_secondary_and_no_leak(self):
        customers = [
            {"local_id": "fixture-1", "official_domain": "www.example.com", "primary_rank": 2},
            {"local_id": "fixture-2", "legal_name": "示例公司", "country": "CN", "primary_rank": 1},
        ]
        result = build_priority_overlay(customers, self.entities, self.key)
        self.assertEqual(result[0]["matched_public_entity_keys"], ["beta"])
        self.assertNotIn("fixture-", str(result))
        self.assertNotIn("示例公司", str(result))
        self.assertEqual(ordered_public_entities(self.entities, result)[0]["public_entity_key"], "beta")

    def test_shared_domain_needs_review(self):
        other = dict(self.entities[0], public_entity_key="subsidiary")
        result = build_priority_overlay([{"local_id": "x", "official_domain": "example.com"}], self.entities + [other], self.key)
        self.assertEqual(result[0]["review_state"], "NEEDS_REVIEW")

    def test_country_conflict_needs_review(self):
        result = build_priority_overlay([{"local_id": "x", "official_domain": "example.com", "country": "CA"}], self.entities, self.key)
        self.assertEqual(result[0]["review_state"], "NEEDS_REVIEW")

    def test_empty_normalized_legal_name_cannot_match(self):
        rows = [{"public_entity_key": "blank", "legal_name": "  ", "country": "US"}]
        result = build_priority_overlay([{"local_id": "x", "legal_name": "\t ", "country": "US"}], rows, self.key)
        self.assertEqual(result[0]["review_state"], "NO_PUBLIC_MATCH")

    def test_conflicting_domain_blocks_legal_fallback(self):
        result = build_priority_overlay([{"local_id": "x", "legal_name": "Пример", "country": "US",
            "official_domain": "example.org"}], [self.entities[0]], self.key)
        self.assertEqual(result[0]["review_state"], "NEEDS_REVIEW")

    def test_multiple_customer_entities_sharing_domain(self):
        customers = [{"local_id": "a", "legal_name": "Alpha Group", "official_domain": "example.com"},
                     {"local_id": "b", "legal_name": "Beta Division", "official_domain": "example.com"}]
        results = build_priority_overlay(customers, self.entities, self.key)
        self.assertTrue(all(r["review_state"] == "NEEDS_REVIEW" for r in results))

    def test_no_name_only_match(self):
        result = build_priority_overlay([{"local_id": "x", "legal_name": "Пример"}], self.entities, self.key)
        self.assertEqual(result[0]["review_state"], "NO_PUBLIC_MATCH")

    def test_unknown_fields_rejected(self):
        with self.assertRaises(ValueError):
            build_priority_overlay([{"local_id": "x", "email_body": "synthetic"}], self.entities, self.key)

    def test_evidence_untouched(self):
        entities = [{"public_entity_key": "a", "trace_stage": "MF0", "score": 3},
                    {"public_entity_key": "b", "trace_stage": "MF1", "score": 9}]
        overlay = [{"review_state": "AUTO_MATCHED", "matched_public_entity_keys": ["b"], "scan_order": 1}]
        self.assertEqual(ordered_public_entities(entities, overlay), [entities[1], entities[0]])
        self.assertEqual(entities[0]["public_entity_key"], "a")

    def test_domain_scan_order_excludes_ambiguous_customer_match(self):
        shared = [dict(self.entities[0], public_entity_key="a"), dict(self.entities[0], public_entity_key="b")]
        overlay = build_priority_overlay([{"local_id": "synthetic", "official_domain": "example.com", "primary_rank": 1}], shared, self.key)
        self.assertEqual(overlay[0]["review_state"], "NEEDS_REVIEW")
        self.assertEqual(domain_scan_order(shared, overlay), [])

    def test_domain_scan_order_contains_no_private_id_or_name(self):
        overlay = build_priority_overlay([{"local_id": "synthetic-private-id", "official_domain": "www.example.com", "primary_rank": 1}], self.entities, self.key)
        result = domain_scan_order(self.entities, overlay)
        self.assertEqual(result, [{"official_domain": "example.com", "scan_order": 1, "review_state": "AUTO_MATCHED"}])
        self.assertNotIn("synthetic-private-id", str(result))

    def test_legal_match_does_not_prioritize_a_shared_public_domain(self):
        entities = [{"public_entity_key": "alpha", "legal_name": "Synthetic Alpha", "country": "GB", "official_domain": "example.com"},
                    {"public_entity_key": "beta", "legal_name": "Synthetic Beta", "country": "GB", "official_domain": "www.example.com"}]
        overlay = build_priority_overlay([{"local_id": "synthetic", "legal_name": "Synthetic Alpha", "country": "GB"}], entities, self.key)
        self.assertEqual(overlay[0]["review_state"], "AUTO_MATCHED")
        self.assertEqual(domain_scan_order(entities, overlay), [])


if __name__ == "__main__":
    unittest.main()
