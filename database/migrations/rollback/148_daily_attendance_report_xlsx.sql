IF COL_LENGTH(N'dbo.company_daily_attendance_report_runs', N'xlsx_snapshot') IS NOT NULL
BEGIN
  ALTER TABLE dbo.company_daily_attendance_report_runs DROP COLUMN xlsx_snapshot;
END
