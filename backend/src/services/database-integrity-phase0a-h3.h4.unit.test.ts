import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import type sql from "mssql";
import { AppError } from "../errors/app-error";
import { absenceRequestRepository } from "../repositories/absence-request.repository";
import { absenceAttachmentRepository } from "../repositories/absence-attachment.repository";
import { absenceTypeRepository } from "../repositories/absence-type.repository";
import { absenceAttachmentService } from "./absence-attachment.service";
import { absenceReviewService } from "./absence-review.service";
import { absenceWorkdaySyncService } from "./absence-workday-sync.service";

const COMPANY_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const REQUEST_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const USER_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const TYPE_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";

const stub = <T extends object, K extends keyof T>(obj: T, key: K, impl: T[K]) => {
  const previous = obj[key];
  obj[key] = impl;
  return () => {
    obj[key] = previous;
  };
};

describe("phase0a H3 attachment assert placement", () => {
  const restores: Array<() => void> = [];

  afterEach(() => {
    while (restores.length > 0) {
      restores.pop()?.();
    }
  });

  it("approve does not assert attachments before entering runAfterAbsenceMutation", async () => {
    const callOrder: string[] = [];
    restores.push(
      stub(absenceRequestRepository, "findById", async () => {
        callOrder.push("findById");
        return {
          id: REQUEST_ID,
          absenceTypeId: TYPE_ID,
          status: "PENDING",
        } as never;
      }),
      stub(absenceAttachmentService, "assertRequiredAttachmentsSatisfied", async () => {
        callOrder.push("assertAttachments");
      }),
      stub(absenceWorkdaySyncService, "runAfterAbsenceMutation", async (_c, _r, mutate) => {
        callOrder.push("runAfter");
        void mutate;
        return { id: REQUEST_ID } as never;
      }),
    );

    await absenceReviewService.approve(COMPANY_ID, REQUEST_ID, USER_ID);
    assert.deepEqual(callOrder, ["findById", "runAfter"]);
    assert.ok(!callOrder.includes("assertAttachments"));
  });

  it("assertRequiredAttachmentsSatisfied forwards transaction to countAvailable", async () => {
    const tx = { tag: "tx" } as unknown as sql.Transaction;
    let seenTx: sql.Transaction | undefined;
    restores.push(
      stub(absenceRequestRepository, "findByIdForUpdate", async () =>
        ({
          id: REQUEST_ID,
          attachmentPolicySnapshot: "REQUIRED",
          absenceTypeId: TYPE_ID,
        }) as never,
      ),
      stub(absenceTypeRepository, "findById", async () =>
        ({
          id: TYPE_ID,
          attachmentPolicy: "REQUIRED",
          requiresAttachment: true,
        }) as never,
      ),
      stub(absenceAttachmentRepository, "countAvailable", async (_c, _r, transaction) => {
        seenTx = transaction;
        return 0;
      }),
    );

    await assert.rejects(
      () =>
        absenceAttachmentService.assertRequiredAttachmentsSatisfied(
          COMPANY_ID,
          REQUEST_ID,
          TYPE_ID,
          tx,
        ),
      (error: unknown) =>
        error instanceof AppError && error.code === "ABSENCE_ATTACHMENT_REQUIRED",
    );
    assert.equal(seenTx, tx);
  });
});

describe("phase0a H4 checkout without location atomicity", () => {
  it("smoke only: session completes inside tx before commit (primary evidence is SQL integration)", async () => {
    // Primary H4 evidence: database-integrity-phase0a-corrections.integration.test.ts
    // (success + injected before-commit failure rollback + MessageSid retry).
    const attendanceSource = await readFile(
      new URL("../repositories/attendance.repository.ts", import.meta.url),
      "utf8",
    );
    assert.ok(attendanceSource.includes("registerCheckoutInTransaction"));
    assert.ok(attendanceSource.includes("AND checkout_at IS NULL"));

    const botSource = await readFile(
      new URL("./whatsapp-bot.service.ts", import.meta.url),
      "utf8",
    );
    const withoutLoc = botSource.indexOf("async processCheckoutWithoutLocation");
    assert.ok(withoutLoc > 0);
    const nextMethod = botSource.indexOf("\n  async ", withoutLoc + 10);
    const slice = botSource.slice(withoutLoc, nextMethod > 0 ? nextMethod : undefined);
    const completeInTx = slice.indexOf(
      "completeSession(companyId, input.sessionId, transaction)",
    );
    const commitIdx = slice.indexOf("await transaction.commit()");
    assert.ok(completeInTx > 0, "session completion must use transaction");
    assert.ok(commitIdx > 0, "commit must exist");
    assert.ok(
      completeInTx < commitIdx,
      "session must complete before commit in checkout-without-location",
    );
    assert.ok(
      !slice.includes("await transaction.commit();\n      await completeSessionIfNeeded()"),
      "must not complete session after commit",
    );
  });
});
