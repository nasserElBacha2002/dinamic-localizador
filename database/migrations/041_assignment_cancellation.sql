USE dinamic_attendance;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.operation_assignments') AND name = 'cancelled_at'
)
BEGIN
    ALTER TABLE dbo.operation_assignments ADD cancelled_at DATETIME2 NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_operation_assignments_company_operation_cancelled'
      AND object_id = OBJECT_ID('dbo.operation_assignments')
)
BEGIN
    CREATE INDEX IX_operation_assignments_company_operation_cancelled
        ON dbo.operation_assignments (company_id, operation_id, cancelled_at)
        INCLUDE (employee_id, valid_from, valid_until);
END;
GO
