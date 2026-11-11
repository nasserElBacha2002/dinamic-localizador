/*
  Roll back only changes introduced by migration 157 when employee_id was added via ALTER.
  If 155 created operation_charge_assignments with employee_id, this script is a no-op.
*/
USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.operation_charge_assignments', N'U') IS NOT NULL
AND EXISTS (
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
        SELECT 1 FROM sys.foreign_keys
        WHERE name = N'FK_operation_charge_assignments_employee'
    )
    BEGIN
        ALTER TABLE dbo.operation_charge_assignments
            DROP CONSTRAINT FK_operation_charge_assignments_employee;
    END;

    EXEC sys.sp_dropextendedproperty
        @name = N'migration_157_added_employee_id_column',
        @level0type = N'SCHEMA', @level0name = N'dbo',
        @level1type = N'TABLE', @level1name = N'operation_charge_assignments',
        @level2type = N'COLUMN', @level2name = N'employee_id';

    IF COL_LENGTH(N'dbo.operation_charge_assignments', N'employee_id') IS NOT NULL
    BEGIN
        ALTER TABLE dbo.operation_charge_assignments DROP COLUMN employee_id;
    END;
END;
GO
