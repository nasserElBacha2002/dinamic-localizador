IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_monthly_report_delivery_run_tenant' AND parent_object_id=OBJECT_ID(N'dbo.monthly_attendance_report_deliveries')) ALTER TABLE dbo.monthly_attendance_report_deliveries DROP CONSTRAINT FK_monthly_report_delivery_run_tenant;
GO
ALTER TABLE dbo.monthly_attendance_report_deliveries ADD CONSTRAINT FK_monthly_report_delivery_run FOREIGN KEY(report_run_id) REFERENCES dbo.monthly_attendance_report_runs(id);
GO
ALTER TABLE dbo.monthly_attendance_report_deliveries ADD CONSTRAINT FK_monthly_report_delivery_company FOREIGN KEY(company_id) REFERENCES dbo.companies(id);
GO
