/*
  Migration: 129_operation_shifts_versioned_core.sql

  Phase 2 — stable shift identity + versioned schedule configuration.
  - operation_shifts becomes stable identity (code/name/sort/active); times/vigencia move to versions
  - operation_shift_versions: effective range + start/end times
  - operation_shift_version_days: weekly enabled days (1=Mon … 7=Sun, ISO)
  - operation_workdays.operation_shift_version_id: audit which version materialized the row
  - operation_shift_date_exceptions: per (operation, shift, work_date) overrides that beat rematerialization

  Backfill: any Phase 1 operation_shifts rows with times become one open-ended version + all days enabled.
  Existing SINGLE operations unchanged (schedule_mode remains SINGLE; shift FKs stay NULL).

  Rollback: rollback/129_operation_shifts_versioned_core_rollback.sql
    Safe only when no MULTI_SHIFT ops and no versioned shift data beyond empty catalog.
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.operation_shifts', N'U') IS NULL
BEGIN
    THROW 50129, 'Precondition failed: operation_shifts missing (run 127 first)', 1;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_operation_shifts_company_id'
      AND object_id = OBJECT_ID(N'dbo.operation_shifts')
)
BEGIN
    CREATE UNIQUE INDEX UQ_operation_shifts_company_id
        ON dbo.operation_shifts (company_id, id);
END;
GO

/* ---------------------------------------------------------------------------
   operation_shift_versions
--------------------------------------------------------------------------- */
IF OBJECT_ID(N'dbo.operation_shift_versions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.operation_shift_versions (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_operation_shift_versions PRIMARY KEY DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        operation_shift_id UNIQUEIDENTIFIER NOT NULL,
        effective_from DATE NOT NULL,
        effective_until DATE NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_operation_shift_versions_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL
            CONSTRAINT DF_operation_shift_versions_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_operation_shift_versions_company
            FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
        CONSTRAINT FK_operation_shift_versions_shift_tenant
            FOREIGN KEY (company_id, operation_shift_id)
            REFERENCES dbo.operation_shifts (company_id, id),
        CONSTRAINT CK_operation_shift_versions_times
            CHECK (start_time <> end_time),
        CONSTRAINT CK_operation_shift_versions_effective_range
            CHECK (effective_until IS NULL OR effective_until >= effective_from)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_operation_shift_versions_company_shift_id'
      AND object_id = OBJECT_ID(N'dbo.operation_shift_versions')
)
BEGIN
    CREATE UNIQUE INDEX UQ_operation_shift_versions_company_shift_id
        ON dbo.operation_shift_versions (company_id, operation_shift_id, id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_operation_shift_versions_company_id'
      AND object_id = OBJECT_ID(N'dbo.operation_shift_versions')
)
BEGIN
    CREATE UNIQUE INDEX UQ_operation_shift_versions_company_id
        ON dbo.operation_shift_versions (company_id, id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_operation_shift_versions_shift_effective'
      AND object_id = OBJECT_ID(N'dbo.operation_shift_versions')
)
BEGIN
    CREATE INDEX IX_operation_shift_versions_shift_effective
        ON dbo.operation_shift_versions (company_id, operation_shift_id, effective_from);
END;
GO

/* ---------------------------------------------------------------------------
   operation_shift_version_days
--------------------------------------------------------------------------- */
IF OBJECT_ID(N'dbo.operation_shift_version_days', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.operation_shift_version_days (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_operation_shift_version_days PRIMARY KEY DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        operation_shift_version_id UNIQUEIDENTIFIER NOT NULL,
        day_of_week TINYINT NOT NULL,
        is_enabled BIT NOT NULL
            CONSTRAINT DF_operation_shift_version_days_enabled DEFAULT 1,
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_operation_shift_version_days_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL
            CONSTRAINT DF_operation_shift_version_days_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_operation_shift_version_days_company
            FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
        CONSTRAINT FK_operation_shift_version_days_version_tenant
            FOREIGN KEY (company_id, operation_shift_version_id)
            REFERENCES dbo.operation_shift_versions (company_id, id),
        CONSTRAINT CK_operation_shift_version_days_dow
            CHECK (day_of_week BETWEEN 1 AND 7),
        CONSTRAINT UQ_operation_shift_version_days_version_dow
            UNIQUE (operation_shift_version_id, day_of_week)
    );
END;
GO

/* ---------------------------------------------------------------------------
   Backfill versions from Phase 1 embedded times (if columns still present)
--------------------------------------------------------------------------- */
IF COL_LENGTH(N'dbo.operation_shifts', N'start_time') IS NOT NULL
   AND COL_LENGTH(N'dbo.operation_shifts', N'effective_from') IS NOT NULL
BEGIN
    INSERT INTO dbo.operation_shift_versions (
        company_id, operation_shift_id, effective_from, effective_until, start_time, end_time
    )
    SELECT
        s.company_id,
        s.id,
        s.effective_from,
        s.effective_until,
        s.start_time,
        s.end_time
    FROM dbo.operation_shifts s
    WHERE NOT EXISTS (
        SELECT 1
        FROM dbo.operation_shift_versions v
        WHERE v.operation_shift_id = s.id
    );

    /* All weekdays enabled for backfilled versions that have no days yet. */
    INSERT INTO dbo.operation_shift_version_days (
        company_id, operation_shift_version_id, day_of_week, is_enabled
    )
    SELECT v.company_id, v.id, d.dow, 1
    FROM dbo.operation_shift_versions v
    CROSS JOIN (VALUES (1),(2),(3),(4),(5),(6),(7)) AS d(dow)
    WHERE NOT EXISTS (
        SELECT 1
        FROM dbo.operation_shift_version_days vd
        WHERE vd.operation_shift_version_id = v.id
    );
END;
GO

/* ---------------------------------------------------------------------------
   Drop Phase 1 time/vigencia columns from operation_shifts (stable identity only)
--------------------------------------------------------------------------- */
IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_operation_shifts_times'
      AND parent_object_id = OBJECT_ID(N'dbo.operation_shifts')
)
BEGIN
    ALTER TABLE dbo.operation_shifts DROP CONSTRAINT CK_operation_shifts_times;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_operation_shifts_effective_range'
      AND parent_object_id = OBJECT_ID(N'dbo.operation_shifts')
)
BEGIN
    ALTER TABLE dbo.operation_shifts DROP CONSTRAINT CK_operation_shifts_effective_range;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_operation_shifts_operation_code'
      AND object_id = OBJECT_ID(N'dbo.operation_shifts')
)
BEGIN
    DROP INDEX IX_operation_shifts_operation_code ON dbo.operation_shifts;
END;
GO

IF COL_LENGTH(N'dbo.operation_shifts', N'start_time') IS NOT NULL
BEGIN
    ALTER TABLE dbo.operation_shifts DROP COLUMN start_time;
END;
GO

IF COL_LENGTH(N'dbo.operation_shifts', N'end_time') IS NOT NULL
BEGIN
    ALTER TABLE dbo.operation_shifts DROP COLUMN end_time;
END;
GO

IF COL_LENGTH(N'dbo.operation_shifts', N'effective_from') IS NOT NULL
BEGIN
    ALTER TABLE dbo.operation_shifts DROP COLUMN effective_from;
END;
GO

IF COL_LENGTH(N'dbo.operation_shifts', N'effective_until') IS NOT NULL
BEGIN
    ALTER TABLE dbo.operation_shifts DROP COLUMN effective_until;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_operation_shifts_operation_code'
      AND object_id = OBJECT_ID(N'dbo.operation_shifts')
)
BEGIN
    CREATE UNIQUE INDEX UQ_operation_shifts_operation_code
        ON dbo.operation_shifts (company_id, operation_id, code);
END;
GO

/* ---------------------------------------------------------------------------
   operation_workdays.operation_shift_version_id
--------------------------------------------------------------------------- */
IF COL_LENGTH(N'dbo.operation_workdays', N'operation_shift_version_id') IS NULL
BEGIN
    ALTER TABLE dbo.operation_workdays
        ADD operation_shift_version_id UNIQUEIDENTIFIER NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_operation_workdays_shift_version_tenant'
      AND parent_object_id = OBJECT_ID(N'dbo.operation_workdays')
)
BEGIN
    ALTER TABLE dbo.operation_workdays
        ADD CONSTRAINT FK_operation_workdays_shift_version_tenant
            FOREIGN KEY (company_id, operation_shift_version_id)
            REFERENCES dbo.operation_shift_versions (company_id, id);
END;
GO

/* Snapshot pair: version id only allowed when shift id present. */
IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_operation_workdays_shift_snapshot_pair'
      AND parent_object_id = OBJECT_ID(N'dbo.operation_workdays')
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
                AND operation_shift_version_id IS NULL
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

/* ---------------------------------------------------------------------------
   Date exceptions (beat rematerialization for one shift+date)
--------------------------------------------------------------------------- */
IF OBJECT_ID(N'dbo.operation_shift_date_exceptions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.operation_shift_date_exceptions (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_operation_shift_date_exceptions PRIMARY KEY DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        operation_id UNIQUEIDENTIFIER NOT NULL,
        operation_shift_id UNIQUEIDENTIFIER NOT NULL,
        work_date DATE NOT NULL,
        exception_kind NVARCHAR(40) NOT NULL,
        start_time TIME NULL,
        end_time TIME NULL,
        reason NVARCHAR(500) NULL,
        created_by_user_id UNIQUEIDENTIFIER NULL,
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_operation_shift_date_exceptions_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL
            CONSTRAINT DF_operation_shift_date_exceptions_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_operation_shift_date_exceptions_company
            FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
        CONSTRAINT FK_operation_shift_date_exceptions_operation_tenant
            FOREIGN KEY (company_id, operation_id)
            REFERENCES dbo.scheduled_operations (company_id, id),
        CONSTRAINT FK_operation_shift_date_exceptions_shift_tenant
            FOREIGN KEY (company_id, operation_id, operation_shift_id)
            REFERENCES dbo.operation_shifts (company_id, operation_id, id),
        CONSTRAINT CK_operation_shift_date_exceptions_kind
            CHECK (exception_kind IN (
                N'CANCEL',
                N'TIME_OVERRIDE',
                N'RESTORE'
            )),
        CONSTRAINT CK_operation_shift_date_exceptions_times
            CHECK (
                (exception_kind <> N'TIME_OVERRIDE' AND start_time IS NULL AND end_time IS NULL)
                OR (
                    exception_kind = N'TIME_OVERRIDE'
                    AND start_time IS NOT NULL
                    AND end_time IS NOT NULL
                    AND start_time <> end_time
                )
            ),
        CONSTRAINT UQ_operation_shift_date_exceptions_shift_date
            UNIQUE (operation_id, operation_shift_id, work_date)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_operation_shift_date_exceptions_op_date'
      AND object_id = OBJECT_ID(N'dbo.operation_shift_date_exceptions')
)
BEGIN
    CREATE INDEX IX_operation_shift_date_exceptions_op_date
        ON dbo.operation_shift_date_exceptions (company_id, operation_id, work_date);
END;
GO
