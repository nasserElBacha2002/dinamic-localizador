/*
  Rollback: 118_operational_incident_statistics_corrections_rollback.sql
  Reverses 118_operational_incident_statistics_corrections.sql

  Note: operational_date TZ corrections are NOT reverted (data fix stays).
*/

IF EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_oche_operation_company'
)
BEGIN
    ALTER TABLE dbo.operation_change_events DROP CONSTRAINT FK_oche_operation_company;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_oche_operation'
)
BEGIN
    ALTER TABLE dbo.operation_change_events
        ADD CONSTRAINT FK_oche_operation
        FOREIGN KEY (operation_id) REFERENCES dbo.scheduled_operations (id);
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_oce_operation_company'
)
BEGIN
    ALTER TABLE dbo.operation_coverage_events DROP CONSTRAINT FK_oce_operation_company;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_oce_operation'
)
BEGIN
    ALTER TABLE dbo.operation_coverage_events
        ADD CONSTRAINT FK_oce_operation
        FOREIGN KEY (operation_id) REFERENCES dbo.scheduled_operations (id);
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
