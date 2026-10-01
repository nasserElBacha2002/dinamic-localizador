import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { whatsappLifecycleRepository } from "../repositories/whatsapp-lifecycle.repository";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { runWhatsappLifecycleBody } from "./whatsapp-lifecycle.service";

describe("whatsappLifecycleService body", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("ACTIVE idle path is invoked; dryRun performs no writes", async () => {
    setupUnitTestEnv();
    const complete = mock.method(
      whatsappLifecycleRepository,
      "completeIdleActiveConversations",
      async () => ({ scanned: 0, updated: 1 }),
    );
    const flows = mock.method(
      whatsappLifecycleRepository,
      "failAbandonedStartedFlows",
      async () => ({ scanned: 0, updated: 1 }),
    );
    const webhooks = mock.method(
      whatsappLifecycleRepository,
      "failAbandonedProcessingWebhooks",
      async () => ({ scanned: 0, updated: 1 }),
    );

    const dry = await runWhatsappLifecycleBody({
      dryRun: true,
      conversationIdleTimeoutHours: 24,
      flowStartedTimeoutHours: 24,
      batchSize: 50,
      maxBatches: 2,
    });
    assert.deepEqual(dry, { conversationsCompleted: 0, flowsFailed: 0, webhooksFailed: 0 });
    assert.equal(complete.mock.callCount(), 0);
    assert.equal(flows.mock.callCount(), 0);
    assert.equal(webhooks.mock.callCount(), 0);
  });

  it("recent batches stop when repository returns 0; aggregates updates", async () => {
    setupUnitTestEnv();
    let conversationCalls = 0;
    mock.method(whatsappLifecycleRepository, "completeIdleActiveConversations", async (input) => {
      conversationCalls += 1;
      assert.equal(input.idleTimeoutHours, 24);
      assert.equal(input.batchSize, 50);
      return conversationCalls === 1
        ? { scanned: 3, updated: 3 }
        : { scanned: 0, updated: 0 };
    });
    let flowCalls = 0;
    mock.method(whatsappLifecycleRepository, "failAbandonedStartedFlows", async (input) => {
      flowCalls += 1;
      assert.equal(input.timeoutHours, 48);
      return flowCalls === 1 ? { scanned: 1, updated: 1 } : { scanned: 0, updated: 0 };
    });
    let webhookCalls = 0;
    mock.method(whatsappLifecycleRepository, "failAbandonedProcessingWebhooks", async () => {
      webhookCalls += 1;
      return webhookCalls === 1 ? { scanned: 2, updated: 2 } : { scanned: 0, updated: 0 };
    });

    const first = await runWhatsappLifecycleBody({
      dryRun: false,
      conversationIdleTimeoutHours: 24,
      flowStartedTimeoutHours: 48,
      batchSize: 50,
      maxBatches: 5,
    });
    assert.deepEqual(first, {
      conversationsCompleted: 3,
      flowsFailed: 1,
      webhooksFailed: 2,
    });

    const second = await runWhatsappLifecycleBody({
      dryRun: false,
      conversationIdleTimeoutHours: 24,
      flowStartedTimeoutHours: 48,
      batchSize: 50,
      maxBatches: 5,
    });
    assert.deepEqual(second, {
      conversationsCompleted: 0,
      flowsFailed: 0,
      webhooksFailed: 0,
    });
  });
});
