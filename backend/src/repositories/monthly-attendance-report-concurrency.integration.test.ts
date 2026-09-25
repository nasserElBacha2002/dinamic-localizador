import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, it } from "node:test";
import sql from "mssql";
import { getPool } from "../database/connection";
import { describeDatabaseIntegration, setupDatabaseIntegration, teardownDatabaseIntegration } from "../test-helpers/integration-test";
import { monthlyAttendanceReportDeliveryRepository } from "./monthly-attendance-report-delivery.repository";
import { monthlyAttendanceReportRunRepository } from "./monthly-attendance-report-run.repository";

describeDatabaseIntegration("monthly attendance report SQL claim and snapshot recovery", () => {
  let companyId = "";
  const runIds: string[] = [];
  before(async () => { await setupDatabaseIntegration(); const row = (await getPool().request().query("SELECT TOP 1 id FROM companies WHERE status=N'ACTIVE' ORDER BY created_at")).recordset[0]; companyId = String(row.id); });
  after(async () => { for (const id of runIds) await getPool().request().input("id", sql.UniqueIdentifier, id).input("companyId", sql.UniqueIdentifier, companyId).query("DELETE FROM monthly_attendance_report_deliveries WHERE report_run_id=@id AND company_id=@companyId; DELETE FROM monthly_attendance_report_runs WHERE id=@id AND company_id=@companyId"); await teardownDatabaseIntegration(); });
  it("reclaims an expired run lease and preserves its snapshot", async () => {
    const run = await monthlyAttendanceReportRunRepository.ensure(companyId, 2090, Number(String(Date.now()).slice(-2, -1)) || 1, "UTC"); runIds.push(run.id);
    const first = await monthlyAttendanceReportRunRepository.claim(run.id, companyId, "worker-a", 60); assert.ok(first);
    assert.equal(await monthlyAttendanceReportRunRepository.claim(run.id, companyId, "worker-b", 60), null);
    assert.equal(await monthlyAttendanceReportRunRepository.snapshot({ run: first!, owner: "worker-a", subject: "s", text: "t", html: "h", xlsx: Buffer.from("x") }), true);
    await getPool().request().input("id", sql.UniqueIdentifier, run.id).query("UPDATE monthly_attendance_report_runs SET lease_expires_at=DATEADD(SECOND,-1,SYSUTCDATETIME()) WHERE id=@id");
    const recovered = await monthlyAttendanceReportRunRepository.claim(run.id, companyId, "worker-b", 60); assert.ok(recovered); assert.equal(recovered?.subject, "s");
  });
  it("reclaims expired delivery leases and snapshots recipients idempotently", async () => {
    const run = await monthlyAttendanceReportRunRepository.ensure(companyId, 2091, 1, "UTC"); runIds.push(run.id); const claimed = await monthlyAttendanceReportRunRepository.claim(run.id, companyId, "worker-a", 60); assert.ok(claimed);
    const recipients = ["a@example.com", "b@example.com", "c@example.com"].map((email, i) => ({ id: randomUUID(), email, displayName: `R${i}` }));
    await monthlyAttendanceReportDeliveryRepository.snapshot(run.id, companyId, recipients); await monthlyAttendanceReportDeliveryRepository.snapshot(run.id, companyId, recipients);
    assert.equal(await monthlyAttendanceReportDeliveryRepository.count(run.id, companyId), 3);
    const first = await monthlyAttendanceReportDeliveryRepository.claim(run.id, companyId, "worker-a", 60); assert.ok(first); const second = await monthlyAttendanceReportDeliveryRepository.claim(run.id, companyId, "worker-b", 60); assert.ok(second); assert.notEqual(second?.id, first?.id);
    await getPool().request().input("id", sql.UniqueIdentifier, first!.id).input("runId", sql.UniqueIdentifier, run.id).query("UPDATE monthly_attendance_report_deliveries SET status=N'SENT', lease_owner=NULL, lease_expires_at=NULL WHERE report_run_id=@runId AND id<>@id; UPDATE monthly_attendance_report_deliveries SET lease_expires_at=DATEADD(SECOND,-1,SYSUTCDATETIME()) WHERE id=@id");
    const recovered = await monthlyAttendanceReportDeliveryRepository.claim(run.id, companyId, "worker-b", 60); assert.equal(recovered?.id, first?.id);
  });
});
