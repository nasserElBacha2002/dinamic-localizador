/*
  Rollback: 152_workday_scoped_operation_coverage
  Preflight considers ALL rows that would remain after column drops (not only superseded_at IS NULL).
  Legacy model allows at most one row per (company_id, replaced_assignment_id).
  Abort before any schema change if data is not losslessly representable.
*/

IF EXISTS (
  SELECT 1
  FROM dbo.operation_coverage_events
  WHERE replaced_assignment_id IS NOT NULL
  GROUP BY company_id, replaced_assignment_id
  HAVING COUNT(*) > 1
)
BEGIN
  THROW 51000,
    N'Rollback 152 blocked: multiple operation_coverage_events rows share the same replaced_assignment_id. Reconcile data before rollback.',
    1;
END;
GO

IF EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'UQ_oce_company_coverage_command'
    AND object_id = OBJECT_ID(N'dbo.operation_coverage_events')
)
BEGIN
  DROP INDEX UQ_oce_company_coverage_command ON dbo.operation_coverage_events;
END;
GO

IF EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'UQ_oce_company_active_workday'
    AND object_id = OBJECT_ID(N'dbo.operation_coverage_events')
)
BEGIN
  DROP INDEX UQ_oce_company_active_workday ON dbo.operation_coverage_events;
END;
GO

IF EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'UQ_oce_company_replaced_assignment_legacy'
    AND object_id = OBJECT_ID(N'dbo.operation_coverage_events')
)
BEGIN
  DROP INDEX UQ_oce_company_replaced_assignment_legacy ON dbo.operation_coverage_events;
END;
GO

IF EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'UQ_oce_company_replaced_assignment'
    AND object_id = OBJECT_ID(N'dbo.operation_coverage_events')
)
BEGIN
  DROP INDEX UQ_oce_company_replaced_assignment ON dbo.operation_coverage_events;
END;
GO

IF EXISTS (
  SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_oce_absent_employee_workday'
)
BEGIN
  ALTER TABLE dbo.operation_coverage_events DROP CONSTRAINT FK_oce_absent_employee_workday;
END;
GO

IF COL_LENGTH(N'dbo.operation_coverage_events', N'superseded_at') IS NOT NULL
BEGIN
  ALTER TABLE dbo.operation_coverage_events DROP COLUMN superseded_at;
END;
GO

IF COL_LENGTH(N'dbo.operation_coverage_events', N'coverage_command_id') IS NOT NULL
BEGIN
  ALTER TABLE dbo.operation_coverage_events DROP COLUMN coverage_command_id;
END;
GO

IF COL_LENGTH(N'dbo.operation_coverage_events', N'absent_employee_workday_id') IS NOT NULL
BEGIN
  ALTER TABLE dbo.operation_coverage_events DROP COLUMN absent_employee_workday_id;
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'UQ_oce_company_replaced_assignment'
    AND object_id = OBJECT_ID(N'dbo.operation_coverage_events')
)
BEGIN
  CREATE UNIQUE INDEX UQ_oce_company_replaced_assignment
    ON dbo.operation_coverage_events (company_id, replaced_assignment_id)
    WHERE replaced_assignment_id IS NOT NULL;
END;
GO
