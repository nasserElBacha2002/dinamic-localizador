/*
  Migration: 127_operation_shifts_foundation.sql

  Phase 1 — shift data foundation (additive, backward compatible).
  - company_shift_templates: per-company reusable shift templates
  - operation_shifts: shift definitions bound to an operation (copied from template optional)
  - scheduled_operations.schedule_mode: SINGLE | MULTI_SHIFT (default SINGLE)
  - operation_workdays: optional operation_shift_id + shift snapshots
  - operation_assignments: optional operation_shift_id
  - Replace UQ(operation_id, work_date) with filtered unique indexes:
      SINGLE:  UNIQUE(operation_id, work_date) WHERE operation_shift_id IS NULL
      MULTI:   UNIQUE(operation_id, work_date, operation_shift_id) WHERE operation_shift_id IS NOT NULL

  Backfill: schedule_mode = SINGLE; shift FKs remain NULL on existing rows.
  Does NOT create DEFAULT templates or implicit shifts.
  Does NOT enable productive MULTI_SHIFT flows (app must keep SINGLE until Phase 2).

  Phase 2 note (not enforced in DB):
  - Overlapping effective_from/effective_until ranges for the same
    (operation_id, code) among active rows require transactional UPDLOCK checks.
  - Materialization must key jornadas by (operation_id, work_date, operation_shift_id).

  Rollback: rollback/127_operation_shifts_foundation_rollback.sql
    Safe only while no MULTI_SHIFT workdays/assignments/shifts exist (or after cleanup).
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.scheduled_operations', N'U') IS NULL
   OR OBJECT_ID(N'dbo.operation_workdays', N'U') IS NULL
   OR OBJECT_ID(N'dbo.operation_assignments', N'U') IS NULL
BEGIN
    THROW 50127, 'Precondition failed: core operation tables missing', 1;
END;
GO

/* ---------------------------------------------------------------------------
   Preflight (pre-swap only): while the legacy UQ still governs, (op, work_date)
   must be unique across all rows. Skip once filtered indexes fully replaced it
   so legitimate MULTI_SHIFT rows do not fail re-runs / repair.
--------------------------------------------------------------------------- */
IF EXISTS (
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
    IF EXISTS (
        SELECT operation_id, work_date
        FROM dbo.operation_workdays
        GROUP BY operation_id, work_date
        HAVING COUNT(*) > 1
    )
    BEGIN
        THROW 50127, 'Preflight failed: duplicate operation_workdays (operation_id, work_date)', 1;
    END;
END;
GO

/* ---------------------------------------------------------------------------
   company_shift_templates
--------------------------------------------------------------------------- */
IF OBJECT_ID(N'dbo.company_shift_templates', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.company_shift_templates (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_company_shift_templates PRIMARY KEY DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        code NVARCHAR(80) NOT NULL,
        name NVARCHAR(200) NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        sort_order INT NOT NULL
            CONSTRAINT DF_company_shift_templates_sort_order DEFAULT 0,
        is_active BIT NOT NULL
            CONSTRAINT DF_company_shift_templates_is_active DEFAULT 1,
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_company_shift_templates_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL
            CONSTRAINT DF_company_shift_templates_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_company_shift_templates_company
            FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
        CONSTRAINT UQ_company_shift_templates_company_code
            UNIQUE (company_id, code),
        CONSTRAINT CK_company_shift_templates_times
            CHECK (start_time <> end_time),
        CONSTRAINT CK_company_shift_templates_name
            CHECK (LEN(LTRIM(RTRIM(name))) > 0),
        CONSTRAINT CK_company_shift_templates_code
            CHECK (LEN(LTRIM(RTRIM(code))) > 0)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_company_shift_templates_company_id'
      AND object_id = OBJECT_ID(N'dbo.company_shift_templates')
)
BEGIN
    CREATE UNIQUE INDEX UQ_company_shift_templates_company_id
        ON dbo.company_shift_templates (company_id, id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_company_shift_templates_company_active'
      AND object_id = OBJECT_ID(N'dbo.company_shift_templates')
)
BEGIN
    CREATE INDEX IX_company_shift_templates_company_active
        ON dbo.company_shift_templates (company_id, is_active, sort_order);
END;
GO

/* ---------------------------------------------------------------------------
   operation_shifts
--------------------------------------------------------------------------- */
IF OBJECT_ID(N'dbo.operation_shifts', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.operation_shifts (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_operation_shifts PRIMARY KEY DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        operation_id UNIQUEIDENTIFIER NOT NULL,
        template_id UNIQUEIDENTIFIER NULL,
        code NVARCHAR(80) NOT NULL,
        name NVARCHAR(200) NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        effective_from DATE NOT NULL,
        effective_until DATE NULL,
        sort_order INT NOT NULL
            CONSTRAINT DF_operation_shifts_sort_order DEFAULT 0,
        is_active BIT NOT NULL
            CONSTRAINT DF_operation_shifts_is_active DEFAULT 1,
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_operation_shifts_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL
            CONSTRAINT DF_operation_shifts_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_operation_shifts_company
            FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
        CONSTRAINT FK_operation_shifts_operation_tenant
            FOREIGN KEY (company_id, operation_id)
            REFERENCES dbo.scheduled_operations (company_id, id),
        CONSTRAINT CK_operation_shifts_times
            CHECK (start_time <> end_time),
        CONSTRAINT CK_operation_shifts_effective_range
            CHECK (effective_until IS NULL OR effective_until >= effective_from),
        CONSTRAINT CK_operation_shifts_name
            CHECK (LEN(LTRIM(RTRIM(name))) > 0),
        CONSTRAINT CK_operation_shifts_code
            CHECK (LEN(LTRIM(RTRIM(code))) > 0)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_operation_shifts_template_tenant'
      AND parent_object_id = OBJECT_ID(N'dbo.operation_shifts')
)
   AND OBJECT_ID(N'dbo.company_shift_templates', N'U') IS NOT NULL
BEGIN
    ALTER TABLE dbo.operation_shifts
        ADD CONSTRAINT FK_operation_shifts_template_tenant
            FOREIGN KEY (company_id, template_id)
            REFERENCES dbo.company_shift_templates (company_id, id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_operation_shifts_company_operation_id'
      AND object_id = OBJECT_ID(N'dbo.operation_shifts')
)
BEGIN
    CREATE UNIQUE INDEX UQ_operation_shifts_company_operation_id
        ON dbo.operation_shifts (company_id, operation_id, id);
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

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_operation_shifts_operation_active'
      AND object_id = OBJECT_ID(N'dbo.operation_shifts')
)
BEGIN
    CREATE INDEX IX_operation_shifts_operation_active
        ON dbo.operation_shifts (company_id, operation_id, is_active, sort_order);
END;
GO

/* ---------------------------------------------------------------------------
   scheduled_operations.schedule_mode
--------------------------------------------------------------------------- */
IF COL_LENGTH(N'dbo.scheduled_operations', N'schedule_mode') IS NULL
BEGIN
    ALTER TABLE dbo.scheduled_operations
        ADD schedule_mode NVARCHAR(20) NOT NULL
            CONSTRAINT DF_scheduled_operations_schedule_mode DEFAULT N'SINGLE';
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_scheduled_operations_schedule_mode'
      AND parent_object_id = OBJECT_ID(N'dbo.scheduled_operations')
)
BEGIN
    ALTER TABLE dbo.scheduled_operations DROP CONSTRAINT CK_scheduled_operations_schedule_mode;
END;
GO

ALTER TABLE dbo.scheduled_operations
    ADD CONSTRAINT CK_scheduled_operations_schedule_mode
        CHECK (schedule_mode IN (N'SINGLE', N'MULTI_SHIFT'));
GO

UPDATE dbo.scheduled_operations
SET schedule_mode = N'SINGLE'
WHERE schedule_mode IS NULL OR LTRIM(RTRIM(schedule_mode)) = N'';
GO

/* ---------------------------------------------------------------------------
   operation_workdays shift columns
--------------------------------------------------------------------------- */
IF COL_LENGTH(N'dbo.operation_workdays', N'operation_shift_id') IS NULL
BEGIN
    ALTER TABLE dbo.operation_workdays
        ADD operation_shift_id UNIQUEIDENTIFIER NULL;
END;
GO

IF COL_LENGTH(N'dbo.operation_workdays', N'shift_code_snapshot') IS NULL
BEGIN
    ALTER TABLE dbo.operation_workdays
        ADD shift_code_snapshot NVARCHAR(80) NULL;
END;
GO

IF COL_LENGTH(N'dbo.operation_workdays', N'shift_name_snapshot') IS NULL
BEGIN
    ALTER TABLE dbo.operation_workdays
        ADD shift_name_snapshot NVARCHAR(200) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_operation_workdays_shift_tenant'
      AND parent_object_id = OBJECT_ID(N'dbo.operation_workdays')
)
BEGIN
    ALTER TABLE dbo.operation_workdays
        ADD CONSTRAINT FK_operation_workdays_shift_tenant
            FOREIGN KEY (company_id, operation_id, operation_shift_id)
            REFERENCES dbo.operation_shifts (company_id, operation_id, id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_operation_workdays_shift_snapshot_pair'
      AND parent_object_id = OBJECT_ID(N'dbo.operation_workdays')
)
BEGIN
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
END;
GO

/* ---------------------------------------------------------------------------
   operation_assignments.operation_shift_id
--------------------------------------------------------------------------- */
IF COL_LENGTH(N'dbo.operation_assignments', N'operation_shift_id') IS NULL
BEGIN
    ALTER TABLE dbo.operation_assignments
        ADD operation_shift_id UNIQUEIDENTIFIER NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_operation_assignments_shift_tenant'
      AND parent_object_id = OBJECT_ID(N'dbo.operation_assignments')
)
BEGIN
    ALTER TABLE dbo.operation_assignments
        ADD CONSTRAINT FK_operation_assignments_shift_tenant
            FOREIGN KEY (company_id, operation_id, operation_shift_id)
            REFERENCES dbo.operation_shifts (company_id, operation_id, id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_operation_assignments_shift'
      AND object_id = OBJECT_ID(N'dbo.operation_assignments')
)
BEGIN
    CREATE INDEX IX_operation_assignments_shift
        ON dbo.operation_assignments (company_id, operation_id, operation_shift_id)
        WHERE operation_shift_id IS NOT NULL;
END;
GO

/* ---------------------------------------------------------------------------
   ATOMIC uniqueness swap (single batch — no GO inside).
   Runner wraps the full script in one TDS transaction + SET XACT_ABORT ON.
   This batch also takes TABLOCKX so concurrent writers cannot race the window
   between DROP of the legacy UQ and CREATE of the filtered indexes.
   Idempotent / recoverable if a prior attempt left a partial index set.
--------------------------------------------------------------------------- */
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
    /* Block concurrent DML on workdays for the duration of this batch/tx. */
    SELECT TOP (0) 1 AS lock_probe
    FROM dbo.operation_workdays WITH (TABLOCKX);

    /* Preflight scoped to the uniqueness rules we are about to enforce. */
    IF EXISTS (
        SELECT operation_id, work_date
        FROM dbo.operation_workdays
        WHERE operation_shift_id IS NULL
        GROUP BY operation_id, work_date
        HAVING COUNT(*) > 1
    )
    BEGIN
        THROW 50127, 'Uniqueness swap preflight failed: duplicate SINGLE workdays (operation_id, work_date)', 1;
    END;

    IF EXISTS (
        SELECT operation_id, work_date, operation_shift_id
        FROM dbo.operation_workdays
        WHERE operation_shift_id IS NOT NULL
        GROUP BY operation_id, work_date, operation_shift_id
        HAVING COUNT(*) > 1
    )
    BEGIN
        THROW 50127, 'Uniqueness swap preflight failed: duplicate MULTI workdays (operation_id, work_date, operation_shift_id)', 1;
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

/* Hard verify — never report success with missing uniqueness guarantees. */
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
    THROW 50127, 'Uniqueness migration incomplete: expected filtered UXs present and legacy UQ absent', 1;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_operation_workdays_operation_shift'
      AND object_id = OBJECT_ID(N'dbo.operation_workdays')
)
BEGIN
    CREATE INDEX IX_operation_workdays_operation_shift
        ON dbo.operation_workdays (company_id, operation_id, operation_shift_id, work_date);
END;
GO
