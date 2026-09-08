import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import sql from "mssql";
import { getPool } from "../database/connection";
import { botSessionRepository } from "../repositories/bot-session.repository";
import {
  createIntegrationFixtureTracker,
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { botSessionService } from "./bot-session.service";

const uniquePhone = (suffix: number): string =>
  `+54911${Date.now().toString().slice(-7)}${suffix}`;

describeDatabaseIntegration("persistent contextual bot sessions", () => {
  const fixtures = createIntegrationFixtureTracker();
  const employeeIds: string[] = [];
  let companyId = "";

  before(async () => {
    await setupDatabaseIntegration();
    const company = await getPool().request().query(`
      SELECT TOP 1 id
      FROM companies
      WHERE status = N'ACTIVE' OR status IS NULL
      ORDER BY created_at
    `);
    companyId = String(company.recordset[0]?.id ?? "");
    assert.ok(companyId);
  });

  after(async () => {
    if (employeeIds.length > 0) {
      const request = getPool().request();
      employeeIds.forEach((id, index) => {
        request.input(`employeeId${index}`, sql.UniqueIdentifier, id);
      });
      await request.query(`
        DELETE FROM bot_sessions
        WHERE employee_id IN (${employeeIds.map((_, index) => `@employeeId${index}`).join(", ")})
      `);
    }
    await fixtures.cleanup();
    await teardownDatabaseIntegration();
  });

  const createEmployee = async (suffix: number) => {
    const phoneNumber = uniquePhone(suffix);
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("phoneNumber", sql.NVarChar(30), phoneNumber)
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO employees (
          company_id, name, phone_number, employee_type, active
        )
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (
          @companyId, N'Contextual bot integration', @phoneNumber, N'fijo', 1
        );
        SELECT id FROM @inserted;
      `);
    const employeeId = String(result.recordset[0].id);
    employeeIds.push(employeeId);
    fixtures.trackEmployee(companyId, employeeId);
    return { employeeId, phoneNumber };
  };

  it("persists a menu snapshot and reloads it through the repository", async () => {
    const employee = await createEmployee(1);
    const created = await botSessionService.createMenuSelectionSession(companyId, {
      ...employee,
      options: ["check_in", "checkout", "payroll_receipt"],
    });

    const reloaded = await botSessionRepository.findValidActiveByPhone(
      companyId,
      employee.phoneNumber,
    );
    assert.equal(reloaded?.id, created.id);
    assert.equal(reloaded?.state, "WAITING_MENU_SELECTION");
    assert.equal(reloaded?.intent, "MENU");
    assert.deepEqual(botSessionService.parseContext(reloaded?.contextJson ?? null).menuOptions, [
      "check_in",
      "checkout",
      "payroll_receipt",
    ]);
  });

  it("fences concurrent transitions and cancels at the maximum attempts", async () => {
    const employee = await createEmployee(2);
    const created = await botSessionService.createMenuSelectionSession(companyId, {
      ...employee,
      options: ["check_in", "checkout"],
    });

    const first = await botSessionRepository.recordFailedAttempt({
      companyId,
      sessionId: created.id,
      expectedVersion: created.sessionVersion,
      messageSid: "SM-CONTEXT-1",
      maxFailedAttempts: 3,
      expiresAt: new Date(Date.now() + 15 * 60_000),
    });
    assert.equal(first.kind, "applied");
    assert.equal(first.kind === "applied" ? first.session.failedAttempts : null, 1);

    const replay = await botSessionRepository.recordFailedAttempt({
      companyId,
      sessionId: created.id,
      expectedVersion: created.sessionVersion,
      messageSid: "SM-CONTEXT-1",
      maxFailedAttempts: 3,
      expiresAt: new Date(Date.now() + 15 * 60_000),
    });
    assert.equal(replay.kind, "idempotent_replay");
    assert.equal(replay.kind === "idempotent_replay" ? replay.session.failedAttempts : null, 1);
    assert.equal(
      replay.kind === "idempotent_replay" ? replay.session.sessionVersion : null,
      first.kind === "applied" ? first.session.sessionVersion : null,
    );

    const concurrentInputs = ["SM-CONTEXT-2A", "SM-CONTEXT-2B"];
    const concurrent = await Promise.all(
      concurrentInputs.map((messageSid) =>
        botSessionRepository.recordFailedAttempt({
          companyId,
          sessionId: created.id,
          expectedVersion: first.kind === "applied" ? first.session.sessionVersion : -1,
          messageSid,
          maxFailedAttempts: 3,
          expiresAt: new Date(Date.now() + 15 * 60_000),
        }),
      ),
    );
    assert.equal(concurrent.filter((result) => result.kind === "applied").length, 1);
    assert.equal(concurrent.filter((result) => result.kind === "cas_conflict").length, 1);

    const winner = concurrent.find((result) => result.kind === "applied");
    assert.ok(winner && winner.kind === "applied");
    const cancelled = await botSessionRepository.recordFailedAttempt({
      companyId,
      sessionId: created.id,
      expectedVersion: winner.session.sessionVersion,
      messageSid: "SM-CONTEXT-3",
      maxFailedAttempts: 3,
      expiresAt: new Date(Date.now() + 15 * 60_000),
    });
    assert.equal(cancelled.kind, "applied");
    assert.equal(cancelled.kind === "applied" ? cancelled.session.failedAttempts : null, 3);
    assert.equal(cancelled.kind === "applied" ? cancelled.session.state : null, "CANCELLED");
    assert.equal(cancelled.kind === "applied" ? cancelled.session.contextJson : "missing", null);
    assert.equal(cancelled.kind === "applied" ? cancelled.session.intent : "missing", null);
  });

  it("keeps company scope and lazily expires stale persisted state", async () => {
    const employee = await createEmployee(3);
    const stale = await botSessionRepository.create({
      companyId,
      employeeId: employee.employeeId,
      operationId: null,
      phoneNumber: employee.phoneNumber,
      state: "WAITING_MENU_SELECTION",
      intent: "MENU",
      contextJson: JSON.stringify({ menuOptions: ["check_in"] }),
      expiresAt: new Date(Date.now() - 1_000),
    });

    assert.equal(
      await botSessionRepository.findValidActiveByPhone(
        "00000000-0000-4000-8000-000000000099",
        employee.phoneNumber,
      ),
      null,
    );
    assert.equal(
      await botSessionService.getActiveSessionByPhone(companyId, employee.phoneNumber),
      null,
    );
    const latest = await botSessionRepository.findLatestByPhone(
      companyId,
      employee.phoneNumber,
    );
    assert.equal(latest?.id, stale.id);
    assert.equal(latest?.state, "EXPIRED");
  });

  it("converges concurrent menu creation to one active session", async () => {
    const employee = await createEmployee(4);
    const [first, second] = await Promise.all([
      botSessionService.createMenuSelectionSession(companyId, {
        ...employee,
        options: ["check_in", "checkout"],
      }),
      botSessionService.createMenuSelectionSession(companyId, {
        ...employee,
        options: ["check_in", "checkout"],
      }),
    ]);

    const active = await botSessionRepository.findValidActiveByPhone(
      companyId,
      employee.phoneNumber,
    );
    assert.ok(active);
    assert.ok(first.id === active.id || second.id === active.id);

    const count = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employee.employeeId)
      .query(`
        SELECT COUNT(*) AS total
        FROM bot_sessions
        WHERE company_id = @companyId
          AND employee_id = @employeeId
          AND state = N'WAITING_MENU_SELECTION'
      `);
    assert.equal(Number(count.recordset[0].total), 1);
  });
});
