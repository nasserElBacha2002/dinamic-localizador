"""Unit tests for audit framework core logic."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

AUDIT_SCRIPTS = Path(__file__).resolve().parents[2]
if str(AUDIT_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(AUDIT_SCRIPTS))

from framework.baseline import compare_findings  # noqa: E402
from framework.gate import evaluate_gate, should_block  # noqa: E402
from framework.models import AuditFinding  # noqa: E402
from framework.runner import dedupe  # noqa: E402
from framework.scanners.god_class import score_file  # noqa: E402


def _finding(**kwargs) -> AuditFinding:
    base = dict(
        id="f1",
        category="security",
        subcategory="test",
        severity="high",
        confidence="high",
        status="detected",
        title="t",
        description="d",
        file="backend/src/a.ts",
        blocking=False,
    )
    base.update(kwargs)
    return AuditFinding(**base)  # type: ignore[arg-type]


class TestGodClassScore(unittest.TestCase):
    def test_small_file_ok(self):
        thresholds = {
            "god_class": {
                "loc_watch": 600,
                "loc_high": 1000,
                "methods_high": 20,
                "deps_high": 10,
                "imports_high": 8,
                "complex_methods_high": 8,
                "score_ok": 5,
                "score_watch": 10,
                "score_medium": 16,
                "score_high": 22,
            }
        }
        text = "export function hello() { return 1; }\n"
        score, evidence, band = score_file("backend/src/services/tiny.service.ts", text, thresholds)
        self.assertEqual(band, "OK")
        self.assertLessEqual(score, 5)
        self.assertIn("loc", evidence)

    def test_large_multi_domain_scores_high(self):
        thresholds = {
            "god_class": {
                "loc_watch": 50,
                "loc_high": 80,
                "methods_high": 5,
                "deps_high": 2,
                "imports_high": 2,
                "complex_methods_high": 2,
                "score_ok": 5,
                "score_watch": 8,
                "score_medium": 12,
                "score_high": 16,
            }
        }
        methods = "\n".join([f"  async method{i}() {{ if (a) {{ if (b) {{ return {i}; }} }} }}" for i in range(12)])
        imports = "\n".join([f"import {{ x{i} }} from './mod{i}';" for i in range(10)])
        text = f"""
{imports}
import twilio from 'twilio';
export class MegaService {{
  constructor(a, b, c, d) {{}}
{methods}
  run() {{
    const q = 'SELECT * FROM employees';
    // attendance employee payroll whatsapp inventory assignment store
  }}
}}
""" + ("// pad\n" * 100)
        score, evidence, band = score_file("backend/src/services/mega.service.ts", text, thresholds)
        self.assertGreaterEqual(score, 12)
        self.assertIn(band, {"MEDIUM", "HIGH", "CRITICAL"})


class TestGate(unittest.TestCase):
    def test_suspected_critical_does_not_block(self):
        f = _finding(severity="critical", confidence="high", status="requires-review", category="architecture")
        self.assertFalse(should_block(f))

    def test_detected_critical_security_blocks(self):
        f = _finding(severity="critical", confidence="high", status="detected", category="security")
        self.assertTrue(should_block(f))

    def test_explicit_blocking_flag(self):
        f = _finding(severity="low", confidence="low", status="suspected", blocking=True)
        self.assertTrue(should_block(f))

    def test_evaluate_gate_counts(self):
        findings = [
            _finding(id="a", status="requires-review", severity="critical"),
            _finding(id="b", status="detected", severity="critical", confidence="high", category="security"),
        ]
        result = evaluate_gate(findings)
        self.assertFalse(result["passed"])
        self.assertEqual(result["blocking_count"], 1)


class TestBaselineAndDedupe(unittest.TestCase):
    def test_dedupe_keeps_higher_severity(self):
        a = _finding(id="1", severity="low", title="same")
        b = _finding(id="2", severity="high", title="same")
        out = dedupe([a, b])
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0].severity, "high")

    def test_baseline_new_and_resolved(self):
        prev = [_finding(id="old", title="old-title", file="a.ts")]
        cur = [_finding(id="new", title="new-title", file="b.ts")]
        diff = compare_findings(cur, prev)
        self.assertEqual(diff["counts"]["new"], 1)
        self.assertEqual(diff["counts"]["resolved"], 1)


if __name__ == "__main__":
    unittest.main()
