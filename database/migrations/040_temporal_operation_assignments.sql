USE dinamic_attendance;
GO

-- Phase 2: temporal operation assignments with stable IDs and validity periods.

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.operation_assignments') AND name = 'id'
)
BEGIN
    ALTER TABLE dbo.operation_assignments ADD id UNIQUEIDENTIFIER NULL;
END;
GO

UPDATE dbo.operation_assignments
SET id = NEWID()
WHERE id IS NULL;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.operation_assignments') AND name = 'id' AND is_nullable = 1
)
BEGIN
    ALTER TABLE dbo.operation_assignments ALTER COLUMN id UNIQUEIDENTIFIER NOT NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.operation_assignments') AND name = 'valid_from'
)
BEGIN
    ALTER TABLE dbo.operation_assignments ADD valid_from DATE NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.operation_assignments') AND name = 'valid_until'
)
BEGIN
    ALTER TABLE dbo.operation_assignments ADD valid_until DATE NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.operation_assignments') AND name = 'created_at'
)
BEGIN
    ALTER TABLE dbo.operation_assignments
        ADD created_at DATETIME2 NOT NULL
            CONSTRAINT DF_operation_assignments_created_at DEFAULT SYSUTCDATETIME();
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.operation_assignments') AND name = 'updated_at'
)
BEGIN
    ALTER TABLE dbo.operation_assignments
        ADD updated_at DATETIME2 NOT NULL
            CONSTRAINT DF_operation_assignments_updated_at DEFAULT SYSUTCDATETIME();
END;
GO

-- Backfill validity from assigned_at in operation-local calendar date.
UPDATE oa
SET
    valid_from = CAST(
        (oa.assigned_at AT TIME ZONE 'UTC') AT TIME ZONE
        dbo.fn_resolve_operation_timezone_for_sql(
            COALESCE(
                NULLIF(cs.operation_timezone, N''),
                NULLIF(c.default_timezone, N''),
                N'America/Argentina/Buenos_Aires'
            )
        )
        AS DATE
    ),
    created_at = COALESCE(oa.created_at, oa.assigned_at),
    updated_at = COALESCE(oa.updated_at, oa.assigned_at)
FROM dbo.operation_assignments oa
INNER JOIN dbo.scheduled_operations o ON o.id = oa.operation_id AND o.company_id = oa.company_id
INNER JOIN dbo.companies c ON c.id = oa.company_id
LEFT JOIN dbo.company_settings cs ON cs.company_id = oa.company_id
WHERE oa.valid_from IS NULL;
GO

-- Prefer ONE_TIME operation work_date when materialized (more accurate operational day).
UPDATE oa
SET valid_from = ow.work_date
FROM dbo.operation_assignments oa
INNER JOIN dbo.operation_workdays ow
    ON ow.operation_id = oa.operation_id
   AND ow.company_id = oa.company_id
INNER JOIN dbo.scheduled_operations o
    ON o.id = oa.operation_id
   AND o.company_id = oa.company_id
WHERE o.operation_kind = N'ONE_TIME'
  AND ow.work_date IS NOT NULL;
GO

UPDATE dbo.operation_assignments
SET valid_until = NULL
WHERE valid_until IS NOT NULL
  AND valid_from IS NOT NULL
  AND valid_until < valid_from;
GO

ALTER TABLE dbo.operation_assignments ALTER COLUMN valid_from DATE NOT NULL;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_operation_assignments_valid_range'
      AND parent_object_id = OBJECT_ID('dbo.operation_assignments')
)
BEGIN
    ALTER TABLE dbo.operation_assignments
        ADD CONSTRAINT CK_operation_assignments_valid_range
        CHECK (valid_until IS NULL OR valid_until >= valid_from);
END;
GO

-- Guard: refuse PK migration when unexpected FKs reference non-id assignment columns.
IF EXISTS (
    SELECT 1
    FROM sys.foreign_keys fk
    INNER JOIN sys.foreign_key_columns fkc
        ON fkc.constraint_object_id = fk.object_id
    INNER JOIN sys.columns rc
        ON rc.object_id = fk.referenced_object_id
       AND rc.column_id = fkc.referenced_column_id
    WHERE fk.referenced_object_id = OBJECT_ID('dbo.operation_assignments')
      AND rc.name NOT IN (N'id')
)
BEGIN
    THROW 51040, 'operation_assignments has foreign keys referencing legacy non-id columns; migrate dependents before dropping composite PK', 1;
END;
GO

-- Drop composite primary key when present.
DECLARE @assignmentPkName NVARCHAR(128);
SELECT @assignmentPkName = kc.name
FROM sys.key_constraints kc
WHERE kc.parent_object_id = OBJECT_ID('dbo.operation_assignments')
  AND kc.type = 'PK';

IF @assignmentPkName IS NOT NULL
   AND NOT EXISTS (
       SELECT 1
       FROM sys.index_columns ic
       INNER JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
       WHERE ic.object_id = OBJECT_ID('dbo.operation_assignments')
         AND ic.index_id = (
             SELECT index_id
             FROM sys.key_constraints
             WHERE name = @assignmentPkName
               AND parent_object_id = OBJECT_ID('dbo.operation_assignments')
         )
         AND c.name = 'id'
   )
BEGIN
    DECLARE @dropPkSql NVARCHAR(400);
    SET @dropPkSql = N'ALTER TABLE dbo.operation_assignments DROP CONSTRAINT ' + QUOTENAME(@assignmentPkName);
    EXEC sp_executesql @dropPkSql;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.key_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.operation_assignments')
      AND type = 'PK'
)
BEGIN
    ALTER TABLE dbo.operation_assignments
        ADD CONSTRAINT PK_operation_assignments PRIMARY KEY (id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_operation_assignments_scope_dates'
      AND object_id = OBJECT_ID('dbo.operation_assignments')
)
BEGIN
    CREATE INDEX IX_operation_assignments_scope_dates
        ON dbo.operation_assignments (company_id, operation_id, employee_id, valid_from, valid_until);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_operation_assignments_operation_validity'
      AND object_id = OBJECT_ID('dbo.operation_assignments')
)
BEGIN
    CREATE INDEX IX_operation_assignments_operation_validity
        ON dbo.operation_assignments (company_id, operation_id, valid_from, valid_until)
        INCLUDE (employee_id, confirmation_status);
END;
GO

-- Employee workday linkage to assignment period.
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.employee_workdays') AND name = 'operation_assignment_id'
)
BEGIN
    ALTER TABLE dbo.employee_workdays ADD operation_assignment_id UNIQUEIDENTIFIER NULL;
END;
GO

UPDATE ew
SET operation_assignment_id = matched.assignment_id
FROM dbo.employee_workdays ew
INNER JOIN dbo.operation_workdays ow
    ON ow.id = ew.operation_workday_id
   AND ow.company_id = ew.company_id
CROSS APPLY (
    SELECT TOP 1 oa.id AS assignment_id
    FROM dbo.operation_assignments oa
    WHERE oa.company_id = ew.company_id
      AND oa.operation_id = ow.operation_id
      AND oa.employee_id = ew.employee_id
      AND ow.work_date >= oa.valid_from
      AND (oa.valid_until IS NULL OR ow.work_date <= oa.valid_until)
    ORDER BY oa.valid_from DESC, oa.assigned_at DESC
) matched
WHERE ew.operation_assignment_id IS NULL;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = 'FK_employee_workdays_operation_assignment'
      AND parent_object_id = OBJECT_ID('dbo.employee_workdays')
)
BEGIN
    ALTER TABLE dbo.employee_workdays
        ADD CONSTRAINT FK_employee_workdays_operation_assignment
        FOREIGN KEY (operation_assignment_id)
        REFERENCES dbo.operation_assignments (id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_employee_workdays_operation_assignment'
      AND object_id = OBJECT_ID('dbo.employee_workdays')
)
BEGIN
    CREATE INDEX IX_employee_workdays_operation_assignment
        ON dbo.employee_workdays (company_id, operation_assignment_id);
END;
GO
