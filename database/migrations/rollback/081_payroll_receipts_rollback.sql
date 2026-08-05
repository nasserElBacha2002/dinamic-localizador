/*
  Rollback for 081_payroll_receipts.sql
  Does NOT delete GCS objects — generate orphan report separately.
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.payroll_receipts', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.payroll_receipts;
END;
GO

IF OBJECT_ID(N'dbo.payroll_receipt_batches', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.payroll_receipt_batches;
END;
GO

DELETE FROM dbo.company_modules
WHERE module_key = N'payroll_receipts';
GO
