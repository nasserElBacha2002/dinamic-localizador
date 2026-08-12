"""Reliability heuristics: webhooks, workers, check-then-act, CAS/lease awareness."""

from __future__ import annotations

import re

from ..config import repo_root
from ..models import AuditFinding
from ..utils import iter_source_files, read_text, stable_id

SELECT_STATUS = re.compile(r"SELECT[\s\S]{0,200}\bstatus\b", re.I)
UPDATE_STATUS = re.compile(r"UPDATE[\s\S]{0,120}\bstatus\b", re.I)
TRANSACTION = re.compile(
    r"\b(beginTransaction|transaction\(|withTransaction|BEGIN\s+TRAN|sql\.Transaction)\b",
    re.I,
)
# Atomic compare-and-set / conditional status writes (not mere SELECT+UPDATE).
CAS_PROTECTION = re.compile(
    r"("
    r"AND\s+status\s*=\s*[N'@]|"
    r"AND\s+status\s+IN\s*\(|"
    r"AND\s+confirmation_status\s*(?:=|IN\s*\()|"
    r"onlyIfStatusIn|"
    r"OUTPUT\s+INSERTED|"
    r"UPDLOCK|"
    r"HOLDLOCK|"
    r"READPAST|"
    r"rowsAffected|"
    r"schedule_version\s*=\s*@"
    r")",
    re.I,
)
IDEMPOTENCY = re.compile(
    r"\b(idempoten|MessageSid|provider_message_sid|provider_event_key|dedup|alreadyProcessed|claimInbound)\b",
    re.I,
)
SIGNATURE = re.compile(r"\b(validateRequest|X-Twilio-Signature|twilio.*signature|runTwilioSignatureValidation)\b", re.I)
LEASE_CLAIM = re.compile(
    r"\b(lease_owner|lease_expires_at|UPDLOCK|READPAST|claimNext|claimNotification|processing_owner|deletion_lease)\b",
    re.I,
)

# Files that mention Twilio/webhook but are not the signature enforcement point.
WEBHOOK_SIDE_CAR = re.compile(
    r"("
    r"schema\.ts$|"
    r"types/|"
    r"error-classifier|"
    r"form-body|"
    r"media-url|"
    r"webhook-signature\.ts$|"
    r"verify-twilio|"
    r"validate-twilio|"
    r"outbound\.service|"
    r"routes/twilio|"
    r"webhook-event\.repository|"
    r"/repositories/"
    r")",
    re.I,
)


def scan() -> list[AuditFinding]:
    root = repo_root()
    roots = [root / "backend" / "src"]
    findings: list[AuditFinding] = []

    for path in iter_source_files(roots):
        rel = path.relative_to(root).as_posix()
        text = read_text(path)
        lower_rel = rel.lower()

        is_webhook = "webhook" in lower_rel or "twilio" in lower_rel
        is_worker = (
            "/workers/" in rel
            or path.name.lower().endswith(".worker.ts")
            or path.name.lower().endswith("-worker.ts")
            or "/jobs/" in rel and "worker" in path.name.lower()
        )
        # Config-only "worker" files are not claim loops.
        is_worker_config = "env-rules" in lower_rel or lower_rel.endswith("/config/env.ts")

        if is_webhook and not WEBHOOK_SIDE_CAR.search(rel):
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

        if is_worker and not is_worker_config and not LEASE_CLAIM.search(text):
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

        # check-then-act race candidate — skip when CAS/lock/transaction markers are present.
        if (
            SELECT_STATUS.search(text)
            and UPDATE_STATUS.search(text)
            and not TRANSACTION.search(text)
            and not CAS_PROTECTION.search(text)
        ):
            findings.append(
                AuditFinding(
                    id=stable_id("rel-race", rel),
                    category="reliability",
                    subcategory="race-condition",
                    severity="high",
                    confidence="low",
                    status="suspected",
                    title="Possible check-then-act without transaction markers",
                    description=(
                        "File contains SELECT/UPDATE status patterns without beginTransaction/"
                        "withTransaction, CAS (AND status=), UPDLOCK, or onlyIfStatusIn markers."
                    ),
                    file=rel,
                    recommendation="Wrap state transitions in transactions or optimistic/CAS concurrency.",
                    blocking=False,
                )
            )

    return findings
