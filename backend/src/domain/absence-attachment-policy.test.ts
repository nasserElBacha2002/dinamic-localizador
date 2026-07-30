import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveAttachmentPolicy, isAttachmentPolicySatisfied } from "./absence-attachment-policy";
import { assertAttachmentStatusTransition } from "./absence-attachment-status";
import { AppError } from "../errors/app-error";

describe("attachment policy", () => {
  it("resolves REQUIRED from requiresAttachment fallback", () => {
    assert.equal(resolveAttachmentPolicy({ requiresAttachment: true }), "REQUIRED");
    assert.equal(resolveAttachmentPolicy({ requiresAttachment: false }), "OPTIONAL");
    assert.equal(resolveAttachmentPolicy({ attachmentPolicy: "FORBIDDEN" }), "FORBIDDEN");
  });

  it("satisfies REQUIRED only with available count", () => {
    assert.equal(isAttachmentPolicySatisfied("REQUIRED", 0), false);
    assert.equal(isAttachmentPolicySatisfied("REQUIRED", 1), true);
    assert.equal(isAttachmentPolicySatisfied("OPTIONAL", 0), true);
    assert.equal(isAttachmentPolicySatisfied("FORBIDDEN", 1), false);
  });
});

describe("attachment status machine", () => {
  it("allows UPLOADING → AVAILABLE and rejects AVAILABLE → FAILED", () => {
    assert.doesNotThrow(() => assertAttachmentStatusTransition("UPLOADING", "AVAILABLE"));
    assert.throws(
      () => assertAttachmentStatusTransition("AVAILABLE", "FAILED"),
      (error: unknown) => error instanceof AppError && error.code === "ATTACHMENT_INVALID_TRANSITION",
    );
  });
});
