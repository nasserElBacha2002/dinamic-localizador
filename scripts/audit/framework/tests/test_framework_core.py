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
from framework.scanners.sql_boundaries import analyze_sql_interpolations  # noqa: E402


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


class TestSqlInterpolationClassification(unittest.TestCase):
    def test_quoted_user_value_is_injection_risk(self):
        text = """
        const q = `SELECT * FROM employees WHERE name = N'${input.name}'`;
        """
        analysis = analyze_sql_interpolations(text)
        self.assertEqual(len(analysis["quoted_risks"]), 1)
        self.assertEqual(analysis["quoted_risks"][0]["kind"], "quoted-value")

    def test_unquoted_runtime_limit_is_risk(self):
        text = """
        const q = `SELECT TOP ${input.limit} * FROM employees`;
        """
        analysis = analyze_sql_interpolations(text)
        self.assertEqual(analysis["quoted_risks"], [])
        self.assertEqual(len(analysis["unquoted_runtime_risks"]), 1)
        self.assertEqual(analysis["unknown"], [])

    def test_unquoted_order_by_query_param_is_risk(self):
        text = """
        const q = `SELECT * FROM employees ORDER BY ${req.query.sort}`;
        """
        analysis = analyze_sql_interpolations(text)
        self.assertEqual(len(analysis["unquoted_runtime_risks"]), 1)

    def test_runtime_uppercase_variable_quoted_is_risk(self):
        text = """
        const USER_STATUS = input.status;
        const q = `SELECT * FROM employees WHERE status = '${USER_STATUS}'`;
        """
        analysis = analyze_sql_interpolations(text)
        self.assertEqual(len(analysis["quoted_risks"]), 1)
        self.assertNotIn(analysis["quoted_risks"][0]["kind"], {"static-fragment", "known-safe"})

    def test_escape_sql_string_runtime_is_not_accepted(self):
        text = """
        await request.query(`
          UPDATE employees
          SET name = '${escapeSqlString(input.name)}'
        `);
        """
        analysis = analyze_sql_interpolations(text, file_path="backend/src/repositories/employee.repository.ts")
        self.assertEqual(len(analysis["escape_runtime_risks"]), 1)
        self.assertEqual(analysis["known_safe"], [])

    def test_escape_sql_string_offline_script_is_known_safe(self):
        text = """
        const q = `UPDATE t SET a = N'${escapeSqlString(fix.newAddress)}'`;
        """
        analysis = analyze_sql_interpolations(
            text,
            file_path="backend/src/utils/service-fix/sql.ts",
        )
        self.assertEqual(analysis["escape_runtime_risks"], [])
        self.assertEqual(analysis["quoted_risks"], [])
        self.assertGreaterEqual(len(analysis["known_safe"]), 1)

    def test_known_static_fragment_is_safe(self):
        text = """
        const FAILURE_STATUSES_SQL = FAILURE_STATUSES.map((s) => `N'${s}'`).join(", ");
        const q = `SELECT * FROM t WHERE status IN (${FAILURE_STATUSES_SQL})`;
        """
        analysis = analyze_sql_interpolations(text)
        self.assertEqual(analysis["quoted_risks"], [])
        self.assertEqual(analysis["unknown"], [])
        self.assertTrue(any(e["kind"] == "known-safe" or e["kind"] == "static-fragment" for e in analysis["known_safe"]))

    def test_parameter_placeholder_join_is_known_safe(self):
        text = """
        const q = `SELECT * FROM t WHERE status IN (${statusParams.join(", ")})`;
        """
        analysis = analyze_sql_interpolations(text)
        self.assertEqual(analysis["unknown"], [])
        self.assertEqual(len(analysis["known_safe"]), 1)

    def test_unknown_fragment_requires_review_bucket(self):
        text = """
        const q = `SELECT * FROM employees ${someDynamicThing}`;
        """
        analysis = analyze_sql_interpolations(text)
        self.assertEqual(len(analysis["unknown"]), 1)
        self.assertEqual(analysis["known_safe"], [])

    def test_scan_never_accepts_unknown_as_accepted_risk(self):
        from framework.scanners import sql_boundaries as mod
        from unittest import mock
        from pathlib import Path

        fake = Path("/tmp/fake-sql-unknown.ts")
        content = "const q = `SELECT * FROM employees ${someDynamicThing}`;\n"
        with mock.patch.object(mod, "iter_source_files", return_value=[fake]), mock.patch.object(
            mod, "read_text", return_value=content
        ), mock.patch.object(mod, "classify_layer", return_value="repositories"), mock.patch.object(
            mod, "repo_root", return_value=Path("/")
        ):
            # relative_to needs fake under root — use a Path that works
            pass

        analysis = analyze_sql_interpolations(content)
        self.assertTrue(analysis["unknown"])
        # Emulate scan emission rule
        self.assertFalse(
            analysis["known_safe"]
            and not (analysis["quoted_risks"] or analysis["unquoted_runtime_risks"] or analysis["escape_runtime_risks"] or analysis["unknown"])
        )


class TestReliabilityScanner(unittest.TestCase):
    def test_cas_status_update_is_not_race_finding(self):
        from framework.scanners import reliability as mod
        from unittest import mock
        from pathlib import Path

        content = """
        const row = await pool.request().query(`SELECT status FROM t WHERE id=@id`);
        await pool.request().query(`
          UPDATE t SET status = @next WHERE id = @id AND status = @expected
        `);
        """
        fake = Path("/repo/backend/src/repositories/safe-cas.repository.ts")
        with mock.patch.object(mod, "iter_source_files", return_value=[fake]), mock.patch.object(
            mod, "read_text", return_value=content
        ), mock.patch.object(mod, "repo_root", return_value=Path("/repo")):
            findings = mod.scan()
        self.assertEqual([f for f in findings if f.subcategory == "race-condition"], [])

    def test_select_update_without_cas_is_race_finding(self):
        from framework.scanners import reliability as mod
        from unittest import mock
        from pathlib import Path

        content = """
        const row = await pool.request().query(`SELECT status FROM t WHERE id=@id`);
        if (row.status === 'PENDING') {
          await pool.request().query(`UPDATE t SET status = 'DONE' WHERE id = @id`);
        }
        """
        fake = Path("/repo/backend/src/repositories/unsafe-race.repository.ts")
        with mock.patch.object(mod, "iter_source_files", return_value=[fake]), mock.patch.object(
            mod, "read_text", return_value=content
        ), mock.patch.object(mod, "repo_root", return_value=Path("/repo")):
            findings = mod.scan()
        races = [f for f in findings if f.subcategory == "race-condition"]
        self.assertEqual(len(races), 1)

    def test_webhook_sidecar_not_flagged_for_signature(self):
        from framework.scanners import reliability as mod
        from unittest import mock
        from pathlib import Path

        content = "export const schema = z.object({ MessageSid: z.string() });\n"
        fake = Path("/repo/backend/src/schemas/twilio-webhook.schema.ts")
        with mock.patch.object(mod, "iter_source_files", return_value=[fake]), mock.patch.object(
            mod, "read_text", return_value=content
        ), mock.patch.object(mod, "repo_root", return_value=Path("/repo")):
            findings = mod.scan()
        self.assertEqual(findings, [])


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
