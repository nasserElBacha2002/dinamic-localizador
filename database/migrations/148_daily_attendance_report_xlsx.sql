IF COL_LENGTH(N'dbo.company_daily_attendance_report_runs', N'xlsx_snapshot') IS NULL
BEGIN
  ALTER TABLE dbo.company_daily_attendance_report_runs ADD xlsx_snapshot VARBINARY(MAX) NULL;
END
