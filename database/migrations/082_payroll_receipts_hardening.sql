/*
  Migration: 082_payroll_receipts_hardening.sql
  Purpose (corrective — do not edit 081):
    - UNIQUE (id, company_id) on payroll_receipt_batches for composite FK
    - UNIQUE (id, company_id) on employees if missing (for composite FK)
    - Recreate FK_pr_batch / FK_pr_employee as company-scoped composite FKs
  Rollback: database/migrations/rollback/082_payroll_receipts_hardening_rollback.sql
*/

USE dinamic_attendance;
GO

-- Composite unique on batches (id, company_id) required for FK (batch_id, company_id)
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_prb_id_company'
      AND object_id = OBJECT_ID(N'dbo.payroll_receipt_batches')
)
BEGIN
    CREATE UNIQUE INDEX UQ_prb_id_company
        ON dbo.payroll_receipt_batches (id, company_id);
END;
GO

-- Composite unique on employees (id, company_id).
-- Existing UQ_employees_company_id is (company_id, id); SQL Server FK matching
-- requires the referenced unique key column order to match the FK.
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_employees_id_company'
      AND object_id = OBJECT_ID(N'dbo.employees')
)
BEGIN
    CREATE UNIQUE INDEX UQ_employees_id_company
        ON dbo.employees (id, company_id);
END;
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
        FOREIGN KEY (batch_id, company_id)
        REFERENCES dbo.payroll_receipt_batches (id, company_id);

    IF EXISTS (
        SELECT 1 FROM sys.foreign_keys
        WHERE name = N'FK_pr_employee'
          AND parent_object_id = OBJECT_ID(N'dbo.payroll_receipts')
    )
    BEGIN
        ALTER TABLE dbo.payroll_receipts DROP CONSTRAINT FK_pr_employee;
    END;

    -- employee_id is nullable; SQL Server skips composite FK check when any part is NULL
    ALTER TABLE dbo.payroll_receipts
        ADD CONSTRAINT FK_pr_employee
        FOREIGN KEY (employee_id, company_id)
        REFERENCES dbo.employees (id, company_id);
END;
GO
