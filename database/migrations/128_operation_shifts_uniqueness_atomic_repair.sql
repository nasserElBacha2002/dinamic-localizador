/*
  Migration: 128_operation_shifts_uniqueness_atomic_repair.sql

  Phase 1 correction — ensure workday uniqueness swap is complete for databases
  that already applied 127 before the atomic uniqueness batch was hardened.

  Idempotent: no-op when filtered UXs exist and legacy UQ is gone.
  Same TABLOCKX + single-batch verify semantics as 127.

  Rollback: none (repair only; use 127 rollback when Phase 1 data is empty).
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.operation_workdays', N'U') IS NULL
BEGIN
    THROW 50128, 'Precondition failed: operation_workdays missing', 1;
END;
GO

SET XACT_ABORT ON;

DECLARE @hasLegacyUq BIT = CASE
    WHEN EXISTS (
        SELECT 1 FROM sys.key_constraints
        WHERE name = N'UQ_operation_workdays_operation_work_date'
          AND parent_object_id = OBJECT_ID(N'dbo.operation_workdays')
    ) OR EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'UQ_operation_workdays_operation_work_date'
          AND object_id = OBJECT_ID(N'dbo.operation_workdays')
    ) THEN 1 ELSE 0 END;

DECLARE @hasSingleUx BIT = CASE
    WHEN EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'UX_operation_workdays_single_op_date'
          AND object_id = OBJECT_ID(N'dbo.operation_workdays')
    ) THEN 1 ELSE 0 END;

DECLARE @hasMultiUx BIT = CASE
    WHEN EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'UX_operation_workdays_multi_op_date_shift'
          AND object_id = OBJECT_ID(N'dbo.operation_workdays')
    ) THEN 1 ELSE 0 END;

IF NOT (@hasSingleUx = 1 AND @hasMultiUx = 1 AND @hasLegacyUq = 0)
BEGIN
    SELECT TOP (0) 1 AS lock_probe
    FROM dbo.operation_workdays WITH (TABLOCKX);

    IF EXISTS (
        SELECT operation_id, work_date
        FROM dbo.operation_workdays
        WHERE operation_shift_id IS NULL
        GROUP BY operation_id, work_date
        HAVING COUNT(*) > 1
    )
    BEGIN
        THROW 50128, 'Repair preflight failed: duplicate SINGLE workdays', 1;
    END;

    IF EXISTS (
        SELECT operation_id, work_date, operation_shift_id
        FROM dbo.operation_workdays
        WHERE operation_shift_id IS NOT NULL
        GROUP BY operation_id, work_date, operation_shift_id
        HAVING COUNT(*) > 1
    )
    BEGIN
        THROW 50128, 'Repair preflight failed: duplicate MULTI workdays', 1;
    END;

    IF EXISTS (
        SELECT 1 FROM sys.key_constraints
        WHERE name = N'UQ_operation_workdays_operation_work_date'
          AND parent_object_id = OBJECT_ID(N'dbo.operation_workdays')
    )
    BEGIN
        ALTER TABLE dbo.operation_workdays
            DROP CONSTRAINT UQ_operation_workdays_operation_work_date;
    END;

    IF EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'UQ_operation_workdays_operation_work_date'
          AND object_id = OBJECT_ID(N'dbo.operation_workdays')
    )
    BEGIN
        DROP INDEX UQ_operation_workdays_operation_work_date ON dbo.operation_workdays;
    END;

    IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'UX_operation_workdays_single_op_date'
          AND object_id = OBJECT_ID(N'dbo.operation_workdays')
    )
    BEGIN
        CREATE UNIQUE INDEX UX_operation_workdays_single_op_date
            ON dbo.operation_workdays (operation_id, work_date)
            WHERE operation_shift_id IS NULL;
    END;

    IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'UX_operation_workdays_multi_op_date_shift'
          AND object_id = OBJECT_ID(N'dbo.operation_workdays')
    )
    BEGIN
        CREATE UNIQUE INDEX UX_operation_workdays_multi_op_date_shift
            ON dbo.operation_workdays (operation_id, work_date, operation_shift_id)
            WHERE operation_shift_id IS NOT NULL;
    END;
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UX_operation_workdays_single_op_date'
      AND object_id = OBJECT_ID(N'dbo.operation_workdays')
)
OR NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UX_operation_workdays_multi_op_date_shift'
      AND object_id = OBJECT_ID(N'dbo.operation_workdays')
)
OR EXISTS (
    SELECT 1 FROM sys.key_constraints
    WHERE name = N'UQ_operation_workdays_operation_work_date'
      AND parent_object_id = OBJECT_ID(N'dbo.operation_workdays')
)
OR EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_operation_workdays_operation_work_date'
      AND object_id = OBJECT_ID(N'dbo.operation_workdays')
)
BEGIN
    THROW 50128, 'Uniqueness repair incomplete: expected filtered UXs present and legacy UQ absent', 1;
END;
GO
