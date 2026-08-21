import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, it } from "node:test";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import {
  createIntegrationFixtureTracker,
} from "../test-helpers/integration-cleanup";
import { getPool } from "../database/connection";
import { whatsappObservabilityRepository } from "../repositories/whatsapp-observability.repository";

const sameId = (left: string | null | undefined, right: string | null | undefined): boolean =>
  String(left ?? "").toLowerCase() === String(right ?? "").toLowerCase();

describeDatabaseIntegration("whatsapp observability conversation list filters", () => {
  const runId = randomUUID().replace(/-/g, "").slice(0, 8);
  const fixtures = createIntegrationFixtureTracker();
  let companyAId = "";
  let companyBId = "";
  let employeeA1Id = "";
  let employeeA2Id = "";
  let employeeB1Id = "";
  const conversationIds: string[] = [];

  before(async () => {
    await setupDatabaseIntegration();
    const pool = getPool();

    const insertCompany = async (name: string): Promise<string> => {
      const result = await pool
        .request()
        .input("name", sql.NVarChar(200), name)
        .query(`
          INSERT INTO companies (name, default_timezone, status)
          OUTPUT INSERTED.id
          VALUES (@name, N'America/Argentina/Buenos_Aires', N'ACTIVE')
        `);
      const id = String(result.recordset[0].id).toLowerCase();
      fixtures.trackCompany(id);
      return id;
    };

    companyAId = await insertCompany(`Obs Filter Co A ${runId}`);
    companyBId = await insertCompany(`Obs Filter Co B ${runId}`);

    const insertEmployee = async (companyId: string, name: string, phoneSuffix: string) => {
      const result = await pool
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("name", sql.NVarChar(200), name)
        .input("phone", sql.NVarChar(30), `+54911${runId}${phoneSuffix}`)
        .query(`
          DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
          INSERT INTO employees (company_id, name, phone_number, employee_type, active)
          OUTPUT INSERTED.id INTO @inserted (id)
          VALUES (@companyId, @name, @phone, N'fijo', 1);
          SELECT id FROM @inserted;
        `);
      const id = String(result.recordset[0].id).toLowerCase();
      fixtures.trackEmployee(companyId, id);
      return id;
    };

    employeeA1Id = await insertEmployee(companyAId, `A1 ${runId}`, "01");
    employeeA2Id = await insertEmployee(companyAId, `A2 ${runId}`, "02");
    employeeB1Id = await insertEmployee(companyBId, `B1 ${runId}`, "03");

    const insertConversation = async (input: {
      companyId: string;
      employeeId: string;
      status: string;
      flowType: string;
      resultCode: string;
      errorCount: number;
      lastActivityAt: Date;
      phoneSuffix: string;
    }): Promise<string> => {
      const id = randomUUID().toLowerCase();
      await pool
        .request()
        .input("id", sql.UniqueIdentifier, id)
        .input("companyId", sql.UniqueIdentifier, input.companyId)
        .input("employeeId", sql.UniqueIdentifier, input.employeeId)
        .input("phoneHash", sql.NVarChar(64), `hash-${runId}-${input.phoneSuffix}`)
        .input("phoneMasked", sql.NVarChar(40), `****${input.phoneSuffix}`)
        .input("phoneNormalized", sql.NVarChar(512), `enc-${runId}-${input.phoneSuffix}`)
        .input("status", sql.NVarChar(20), input.status)
        .input("flowType", sql.NVarChar(60), input.flowType)
        .input("resultCode", sql.NVarChar(80), input.resultCode)
        .input("errorCount", sql.Int, input.errorCount)
        .input("lastActivityAt", sql.DateTime2, input.lastActivityAt)
        .query(`
          INSERT INTO whatsapp_conversations (
            id, company_id, employee_id, phone_hash, phone_masked, phone_normalized,
            status, last_flow_type, last_result_code, error_count, message_count,
            started_at, last_activity_at, created_at, updated_at
          )
          VALUES (
            @id, @companyId, @employeeId, @phoneHash, @phoneMasked, @phoneNormalized,
            @status, @flowType, @resultCode, @errorCount, 1,
            @lastActivityAt, @lastActivityAt, @lastActivityAt, @lastActivityAt
          )
        `);
      conversationIds.push(id);
      return id;
    };

    // Controlled dataset spanning filters + enough rows for pagination proof.
    await insertConversation({
      companyId: companyAId,
      employeeId: employeeA1Id,
      status: "ACTIVE",
      flowType: "INBOUND_LOCATION",
      resultCode: "CHECKIN_COMPLETED",
      errorCount: 0,
      lastActivityAt: new Date("2026-08-10T12:00:00.000Z"),
      phoneSuffix: "a1",
    });
    await insertConversation({
      companyId: companyAId,
      employeeId: employeeA2Id,
      status: "ERROR",
      flowType: "INBOUND_TEXT",
      resultCode: "FLOW_FAILED",
      errorCount: 2,
      lastActivityAt: new Date("2026-08-11T12:00:00.000Z"),
      phoneSuffix: "a2",
    });
    await insertConversation({
      companyId: companyBId,
      employeeId: employeeB1Id,
      status: "ACTIVE",
      flowType: "INBOUND_LOCATION",
      resultCode: "CHECKIN_COMPLETED",
      errorCount: 0,
      lastActivityAt: new Date("2026-08-12T12:00:00.000Z"),
      phoneSuffix: "b1",
    });

    for (let index = 0; index < 8; index += 1) {
      await insertConversation({
        companyId: companyAId,
        employeeId: employeeA1Id,
        status: "COMPLETED",
        flowType: "OUTBOUND_REMINDER",
        resultCode: "REMINDER_SENT",
        errorCount: 0,
        lastActivityAt: new Date(`2026-07-${String(10 + index).padStart(2, "0")}T12:00:00.000Z`),
        phoneSuffix: `pad${index}`,
      });
    }
  });

  after(async () => {
    const pool = getPool();
    for (const id of conversationIds) {
      await pool
        .request()
        .input("id", sql.UniqueIdentifier, id)
        .query(`DELETE FROM whatsapp_conversations WHERE id = @id`);
    }
    await fixtures.cleanup();
    await teardownDatabaseIntegration();
  });

  it("filters by employeeId only", async () => {
    const result = await whatsappObservabilityRepository.listConversations({
      employeeId: employeeA1Id,
      page: 1,
      limit: 50,
    });
    assert.ok(result.total >= 9);
    assert.ok(result.data.every((row) => sameId(row.employeeId, employeeA1Id)));
  });

  it("isolates companyId AND employeeId across companies", async () => {
    const result = await whatsappObservabilityRepository.listConversations({
      companyId: companyAId,
      employeeId: employeeB1Id,
      page: 1,
      limit: 20,
    });
    assert.equal(result.total, 0);
    assert.equal(result.data.length, 0);
  });

  it("filters by status, flowType, resultCode, hasError, and activity", async () => {
    const statusOnly = await whatsappObservabilityRepository.listConversations({
      companyId: companyAId,
      status: "ERROR",
      page: 1,
      limit: 20,
    });
    assert.equal(statusOnly.total, 1);
    assert.ok(sameId(statusOnly.data[0]?.employeeId, employeeA2Id));

    const flow = await whatsappObservabilityRepository.listConversations({
      companyId: companyAId,
      flowType: "INBOUND_LOCATION",
      page: 1,
      limit: 20,
    });
    assert.equal(flow.total, 1);
    assert.ok(sameId(flow.data[0]?.employeeId, employeeA1Id));

    const resultCode = await whatsappObservabilityRepository.listConversations({
      companyId: companyAId,
      resultCode: "FLOW_FAILED",
      page: 1,
      limit: 20,
    });
    assert.equal(resultCode.total, 1);

    const withErrors = await whatsappObservabilityRepository.listConversations({
      companyId: companyAId,
      hasError: true,
      page: 1,
      limit: 20,
    });
    assert.equal(withErrors.total, 1);
    assert.ok((withErrors.data[0]?.errorCount ?? 0) > 0);

    const withoutErrors = await whatsappObservabilityRepository.listConversations({
      companyId: companyAId,
      hasError: false,
      page: 1,
      limit: 50,
    });
    assert.ok(withoutErrors.total >= 9);
    assert.ok(withoutErrors.data.every((row) => row.errorCount === 0));

    const activity = await whatsappObservabilityRepository.listConversations({
      companyId: companyAId,
      from: "2026-08-10T00:00:00.000Z",
      to: "2026-08-11T23:59:59.000Z",
      page: 1,
      limit: 20,
    });
    assert.equal(activity.total, 2);
  });

  it("applies combined filters before pagination", async () => {
    const unfiltered = await whatsappObservabilityRepository.listConversations({
      companyId: companyAId,
      page: 1,
      limit: 5,
    });
    assert.ok(unfiltered.total > 5);
    assert.equal(unfiltered.data.length, 5);

    const filtered = await whatsappObservabilityRepository.listConversations({
      companyId: companyAId,
      employeeId: employeeA1Id,
      status: "ACTIVE",
      flowType: "INBOUND_LOCATION",
      resultCode: "CHECKIN_COMPLETED",
      hasError: false,
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-31T23:59:59.000Z",
      page: 1,
      limit: 5,
    });
    assert.equal(filtered.total, 1);
    assert.equal(filtered.data.length, 1);
    assert.ok(sameId(filtered.data[0]?.employeeId, employeeA1Id));
    assert.ok(filtered.total < unfiltered.total);

    const page2Empty = await whatsappObservabilityRepository.listConversations({
      companyId: companyAId,
      employeeId: employeeA1Id,
      status: "ACTIVE",
      flowType: "INBOUND_LOCATION",
      resultCode: "CHECKIN_COMPLETED",
      hasError: false,
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-31T23:59:59.000Z",
      page: 2,
      limit: 5,
    });
    assert.equal(page2Empty.data.length, 0);
    assert.equal(page2Empty.total, 1);
  });

  it("lists platform employee lookups across companies", async () => {
    const bySearch = await whatsappObservabilityRepository.listEmployeeLookups({
      search: runId,
      limit: 20,
    });
    const ids = bySearch.map((row) => row.id);
    assert.ok(ids.some((id) => sameId(id, employeeA1Id)));
    assert.ok(ids.some((id) => sameId(id, employeeB1Id)));
    assert.ok(bySearch.every((row) => row.companyName.length > 0));

    const byId = await whatsappObservabilityRepository.listEmployeeLookups({
      id: employeeB1Id,
      limit: 1,
    });
    assert.equal(byId.length, 1);
    assert.ok(sameId(byId[0]?.id, employeeB1Id));
    assert.ok(sameId(byId[0]?.companyId, companyBId));
  });
});
