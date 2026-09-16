/*
  Rollback: 129_operation_shifts_versioned_core_rollback.sql

  Restores Phase 1 embedded times on operation_shifts ONLY when:
    - no MULTI_SHIFT operations
    - no workdays referencing operation_shift_version_id
    - no date exceptions
    - at most one version per shift (to fold back into Phase 1 columns)

  All guards run before destructive DDL.
*/

USE dinamic_attendance;
GO

SET XACT_ABORT ON;
GO

IF EXISTS (
    SELECT 1 FROM dbo.scheduled_operations WHERE schedule_mode = N'MULTI_SHIFT'
)
BEGIN
    THROW 50129, 'Rollback blocked: MULTI_SHIFT operations exist', 1;
END;
GO

IF COL_LENGTH(N'dbo.operation_workdays', N'operation_shift_version_id') IS NOT NULL
   AND EXISTS (SELECT 1 FROM dbo.operation_workdays WHERE operation_shift_version_id IS NOT NULL)
BEGIN
    THROW 50129, 'Rollback blocked: workdays reference operation_shift_version_id', 1;
END;
GO

IF OBJECT_ID(N'dbo.operation_shift_date_exceptions', N'U') IS NOT NULL
   AND EXISTS (SELECT 1 FROM dbo.operation_shift_date_exceptions)
BEGIN
    THROW 50129, 'Rollback blocked: operation_shift_date_exceptions rows exist', 1;
END;
GO

IF OBJECT_ID(N'dbo.operation_shift_versions', N'U') IS NOT NULL
   AND EXISTS (
        SELECT operation_shift_id
        FROM dbo.operation_shift_versions
        GROUP BY operation_shift_id
        HAVING COUNT(*) > 1
   )
BEGIN
    THROW 50129, 'Rollback blocked: shifts with multiple versions cannot fold into Phase 1 columns', 1;
END;
GO

/* -------- Destructive section -------- */

IF OBJECT_ID(N'dbo.operation_shift_date_exceptions', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.operation_shift_date_exceptions;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_operation_workdays_shift_version_shift_tenant'
)
BEGIN
    ALTER TABLE dbo.operation_workdays DROP CONSTRAINT FK_operation_workdays_shift_version_shift_tenant;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_operation_workdays_shift_version_tenant'
)
BEGIN
    ALTER TABLE dbo.operation_workdays DROP CONSTRAINT FK_operation_workdays_shift_version_tenant;
END;
GO

IF COL_LENGTH(N'dbo.operation_workdays', N'operation_shift_version_id') IS NOT NULL
BEGIN
    ALTER TABLE dbo.operation_workdays DROP COLUMN operation_shift_version_id;
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

ALTER TABLE dbo.operation_workdays
    ADD CONSTRAINT CK_operation_workdays_shift_snapshot_pair
        CHECK (
            (
                operation_shift_id IS NULL
                AND shift_code_snapshot IS NULL
                AND shift_name_snapshot IS NULL
            )
            OR (
                operation_shift_id IS NOT NULL
                AND shift_code_snapshot IS NOT NULL
                AND LEN(LTRIM(RTRIM(shift_code_snapshot))) > 0
                AND shift_name_snapshot IS NOT NULL
                AND LEN(LTRIM(RTRIM(shift_name_snapshot))) > 0
            )
        );
GO

/* Restore Phase 1 columns on operation_shifts */
IF COL_LENGTH(N'dbo.operation_shifts', N'start_time') IS NULL
BEGIN
    ALTER TABLE dbo.operation_shifts ADD start_time TIME NULL;
END;
GO

IF COL_LENGTH(N'dbo.operation_shifts', N'end_time') IS NULL
BEGIN
    ALTER TABLE dbo.operation_shifts ADD end_time TIME NULL;
END;
GO

IF COL_LENGTH(N'dbo.operation_shifts', N'effective_from') IS NULL
BEGIN
    ALTER TABLE dbo.operation_shifts ADD effective_from DATE NULL;
END;
GO

IF COL_LENGTH(N'dbo.operation_shifts', N'effective_until') IS NULL
BEGIN
    ALTER TABLE dbo.operation_shifts ADD effective_until DATE NULL;
END;
GO

IF OBJECT_ID(N'dbo.operation_shift_versions', N'U') IS NOT NULL
BEGIN
    UPDATE s
    SET
        s.start_time = v.start_time,
        s.end_time = v.end_time,
        s.effective_from = v.effective_from,
        s.effective_until = v.effective_until
    FROM dbo.operation_shifts s
    INNER JOIN dbo.operation_shift_versions v ON v.operation_shift_id = s.id;
END;
GO

IF EXISTS (SELECT 1 FROM dbo.operation_shifts WHERE start_time IS NULL OR end_time IS NULL OR effective_from IS NULL)
BEGIN
    THROW 50129, 'Rollback blocked: cannot restore NOT NULL times for all shifts', 1;
END;
GO

ALTER TABLE dbo.operation_shifts ALTER COLUMN start_time TIME NOT NULL;
GO
ALTER TABLE dbo.operation_shifts ALTER COLUMN end_time TIME NOT NULL;
GO
ALTER TABLE dbo.operation_shifts ALTER COLUMN effective_from DATE NOT NULL;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_operation_shifts_times'
)
BEGIN
    ALTER TABLE dbo.operation_shifts
        ADD CONSTRAINT CK_operation_shifts_times CHECK (start_time <> end_time);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_operation_shifts_effective_range'
)
BEGIN
    ALTER TABLE dbo.operation_shifts
        ADD CONSTRAINT CK_operation_shifts_effective_range
            CHECK (effective_until IS NULL OR effective_until >= effective_from);
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_operation_shifts_operation_code'
      AND object_id = OBJECT_ID(N'dbo.operation_shifts')
)
BEGIN
    DROP INDEX UQ_operation_shifts_operation_code ON dbo.operation_shifts;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_operation_shifts_operation_code'
      AND object_id = OBJECT_ID(N'dbo.operation_shifts')
)
BEGIN
    CREATE INDEX IX_operation_shifts_operation_code
        ON dbo.operation_shifts (company_id, operation_id, code, effective_from);
END;
GO

IF OBJECT_ID(N'dbo.operation_shift_version_days', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.operation_shift_version_days;
END;
GO

IF OBJECT_ID(N'dbo.operation_shift_versions', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.operation_shift_versions;
END;
GO
