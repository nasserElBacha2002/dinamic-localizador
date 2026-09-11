/*
  Rollback: 117_operational_incident_statistics_rollback.sql
  Reverses 117_operational_incident_statistics.sql
*/

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_oa_company_confirmation_status'
      AND object_id = OBJECT_ID(N'dbo.operation_assignments')
)
BEGIN
    DROP INDEX IX_oa_company_confirmation_status ON dbo.operation_assignments;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_aoc_company_resolution_coverage'
      AND object_id = OBJECT_ID(N'dbo.absence_operational_conflicts')
)
BEGIN
    DROP INDEX IX_aoc_company_resolution_coverage ON dbo.absence_operational_conflicts;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_audit_logs_company_entity_action'
      AND object_id = OBJECT_ID(N'dbo.audit_logs')
)
BEGIN
    DROP INDEX IX_audit_logs_company_entity_action ON dbo.audit_logs;
END;
GO

IF OBJECT_ID(N'dbo.operation_change_events', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.operation_change_events;
END;
GO

IF OBJECT_ID(N'dbo.operation_coverage_events', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.operation_coverage_events;
END;
GO

-- COVERAGE origin must be remapped before restoring the pre-117 check constraint.
UPDATE dbo.operation_assignments
SET assignment_origin = N'MANUAL'
WHERE assignment_origin = N'COVERAGE';
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_operation_assignments_assignment_origin'
      AND parent_object_id = OBJECT_ID(N'dbo.operation_assignments')
)
BEGIN
    ALTER TABLE dbo.operation_assignments
        DROP CONSTRAINT CK_operation_assignments_assignment_origin;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_operation_assignments_assignment_origin'
      AND parent_object_id = OBJECT_ID(N'dbo.operation_assignments')
)
BEGIN
    ALTER TABLE dbo.operation_assignments
        ADD CONSTRAINT CK_operation_assignments_assignment_origin
        CHECK (assignment_origin IN (N'MANUAL', N'WORK_TEAM', N'SYSTEM'));
END;
GO
