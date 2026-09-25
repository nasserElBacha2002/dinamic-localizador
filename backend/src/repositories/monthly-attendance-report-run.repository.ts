import sql from "mssql";
import { getPool } from "../database/connection";

export type MonthlyReportRun = { id: string; companyId: string; year: number; month: number; timezone: string; status: string; subject: string | null; text: string | null; html: string | null; xlsx: Buffer | null; attemptCount: number; };
const map = (r: Record<string, unknown>): MonthlyReportRun => ({ id: String(r.id), companyId: String(r.company_id), year: Number(r.report_year), month: Number(r.report_month), timezone: String(r.timezone_snapshot), status: String(r.status), subject: r.subject_snapshot ? String(r.subject_snapshot) : null, text: r.text_snapshot ? String(r.text_snapshot) : null, html: r.html_snapshot ? String(r.html_snapshot) : null, xlsx: r.xlsx_snapshot as Buffer | null, attemptCount: Number(r.attempt_count ?? 0) });
export const monthlyAttendanceReportRunRepository = {
  async ensure(companyId: string, year: number, month: number, timezone: string): Promise<MonthlyReportRun> {
    const p = getPool();
    const existing = await p.request().input("companyId", sql.UniqueIdentifier, companyId).input("year", sql.Int, year).input("month", sql.Int, month).query("SELECT TOP 1 * FROM monthly_attendance_report_runs WHERE company_id=@companyId AND report_year=@year AND report_month=@month");
    if (existing.recordset[0]) return map(existing.recordset[0]);
    try {
      const result = await p.request().input("companyId", sql.UniqueIdentifier, companyId).input("year", sql.Int, year).input("month", sql.Int, month).input("timezone", sql.NVarChar(80), timezone).query("INSERT INTO monthly_attendance_report_runs(company_id,report_year,report_month,timezone_snapshot,dataset_schema_version) OUTPUT INSERTED.* VALUES(@companyId,@year,@month,@timezone,1)");
      return map(result.recordset[0]);
    } catch {
      const raced = await p.request().input("companyId", sql.UniqueIdentifier, companyId).input("year", sql.Int, year).input("month", sql.Int, month).query("SELECT TOP 1 * FROM monthly_attendance_report_runs WHERE company_id=@companyId AND report_year=@year AND report_month=@month");
      if (!raced.recordset[0]) throw new Error("MONTHLY_REPORT_RUN_CREATE_FAILED");
      return map(raced.recordset[0]);
    }
  },
  async claim(id: string, companyId: string, owner: string, leaseSeconds: number): Promise<MonthlyReportRun | null> { const r = await getPool().request().input("id",sql.UniqueIdentifier,id).input("companyId",sql.UniqueIdentifier,companyId).input("owner",sql.NVarChar(100),owner).input("lease",sql.Int,leaseSeconds).query("UPDATE monthly_attendance_report_runs SET status=N'PROCESSING',attempt_count=attempt_count+1,lease_owner=@owner,lease_expires_at=DATEADD(SECOND,@lease,SYSUTCDATETIME()),updated_at=SYSUTCDATETIME() OUTPUT INSERTED.* WHERE id=@id AND company_id=@companyId AND status IN(N'PENDING',N'PARTIAL',N'FAILED') AND (lease_expires_at IS NULL OR lease_expires_at<SYSUTCDATETIME()) AND (next_attempt_at IS NULL OR next_attempt_at<=SYSUTCDATETIME())"); return r.recordset[0] ? map(r.recordset[0]) : null; },
  async snapshot(input: { run: MonthlyReportRun; owner: string; subject: string; text: string; html: string; xlsx: Buffer; }): Promise<boolean> { const r = await getPool().request().input("id",sql.UniqueIdentifier,input.run.id).input("companyId",sql.UniqueIdentifier,input.run.companyId).input("owner",sql.NVarChar(100),input.owner).input("subject",sql.NVarChar(500),input.subject).input("text",sql.NVarChar(sql.MAX),input.text).input("html",sql.NVarChar(sql.MAX),input.html).input("xlsx",sql.VarBinary(sql.MAX),input.xlsx).query("UPDATE monthly_attendance_report_runs SET subject_snapshot=@subject,text_snapshot=@text,html_snapshot=@html,xlsx_snapshot=@xlsx,updated_at=SYSUTCDATETIME() WHERE id=@id AND company_id=@companyId AND status=N'PROCESSING' AND lease_owner=@owner AND subject_snapshot IS NULL"); return (r.rowsAffected[0] ?? 0)>0; },
  async mark(id:string, companyId:string, owner:string, status:string, error:string|null=null): Promise<void> { await getPool().request().input("id",sql.UniqueIdentifier,id).input("companyId",sql.UniqueIdentifier,companyId).input("owner",sql.NVarChar(100),owner).input("status",sql.NVarChar(30),status).input("error",sql.NVarChar(1000),error).query("UPDATE monthly_attendance_report_runs SET status=@status,last_error=@error,lease_owner=NULL,lease_expires_at=NULL,sent_at=CASE WHEN @status=N'SENT' THEN SYSUTCDATETIME() ELSE sent_at END,updated_at=SYSUTCDATETIME() WHERE id=@id AND company_id=@companyId AND lease_owner=@owner"); },
};
