/*
  Rollback for 082_payroll_receipts_hardening.sql
  Restores single-column FKs from 081; drops composite unique indexes added by 082.
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.payroll_receipts', N'U') IS NOT NULL
BEGIN
    IF EXISTS (
        SELECT 1 FROM sys.foreign_keys
        WHERE name = N'FK_pr_batch'
          AND parent_object_id = OBJECT_ID(N'dbo.payroll_receipts')
    )
    BEGIN
        ALTER TABLE dbo.payroll_receipts DROP CONSTRAINT FK_pr_batch;
    END;

    ALTER TABLE dbo.payroll_receipts
        ADD CONSTRAINT FK_pr_batch
        FOREIGN KEY (batch_id)
        REFERENCES dbo.payroll_receipt_batches (id);

    IF EXISTS (
        SELECT 1 FROM sys.foreign_keys
        WHERE name = N'FK_pr_employee'
          AND parent_object_id = OBJECT_ID(N'dbo.payroll_receipts')
    )
    BEGIN
        ALTER TABLE dbo.payroll_receipts DROP CONSTRAINT FK_pr_employee;
    END;

    ALTER TABLE dbo.payroll_receipts
        ADD CONSTRAINT FK_pr_employee
        FOREIGN KEY (employee_id)
        REFERENCES dbo.employees (id);
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_prb_id_company'
      AND object_id = OBJECT_ID(N'dbo.payroll_receipt_batches')
)
BEGIN
    DROP INDEX UQ_prb_id_company ON dbo.payroll_receipt_batches;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_employees_id_company'
      AND object_id = OBJECT_ID(N'dbo.employees')
)
BEGIN
    DROP INDEX UQ_employees_id_company ON dbo.employees;
END;
GO
