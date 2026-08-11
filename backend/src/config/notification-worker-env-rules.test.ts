import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { requireContentSidWhenWorkerEnabled } from "./notification-worker-env-rules";

describe("requireContentSidWhenWorkerEnabled", () => {
  it("allows worker disabled with missing SID", () => {
    const result = requireContentSidWhenWorkerEnabled(
      { workerEnabled: false, contentSid: undefined },
      "TWILIO_PAYROLL_RECEIPT_AVAILABLE_CONTENT_SID",
      "PAYROLL_RECEIPT_NOTIFICATION_WORKER_ENABLED",
    );
    assert.equal(result.ok, true);
  });

  it("allows worker enabled with non-empty SID", () => {
    const result = requireContentSidWhenWorkerEnabled(
      { workerEnabled: true, contentSid: "HX_TEST" },
      "TWILIO_PAYROLL_RECEIPT_AVAILABLE_CONTENT_SID",
      "PAYROLL_RECEIPT_NOTIFICATION_WORKER_ENABLED",
    );
    assert.equal(result.ok, true);
  });

  it("rejects worker enabled with missing SID", () => {
    const result = requireContentSidWhenWorkerEnabled(
      { workerEnabled: true, contentSid: undefined },
      "TWILIO_PAYROLL_RECEIPT_AVAILABLE_CONTENT_SID",
      "PAYROLL_RECEIPT_NOTIFICATION_WORKER_ENABLED",
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.message, /TWILIO_PAYROLL_RECEIPT_AVAILABLE_CONTENT_SID/);
    }
  });

  it("rejects worker enabled with blank SID", () => {
    const result = requireContentSidWhenWorkerEnabled(
      { workerEnabled: true, contentSid: "   " },
      "TWILIO_EVENTUAL_OPERATION_ASSIGNED_CONTENT_SID",
      "OPERATION_ASSIGNMENT_NOTIFICATION_WORKER_ENABLED",
    );
    assert.equal(result.ok, false);
  });
});
