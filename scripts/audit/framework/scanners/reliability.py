"""Reliability heuristics: webhooks, workers, check-then-act."""

from __future__ import annotations

import re

from ..config import repo_root
from ..models import AuditFinding
from ..utils import iter_source_files, read_text, stable_id

SELECT_STATUS = re.compile(r"SELECT[\s\S]{0,200}\bstatus\b", re.I)
UPDATE_STATUS = re.compile(r"UPDATE[\s\S]{0,120}\bstatus\b", re.I)
TRANSACTION = re.compile(r"\b(beginTransaction|transaction\(|withTransaction|BEGIN\s+TRAN)\b", re.I)
IDEMPOTENCY = re.compile(r"\b(idempoten|MessageSid|provider_message_sid|dedup|alreadyProcessed)\b", re.I)
SIGNATURE = re.compile(r"\b(validateRequest|X-Twilio-Signature|twilio.*signature)\b", re.I)


def scan() -> list[AuditFinding]:
    root = repo_root()
    roots = [root / "backend" / "src"]
    findings: list[AuditFinding] = []

    for path in iter_source_files(roots):
        rel = path.relative_to(root).as_posix()
        text = read_text(path)
        lower_rel = rel.lower()

        is_webhook = "webhook" in lower_rel or "twilio" in lower_rel
        is_worker = "/workers/" in rel or "worker" in path.name.lower()

        if is_webhook:
            if not SIGNATURE.search(text):
                findings.append(
                    AuditFinding(
                        id=stable_id("rel-sig", rel),
                        category="reliability",
                        subcategory="webhook-signature",
                        severity="high",
                        confidence="low",
                        status="requires-review",
                        title="Webhook module may lack signature validation markers",
                        description="File looks webhook-related but no signature helper tokens found in-file.",
                        file=rel,
                        recommendation="Ensure Twilio (or provider) signature validation runs before side effects.",
                        blocking=False,
                    )
                )
            if not IDEMPOTENCY.search(text):
                findings.append(
                    AuditFinding(
                        id=stable_id("rel-idem", rel),
                        category="reliability",
                        subcategory="webhook-idempotency",
                        severity="medium",
                        confidence="low",
                        status="requires-review",
                        title="Webhook module may lack idempotency markers",
                        description="No MessageSid/dedup tokens observed in this file.",
                        file=rel,
                        recommendation="Deduplicate by provider event/message id inside a transaction.",
                        blocking=False,
                    )
                )

        if is_worker and not re.search(r"\b(lease|lock|FOR UPDATE|claim|skipLocked)\b", text, re.I):
            findings.append(
                AuditFinding(
                    id=stable_id("rel-lease", rel),
                    category="reliability",
                    subcategory="worker-lease",
                    severity="medium",
                    confidence="low",
                    status="suspected",
                    title="Worker without obvious lease/lock pattern",
                    description="Worker file lacks lease/lock/claim tokens — verify distributed safety.",
                    file=rel,
                    recommendation="Use claim with lease/timeout and poison-message handling.",
                    blocking=False,
                )
            )

        # check-then-act race candidate
        if SELECT_STATUS.search(text) and UPDATE_STATUS.search(text) and not TRANSACTION.search(text):
            findings.append(
                AuditFinding(
                    id=stable_id("rel-race", rel),
                    category="reliability",
                    subcategory="race-condition",
                    severity="high",
                    confidence="low",
                    status="suspected",
                    title="Possible check-then-act without transaction markers",
                    description="File contains SELECT/UPDATE status patterns without beginTransaction/withTransaction tokens.",
                    file=rel,
                    recommendation="Wrap state transitions in transactions or optimistic concurrency.",
                    blocking=False,
                )
            )

    return findings
