/*
  Rollback: 086_payroll_multiple_receipts_per_period_rollback.sql
  Warning: Restoring UX_payroll_receipts_active_period FAILS if multiple ASSOCIATED
  rows already exist for the same company+employee+year+month. Heal data first.
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.whatsapp_payroll_receipt_query_deliveries', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.whatsapp_payroll_receipt_query_deliveries;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UX_payroll_receipts_active_checksum'
      AND object_id = OBJECT_ID(N'dbo.payroll_receipts')
)
BEGIN
    DROP INDEX UX_payroll_receipts_active_checksum ON dbo.payroll_receipts;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_pr_active_employee_period'
      AND object_id = OBJECT_ID(N'dbo.payroll_receipts')
)
BEGIN
    DROP INDEX IX_pr_active_employee_period ON dbo.payroll_receipts;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UX_payroll_receipts_active_period'
      AND object_id = OBJECT_ID(N'dbo.payroll_receipts')
)
BEGIN
    CREATE UNIQUE INDEX UX_payroll_receipts_active_period
        ON dbo.payroll_receipts (company_id, employee_id, year, month)
        WHERE deleted_at IS NULL AND status = N'ASSOCIATED' AND employee_id IS NOT NULL;
END;
GO
