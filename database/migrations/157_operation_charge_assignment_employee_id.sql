/*
  157: Bind charge assignments to collaborator identity (Encargado employee_id).
  Safe when 155 already created the table with employee_id NOT NULL.
  Upgrade path: backfill from company_user_employee_links before NOT NULL / FK.
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.operation_charge_assignments', N'U') IS NULL
BEGIN
    THROW 50157, 'Precondition failed: operation_charge_assignments missing (apply 155 first)', 1;
END;
GO

IF COL_LENGTH(N'dbo.operation_charge_assignments', N'employee_id') IS NULL
BEGIN
    IF EXISTS (
        SELECT 1
        FROM dbo.operation_charge_assignments oca
        LEFT JOIN dbo.company_user_employee_links l
          ON l.company_id = oca.company_id AND l.user_id = oca.user_id
        WHERE l.employee_id IS NULL
    )
    BEGIN
        THROW 50157, 'Backfill required: operation_charge_assignments rows without resolvable employee link exist', 1;
    END;

    ALTER TABLE dbo.operation_charge_assignments
        ADD employee_id UNIQUEIDENTIFIER NULL;

    UPDATE oca
    SET employee_id = l.employee_id
    FROM dbo.operation_charge_assignments oca
    INNER JOIN dbo.company_user_employee_links l
      ON l.company_id = oca.company_id AND l.user_id = oca.user_id;

    IF EXISTS (
        SELECT 1
        FROM dbo.operation_charge_assignments
        WHERE employee_id IS NULL
    )
    BEGIN
        ALTER TABLE dbo.operation_charge_assignments DROP COLUMN employee_id;
        THROW 50157, 'Backfill failed: operation_charge_assignments rows still without employee_id', 1;
    END;

    IF NOT EXISTS (
        SELECT 1
        FROM sys.extended_properties ep
        INNER JOIN sys.tables t ON ep.major_id = t.object_id
        WHERE ep.name = N'migration_157_added_employee_id_column'
          AND t.name = N'operation_charge_assignments'
          AND SCHEMA_NAME(t.schema_id) = N'dbo'
    )
    BEGIN
        EXEC sys.sp_addextendedproperty
            @name = N'migration_157_added_employee_id_column',
            @value = N'1',
            @level0type = N'SCHEMA', @level0name = N'dbo',
            @level1type = N'TABLE', @level1name = N'operation_charge_assignments',
            @level2type = N'COLUMN', @level2name = N'employee_id';
    END;

    ALTER TABLE dbo.operation_charge_assignments
        ALTER COLUMN employee_id UNIQUEIDENTIFIER NOT NULL;

    IF NOT EXISTS (
        SELECT 1 FROM sys.foreign_keys
        WHERE name = N'FK_operation_charge_assignments_employee'
    )
    BEGIN
        ALTER TABLE dbo.operation_charge_assignments
            ADD CONSTRAINT FK_operation_charge_assignments_employee
                FOREIGN KEY (company_id, employee_id)
                REFERENCES dbo.employees (company_id, id);
    END;
END;
GO

IF COL_LENGTH(N'dbo.operation_charge_assignments', N'employee_id') IS NOT NULL
AND NOT EXISTS (
    SELECT 1
    FROM sys.extended_properties ep
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    INNER JOIN sys.tables t ON c.object_id = t.object_id
    WHERE ep.name = N'migration_157_added_employee_id_column'
      AND t.name = N'operation_charge_assignments'
      AND SCHEMA_NAME(t.schema_id) = N'dbo'
      AND c.name = N'employee_id'
)
BEGIN
    IF EXISTS (
        SELECT 1
        FROM dbo.operation_charge_assignments
        WHERE employee_id IS NULL
    )
    BEGIN
        THROW 50157, 'Backfill required: operation_charge_assignments rows without employee_id exist', 1;
    END;

    IF EXISTS (
        SELECT 1
        FROM sys.columns c
        INNER JOIN sys.tables t ON c.object_id = t.object_id
        WHERE t.name = N'operation_charge_assignments'
          AND SCHEMA_NAME(t.schema_id) = N'dbo'
          AND c.name = N'employee_id'
          AND c.is_nullable = 1
    )
    BEGIN
        ALTER TABLE dbo.operation_charge_assignments
            ALTER COLUMN employee_id UNIQUEIDENTIFIER NOT NULL;
    END;

    IF NOT EXISTS (
        SELECT 1 FROM sys.foreign_keys
        WHERE name = N'FK_operation_charge_assignments_employee'
    )
    BEGIN
        ALTER TABLE dbo.operation_charge_assignments
            ADD CONSTRAINT FK_operation_charge_assignments_employee
                FOREIGN KEY (company_id, employee_id)
                REFERENCES dbo.employees (company_id, id);
    END;
END;
GO
