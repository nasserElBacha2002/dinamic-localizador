IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'UQ_monthly_report_run_company_id' AND object_id=OBJECT_ID(N'dbo.monthly_attendance_report_runs'))
  CREATE UNIQUE INDEX UQ_monthly_report_run_company_id ON dbo.monthly_attendance_report_runs(company_id,id);
GO
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_monthly_report_delivery_run' AND parent_object_id=OBJECT_ID(N'dbo.monthly_attendance_report_deliveries'))
  ALTER TABLE dbo.monthly_attendance_report_deliveries DROP CONSTRAINT FK_monthly_report_delivery_run;
GO
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_monthly_report_delivery_company' AND parent_object_id=OBJECT_ID(N'dbo.monthly_attendance_report_deliveries'))
  ALTER TABLE dbo.monthly_attendance_report_deliveries DROP CONSTRAINT FK_monthly_report_delivery_company;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_monthly_report_delivery_run_tenant' AND parent_object_id=OBJECT_ID(N'dbo.monthly_attendance_report_deliveries'))
  ALTER TABLE dbo.monthly_attendance_report_deliveries ADD CONSTRAINT FK_monthly_report_delivery_run_tenant FOREIGN KEY(company_id,report_run_id) REFERENCES dbo.monthly_attendance_report_runs(company_id,id);
GO
