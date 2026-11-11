/*
  Roll back only changes introduced by migration 156 (replacement trace columns).
  If 155 created company_user_employee_links with those columns, this script is a no-op.
*/
USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.company_user_employee_links', N'U') IS NOT NULL
AND EXISTS (
    SELECT 1
    FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    WHERE ep.name = N'migration_156_added_replacement_columns'
      AND t.name = N'company_user_employee_links'
      AND SCHEMA_NAME(t.schema_id) = N'dbo'
)
BEGIN
    IF EXISTS (
        SELECT 1 FROM sys.foreign_keys
        WHERE name = N'FK_company_user_employee_links_last_replaced_by'
    )
    BEGIN
        ALTER TABLE dbo.company_user_employee_links
            DROP CONSTRAINT FK_company_user_employee_links_last_replaced_by;
    END;

    IF EXISTS (
        SELECT 1 FROM sys.foreign_keys
        WHERE name = N'FK_company_user_employee_links_previous_employee'
    )
    BEGIN
        ALTER TABLE dbo.company_user_employee_links
            DROP CONSTRAINT FK_company_user_employee_links_previous_employee;
    END;

    IF COL_LENGTH(N'dbo.company_user_employee_links', N'previous_employee_id') IS NOT NULL
    BEGIN
        ALTER TABLE dbo.company_user_employee_links
            DROP COLUMN previous_employee_id, last_replaced_at, last_replaced_by_user_id;
    END;

    EXEC sys.sp_dropextendedproperty
        @name = N'migration_156_added_replacement_columns',
        @level0type = N'SCHEMA', @level0name = N'dbo',
        @level1type = N'TABLE', @level1name = N'company_user_employee_links';
END;
GO
