/*
  Rollback: 127_operation_shifts_foundation_rollback.sql

  Reverts Phase 1 shift foundation ONLY when no Phase-1 shift data exists.
  All guards run before any DROP/ALTER. A blocked rollback leaves schema intact.

  Blocks when any of:
    - operation_workdays.operation_shift_id IS NOT NULL
    - operation_assignments.operation_shift_id IS NOT NULL
    - any row in operation_shifts
    - any row in company_shift_templates
    - duplicate (operation_id, work_date) that would break legacy UQ

  Destructive cleanup of templates/shifts is intentionally NOT performed here.
*/

USE dinamic_attendance;
GO

SET XACT_ABORT ON;
GO

/* -------- Guards (must run before any destructive DDL) -------- */

IF COL_LENGTH(N'dbo.operation_workdays', N'operation_shift_id') IS NOT NULL
   AND EXISTS (SELECT 1 FROM dbo.operation_workdays WHERE operation_shift_id IS NOT NULL)
BEGIN
    THROW 50127, 'Rollback blocked: operation_workdays with operation_shift_id exist', 1;
END;
GO

IF COL_LENGTH(N'dbo.operation_assignments', N'operation_shift_id') IS NOT NULL
   AND EXISTS (SELECT 1 FROM dbo.operation_assignments WHERE operation_shift_id IS NOT NULL)
BEGIN
    THROW 50127, 'Rollback blocked: operation_assignments with operation_shift_id exist', 1;
END;
GO

IF OBJECT_ID(N'dbo.operation_shifts', N'U') IS NOT NULL
   AND EXISTS (SELECT 1 FROM dbo.operation_shifts)
BEGIN
    THROW 50127, 'Rollback blocked: operation_shifts rows exist (refusing destructive cleanup)', 1;
END;
GO

IF OBJECT_ID(N'dbo.operation_shift_versions', N'U') IS NOT NULL
BEGIN
    THROW 50127, 'Rollback blocked: Phase 2 operation_shift_versions present (roll back 129 first)', 1;
END;
GO

IF OBJECT_ID(N'dbo.company_shift_templates', N'U') IS NOT NULL
   AND EXISTS (SELECT 1 FROM dbo.company_shift_templates)
BEGIN
    THROW 50127, 'Rollback blocked: company_shift_templates rows exist (refusing destructive cleanup)', 1;
END;
GO

IF OBJECT_ID(N'dbo.operation_workdays', N'U') IS NOT NULL
   AND EXISTS (
        SELECT operation_id, work_date
        FROM dbo.operation_workdays
        GROUP BY operation_id, work_date
        HAVING COUNT(*) > 1
   )
BEGIN
    THROW 50127, 'Rollback blocked: duplicate (operation_id, work_date) incompatible with legacy UQ', 1;
END;
GO

/* -------- Destructive section (only reached when all guards passed) -------- */

IF EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_operation_assignments_shift_tenant'
)
BEGIN
    ALTER TABLE dbo.operation_assignments DROP CONSTRAINT FK_operation_assignments_shift_tenant;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_operation_assignments_shift'
      AND object_id = OBJECT_ID(N'dbo.operation_assignments')
)
BEGIN
    DROP INDEX IX_operation_assignments_shift ON dbo.operation_assignments;
END;
GO

IF COL_LENGTH(N'dbo.operation_assignments', N'operation_shift_id') IS NOT NULL
BEGIN
    ALTER TABLE dbo.operation_assignments DROP COLUMN operation_shift_id;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_operation_workdays_shift_tenant'
)
BEGIN
    ALTER TABLE dbo.operation_workdays DROP CONSTRAINT FK_operation_workdays_shift_tenant;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_operation_workdays_shift_snapshot_pair'
)
BEGIN
    ALTER TABLE dbo.operation_workdays DROP CONSTRAINT CK_operation_workdays_shift_snapshot_pair;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_operation_workdays_operation_shift'
      AND object_id = OBJECT_ID(N'dbo.operation_workdays')
)
BEGIN
    DROP INDEX IX_operation_workdays_operation_shift ON dbo.operation_workdays;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UX_operation_workdays_multi_op_date_shift'
      AND object_id = OBJECT_ID(N'dbo.operation_workdays')
)
BEGIN
    DROP INDEX UX_operation_workdays_multi_op_date_shift ON dbo.operation_workdays;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UX_operation_workdays_single_op_date'
      AND object_id = OBJECT_ID(N'dbo.operation_workdays')
)
BEGIN
    DROP INDEX UX_operation_workdays_single_op_date ON dbo.operation_workdays;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.key_constraints
    WHERE name = N'UQ_operation_workdays_operation_work_date'
      AND parent_object_id = OBJECT_ID(N'dbo.operation_workdays')
)
   AND NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_operation_workdays_operation_work_date'
      AND object_id = OBJECT_ID(N'dbo.operation_workdays')
)
BEGIN
    ALTER TABLE dbo.operation_workdays
        ADD CONSTRAINT UQ_operation_workdays_operation_work_date
            UNIQUE (operation_id, work_date);
END;
GO

IF COL_LENGTH(N'dbo.operation_workdays', N'shift_name_snapshot') IS NOT NULL
BEGIN
    ALTER TABLE dbo.operation_workdays DROP COLUMN shift_name_snapshot;
END;
GO

IF COL_LENGTH(N'dbo.operation_workdays', N'shift_code_snapshot') IS NOT NULL
BEGIN
    ALTER TABLE dbo.operation_workdays DROP COLUMN shift_code_snapshot;
END;
GO

IF COL_LENGTH(N'dbo.operation_workdays', N'operation_shift_id') IS NOT NULL
BEGIN
    ALTER TABLE dbo.operation_workdays DROP COLUMN operation_shift_id;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_scheduled_operations_schedule_mode'
)
BEGIN
    ALTER TABLE dbo.scheduled_operations DROP CONSTRAINT CK_scheduled_operations_schedule_mode;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.default_constraints
    WHERE name = N'DF_scheduled_operations_schedule_mode'
      AND parent_object_id = OBJECT_ID(N'dbo.scheduled_operations')
)
BEGIN
    ALTER TABLE dbo.scheduled_operations DROP CONSTRAINT DF_scheduled_operations_schedule_mode;
END;
GO

IF COL_LENGTH(N'dbo.scheduled_operations', N'schedule_mode') IS NOT NULL
BEGIN
    ALTER TABLE dbo.scheduled_operations DROP COLUMN schedule_mode;
END;
GO

IF OBJECT_ID(N'dbo.operation_shifts', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.operation_shifts;
END;
GO

IF OBJECT_ID(N'dbo.company_shift_templates', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.company_shift_templates;
END;
GO
