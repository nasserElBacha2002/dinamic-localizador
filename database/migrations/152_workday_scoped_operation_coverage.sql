/*
  Migration: 152_workday_scoped_operation_coverage.sql
  Purpose:
    - Scope absence coverage events to absent employee_workday (canonical identity)
    - Persist coverage_command_id for idempotent cover operations
    - Allow superseded_at for historical audit without counting as active coverage
    - Relax replaced_assignment unique index to legacy rows only (no workday id)
  Rollback: rollback/152_workday_scoped_operation_coverage_rollback.sql
*/

IF COL_LENGTH(N'dbo.operation_coverage_events', N'absent_employee_workday_id') IS NULL
BEGIN
  ALTER TABLE dbo.operation_coverage_events
    ADD absent_employee_workday_id UNIQUEIDENTIFIER NULL;
END;
GO

IF COL_LENGTH(N'dbo.operation_coverage_events', N'coverage_command_id') IS NULL
BEGIN
  ALTER TABLE dbo.operation_coverage_events
    ADD coverage_command_id NVARCHAR(120) NULL;
END;
GO

IF COL_LENGTH(N'dbo.operation_coverage_events', N'superseded_at') IS NULL
BEGIN
  ALTER TABLE dbo.operation_coverage_events
    ADD superseded_at DATETIME2 NULL;
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_oce_absent_employee_workday'
)
BEGIN
  ALTER TABLE dbo.operation_coverage_events
    ADD CONSTRAINT FK_oce_absent_employee_workday
    FOREIGN KEY (company_id, absent_employee_workday_id)
    REFERENCES dbo.employee_workdays (company_id, id);
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

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'UQ_oce_company_replaced_assignment_legacy'
    AND object_id = OBJECT_ID(N'dbo.operation_coverage_events')
)
BEGIN
  CREATE UNIQUE INDEX UQ_oce_company_replaced_assignment_legacy
    ON dbo.operation_coverage_events (company_id, replaced_assignment_id)
    WHERE replaced_assignment_id IS NOT NULL
      AND absent_employee_workday_id IS NULL
      AND superseded_at IS NULL;
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'UQ_oce_company_active_workday'
    AND object_id = OBJECT_ID(N'dbo.operation_coverage_events')
)
BEGIN
  CREATE UNIQUE INDEX UQ_oce_company_active_workday
    ON dbo.operation_coverage_events (company_id, absent_employee_workday_id)
    WHERE absent_employee_workday_id IS NOT NULL
      AND superseded_at IS NULL;
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'UQ_oce_company_coverage_command'
    AND object_id = OBJECT_ID(N'dbo.operation_coverage_events')
)
BEGIN
  CREATE UNIQUE INDEX UQ_oce_company_coverage_command
    ON dbo.operation_coverage_events (company_id, coverage_command_id)
    WHERE coverage_command_id IS NOT NULL;
END;
GO
