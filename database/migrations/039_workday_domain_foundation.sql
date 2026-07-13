-- Phase 1: Workday domain foundation — operation_workdays, employee_workdays, attendance linkage.
-- Canonical migration timezone policy (no env vars in SQL):
--   company_settings.operation_timezone (IANA, as stored by the app)
--   -> companies.default_timezone
--   -> N'America/Argentina/Buenos_Aires' (application DEFAULT_COMPANY_OPERATIONAL_SETTINGS.operationTimezone)
--
-- SQL Server AT TIME ZONE requires Windows timezone names. IANA values are mapped via
-- dbo.fn_resolve_operation_timezone_for_sql before use in AT TIME ZONE.

CREATE OR ALTER FUNCTION dbo.fn_resolve_operation_timezone_for_sql(@timezone NVARCHAR(80))
RETURNS NVARCHAR(80)
AS
BEGIN
    DECLARE @normalized NVARCHAR(80) = LTRIM(RTRIM(ISNULL(@timezone, N'')));

    IF @normalized = N''
        RETURN N'Argentina Standard Time';

    IF @normalized NOT LIKE N'%/%'
        RETURN @normalized;

    RETURN CASE @normalized
        WHEN N'America/Argentina/Buenos_Aires' THEN N'Argentina Standard Time'
        WHEN N'America/Argentina/Cordoba' THEN N'Argentina Standard Time'
        WHEN N'America/Argentina/Mendoza' THEN N'Argentina Standard Time'
        WHEN N'America/Argentina/La_Rioja' THEN N'Argentina Standard Time'
        WHEN N'America/Argentina/San_Juan' THEN N'Argentina Standard Time'
        WHEN N'America/Argentina/Jujuy' THEN N'Argentina Standard Time'
        WHEN N'America/Argentina/Tucuman' THEN N'Argentina Standard Time'
        WHEN N'America/Argentina/Catamarca' THEN N'Argentina Standard Time'
        WHEN N'America/Argentina/Salta' THEN N'Argentina Standard Time'
        WHEN N'America/Argentina/Ushuaia' THEN N'Argentina Standard Time'
        WHEN N'America/Argentina/Rio_Gallegos' THEN N'Argentina Standard Time'
        WHEN N'UTC' THEN N'UTC'
        ELSE N'Argentina Standard Time'
    END;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.scheduled_operations') AND name = 'operation_kind'
)
BEGIN
    ALTER TABLE dbo.scheduled_operations
        ADD operation_kind NVARCHAR(20) NOT NULL
            CONSTRAINT DF_scheduled_operations_operation_kind DEFAULT N'ONE_TIME';
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_scheduled_operations_operation_kind'
      AND parent_object_id = OBJECT_ID('dbo.scheduled_operations')
)
BEGIN
    ALTER TABLE dbo.scheduled_operations
        ADD CONSTRAINT CK_scheduled_operations_operation_kind
        CHECK (operation_kind IN (N'ONE_TIME', N'RECURRING'));
END;
GO

UPDATE dbo.scheduled_operations
SET operation_kind = N'ONE_TIME'
WHERE operation_kind IS NULL OR operation_kind = N'';
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'operation_workdays')
BEGIN
    CREATE TABLE dbo.operation_workdays (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_operation_workdays PRIMARY KEY DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        operation_id UNIQUEIDENTIFIER NOT NULL,
        work_date DATE NOT NULL,
        expected_start_at DATETIME2 NOT NULL,
        expected_end_at DATETIME2 NULL,
        early_tolerance_minutes INT NOT NULL,
        late_tolerance_minutes INT NOT NULL,
        schedule_version INT NOT NULL CONSTRAINT DF_operation_workdays_schedule_version DEFAULT 1,
        status NVARCHAR(20) NOT NULL CONSTRAINT DF_operation_workdays_status DEFAULT N'ACTIVE',
        created_at DATETIME2 NOT NULL CONSTRAINT DF_operation_workdays_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL CONSTRAINT DF_operation_workdays_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_operation_workdays_company
            FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
        CONSTRAINT FK_operation_workdays_operation
            FOREIGN KEY (operation_id) REFERENCES dbo.scheduled_operations (id),
        CONSTRAINT CK_operation_workdays_status
            CHECK (status IN (N'ACTIVE', N'CANCELLED')),
        CONSTRAINT CK_operation_workdays_early_tolerance
            CHECK (early_tolerance_minutes >= 0),
        CONSTRAINT CK_operation_workdays_late_tolerance
            CHECK (late_tolerance_minutes >= 0),
        CONSTRAINT CK_operation_workdays_schedule_version
            CHECK (schedule_version >= 1),
        CONSTRAINT UQ_operation_workdays_operation_work_date
            UNIQUE (operation_id, work_date)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UQ_operation_workdays_company_id'
      AND object_id = OBJECT_ID('dbo.operation_workdays')
)
BEGIN
    CREATE UNIQUE INDEX UQ_operation_workdays_company_id
        ON dbo.operation_workdays (company_id, id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_operation_workdays_company_operation'
      AND object_id = OBJECT_ID('dbo.operation_workdays')
)
BEGIN
    CREATE INDEX IX_operation_workdays_company_operation
        ON dbo.operation_workdays (company_id, operation_id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UQ_scheduled_operations_company_id'
      AND object_id = OBJECT_ID('dbo.scheduled_operations')
)
BEGIN
    CREATE UNIQUE INDEX UQ_scheduled_operations_company_id
        ON dbo.scheduled_operations (company_id, id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UQ_employees_company_id'
      AND object_id = OBJECT_ID('dbo.employees')
)
BEGIN
    CREATE UNIQUE INDEX UQ_employees_company_id
        ON dbo.employees (company_id, id);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'employee_workdays')
BEGIN
    CREATE TABLE dbo.employee_workdays (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_employee_workdays PRIMARY KEY DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        operation_workday_id UNIQUEIDENTIFIER NOT NULL,
        employee_id UNIQUEIDENTIFIER NOT NULL,
        expectation_status NVARCHAR(20) NOT NULL
            CONSTRAINT DF_employee_workdays_expectation_status DEFAULT N'EXPECTED',
        absence_request_id UNIQUEIDENTIFIER NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_employee_workdays_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL CONSTRAINT DF_employee_workdays_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_employee_workdays_company
            FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
        CONSTRAINT FK_employee_workdays_operation_workday_tenant
            FOREIGN KEY (company_id, operation_workday_id)
            REFERENCES dbo.operation_workdays (company_id, id),
        CONSTRAINT FK_employee_workdays_employee_tenant
            FOREIGN KEY (company_id, employee_id)
            REFERENCES dbo.employees (company_id, id),
        CONSTRAINT CK_employee_workdays_expectation_status
            CHECK (expectation_status IN (N'EXPECTED', N'JUSTIFIED', N'CANCELLED')),
        CONSTRAINT UQ_employee_workdays_workday_employee
            UNIQUE (operation_workday_id, employee_id)
    );
END;
GO

-- Dev/partial rerun: drop redundant operation_id if an earlier 039 draft created it.
IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.employee_workdays') AND name = 'operation_id'
)
BEGIN
    IF EXISTS (
        SELECT 1 FROM sys.foreign_keys
        WHERE name = 'FK_employee_workdays_operation'
          AND parent_object_id = OBJECT_ID('dbo.employee_workdays')
    )
    BEGIN
        ALTER TABLE dbo.employee_workdays DROP CONSTRAINT FK_employee_workdays_operation;
    END;

    ALTER TABLE dbo.employee_workdays DROP COLUMN operation_id;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UQ_employee_workdays_company_id'
      AND object_id = OBJECT_ID('dbo.employee_workdays')
)
BEGIN
    CREATE UNIQUE INDEX UQ_employee_workdays_company_id
        ON dbo.employee_workdays (company_id, id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_employee_workdays_company_employee'
      AND object_id = OBJECT_ID('dbo.employee_workdays')
)
BEGIN
    CREATE INDEX IX_employee_workdays_company_employee
        ON dbo.employee_workdays (company_id, employee_id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.attendance_records') AND name = 'employee_workday_id'
)
BEGIN
    ALTER TABLE dbo.attendance_records
        ADD employee_workday_id UNIQUEIDENTIFIER NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = 'FK_attendance_records_employee_workday_tenant'
      AND parent_object_id = OBJECT_ID('dbo.attendance_records')
)
BEGIN
    IF EXISTS (
        SELECT 1 FROM sys.foreign_keys
        WHERE name = 'FK_attendance_records_employee_workday'
          AND parent_object_id = OBJECT_ID('dbo.attendance_records')
    )
    BEGIN
        ALTER TABLE dbo.attendance_records DROP CONSTRAINT FK_attendance_records_employee_workday;
    END;

    ALTER TABLE dbo.attendance_records
        ADD CONSTRAINT FK_attendance_records_employee_workday_tenant
        FOREIGN KEY (company_id, employee_workday_id)
        REFERENCES dbo.employee_workdays (company_id, id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_attendance_records_simulation_session'
      AND parent_object_id = OBJECT_ID('dbo.attendance_records')
)
AND NOT EXISTS (
    SELECT 1
    FROM dbo.attendance_records
    WHERE (is_simulation = 0 AND simulation_session_id IS NOT NULL)
       OR (is_simulation = 1 AND simulation_session_id IS NULL)
)
BEGIN
    ALTER TABLE dbo.attendance_records
        ADD CONSTRAINT CK_attendance_records_simulation_session
        CHECK (
            (is_simulation = 0 AND simulation_session_id IS NULL)
            OR (is_simulation = 1 AND simulation_session_id IS NOT NULL)
        );
END;
GO

-- Materialize operation_workdays for existing ONE_TIME operations.
INSERT INTO dbo.operation_workdays (
    company_id,
    operation_id,
    work_date,
    expected_start_at,
    expected_end_at,
    early_tolerance_minutes,
    late_tolerance_minutes,
    schedule_version,
    status
)
SELECT
    o.company_id,
    o.id,
    CAST(
        (o.scheduled_start AT TIME ZONE 'UTC') AT TIME ZONE
        dbo.fn_resolve_operation_timezone_for_sql(
            COALESCE(
                NULLIF(cs.operation_timezone, N''),
                NULLIF(c.default_timezone, N''),
                N'America/Argentina/Buenos_Aires'
            )
        )
        AS DATE
    ),
    o.scheduled_start,
    o.scheduled_end,
    o.early_tolerance_minutes,
    o.late_tolerance_minutes,
    1,
    CASE WHEN o.status = N'CANCELLED' THEN N'CANCELLED' ELSE N'ACTIVE' END
FROM dbo.scheduled_operations o
INNER JOIN dbo.companies c ON c.id = o.company_id
LEFT JOIN dbo.company_settings cs ON cs.company_id = o.company_id
WHERE o.operation_kind = N'ONE_TIME'
  AND NOT EXISTS (
      SELECT 1
      FROM dbo.operation_workdays ow
      WHERE ow.operation_id = o.id
  );
GO

IF EXISTS (
    SELECT 1
    FROM dbo.scheduled_operations o
    WHERE o.operation_kind = N'ONE_TIME'
    GROUP BY o.id
    HAVING (
        SELECT COUNT(*)
        FROM dbo.operation_workdays ow
        WHERE ow.operation_id = o.id
    ) > 1
)
BEGIN
    THROW 51039, 'ONE_TIME operation has multiple operation_workdays after backfill', 1;
END;
GO

IF EXISTS (
    SELECT 1
    FROM dbo.scheduled_operations o
    INNER JOIN dbo.operation_workdays ow ON ow.operation_id = o.id
    INNER JOIN dbo.companies c ON c.id = o.company_id
    LEFT JOIN dbo.company_settings cs ON cs.company_id = o.company_id
    WHERE o.operation_kind = N'ONE_TIME'
      AND ow.work_date <> CAST(
          (o.scheduled_start AT TIME ZONE 'UTC') AT TIME ZONE
          dbo.fn_resolve_operation_timezone_for_sql(
              COALESCE(
                  NULLIF(cs.operation_timezone, N''),
                  NULLIF(c.default_timezone, N''),
                  N'America/Argentina/Buenos_Aires'
              )
          )
          AS DATE
      )
)
BEGIN
    THROW 51039, 'operation_workdays.work_date does not match canonical migration timezone policy', 1;
END;
GO

INSERT INTO dbo.employee_workdays (
    company_id,
    operation_workday_id,
    employee_id,
    expectation_status
)
SELECT
    ow.company_id,
    ow.id,
    ie.employee_id,
    N'EXPECTED'
FROM dbo.operation_workdays ow
INNER JOIN dbo.operation_assignments ie
    ON ie.operation_id = ow.operation_id
   AND ie.company_id = ow.company_id
WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.employee_workdays ew
    WHERE ew.operation_workday_id = ow.id
      AND ew.employee_id = ie.employee_id
);
GO

INSERT INTO dbo.employee_workdays (
    company_id,
    operation_workday_id,
    employee_id,
    expectation_status
)
SELECT
    ow.company_id,
    ow.id,
    ar.employee_id,
    N'EXPECTED'
FROM dbo.attendance_records ar
INNER JOIN dbo.operation_workdays ow
    ON ow.operation_id = ar.operation_id
   AND ow.company_id = ar.company_id
WHERE ar.employee_workday_id IS NULL
  AND NOT EXISTS (
      SELECT 1
      FROM dbo.employee_workdays ew
      WHERE ew.operation_workday_id = ow.id
        AND ew.employee_id = ar.employee_id
  )
GROUP BY ow.company_id, ow.id, ar.employee_id;
GO

UPDATE ar
SET ar.employee_workday_id = ew.id
FROM dbo.attendance_records ar
INNER JOIN dbo.operation_workdays ow
    ON ow.operation_id = ar.operation_id
   AND ow.company_id = ar.company_id
INNER JOIN dbo.employee_workdays ew
    ON ew.operation_workday_id = ow.id
   AND ew.employee_id = ar.employee_id
   AND ew.company_id = ar.company_id
WHERE ar.employee_workday_id IS NULL;
GO

IF EXISTS (
    SELECT 1
    FROM dbo.attendance_records ar
    WHERE ar.validation_status IN (N'VALID', N'PENDING_REVIEW')
      AND ar.employee_workday_id IS NULL
)
BEGIN
    THROW 51039, 'Active attendance records without employee_workday_id remain after backfill', 1;
END;
GO

IF EXISTS (
    SELECT 1
    FROM dbo.attendance_records ar
    INNER JOIN dbo.employee_workdays ew ON ew.id = ar.employee_workday_id
    WHERE ar.employee_id <> ew.employee_id
       OR ar.company_id <> ew.company_id
)
BEGIN
    THROW 51039, 'Attendance employee_workday_id does not match attendance employee/company', 1;
END;
GO

IF EXISTS (
    SELECT 1
    FROM dbo.attendance_records ar
    INNER JOIN dbo.employee_workdays ew ON ew.id = ar.employee_workday_id
    INNER JOIN dbo.operation_workdays ow ON ow.id = ew.operation_workday_id
    WHERE ar.operation_id <> ow.operation_id
)
BEGIN
    THROW 51039, 'Attendance operation_id does not match employee_workday operation', 1;
END;
GO

IF EXISTS (
    SELECT employee_workday_id
    FROM dbo.attendance_records
    WHERE employee_workday_id IS NOT NULL
      AND is_simulation = 0
      AND validation_status IN (N'VALID', N'PENDING_REVIEW')
    GROUP BY employee_workday_id
    HAVING COUNT(*) > 1
)
BEGIN
    THROW 51039, 'Duplicate active real attendance per employee_workday before index migration', 1;
END;
GO

IF EXISTS (
    SELECT employee_workday_id, simulation_session_id
    FROM dbo.attendance_records
    WHERE employee_workday_id IS NOT NULL
      AND is_simulation = 1
      AND simulation_session_id IS NOT NULL
      AND validation_status IN (N'VALID', N'PENDING_REVIEW')
    GROUP BY employee_workday_id, simulation_session_id
    HAVING COUNT(*) > 1
)
BEGIN
    THROW 51039, 'Duplicate active simulated attendance per employee_workday/session before index migration', 1;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UX_attendance_records_employee_workday_active'
      AND object_id = OBJECT_ID('dbo.attendance_records')
)
BEGIN
    DROP INDEX UX_attendance_records_employee_workday_active ON dbo.attendance_records;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UX_attendance_records_operation_employee_active'
      AND object_id = OBJECT_ID('dbo.attendance_records')
)
BEGIN
    DROP INDEX UX_attendance_records_operation_employee_active ON dbo.attendance_records;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UX_attendance_records_employee_workday_active_real'
      AND object_id = OBJECT_ID('dbo.attendance_records')
)
BEGIN
    CREATE UNIQUE INDEX UX_attendance_records_employee_workday_active_real
        ON dbo.attendance_records (employee_workday_id)
        WHERE employee_workday_id IS NOT NULL
          AND is_simulation = 0
          AND validation_status IN (N'VALID', N'PENDING_REVIEW');
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UX_attendance_records_employee_workday_active_simulation'
      AND object_id = OBJECT_ID('dbo.attendance_records')
)
BEGIN
    CREATE UNIQUE INDEX UX_attendance_records_employee_workday_active_simulation
        ON dbo.attendance_records (employee_workday_id, simulation_session_id)
        WHERE employee_workday_id IS NOT NULL
          AND is_simulation = 1
          AND simulation_session_id IS NOT NULL
          AND validation_status IN (N'VALID', N'PENDING_REVIEW');
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_attendance_records_employee_workday_id'
      AND object_id = OBJECT_ID('dbo.attendance_records')
)
BEGIN
    CREATE INDEX IX_attendance_records_employee_workday_id
        ON dbo.attendance_records (employee_workday_id);
END;
GO
