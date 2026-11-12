/*
  156: Additive amendment when 155 ran before replacement-trace columns existed.
  Safe to run after an updated 155 (columns already present → no-op).
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.company_user_employee_links', N'U') IS NULL
BEGIN
    THROW 50156, 'Precondition failed: company_user_employee_links missing (apply 155 first)', 1;
END;
GO

IF COL_LENGTH(N'dbo.company_user_employee_links', N'previous_employee_id') IS NULL
BEGIN
    ALTER TABLE dbo.company_user_employee_links
        ADD previous_employee_id UNIQUEIDENTIFIER NULL,
            last_replaced_at DATETIME2 NULL,
            last_replaced_by_user_id UNIQUEIDENTIFIER NULL;

    IF NOT EXISTS (
        SELECT 1
        FROM sys.extended_properties ep
        INNER JOIN sys.tables t ON ep.major_id = t.object_id
        WHERE ep.name = N'migration_156_added_replacement_columns'
          AND t.name = N'company_user_employee_links'
          AND SCHEMA_NAME(t.schema_id) = N'dbo'
    )
    BEGIN
        EXEC sys.sp_addextendedproperty
            @name = N'migration_156_added_replacement_columns',
            @value = N'1',
            @level0type = N'SCHEMA', @level0name = N'dbo',
            @level1type = N'TABLE', @level1name = N'company_user_employee_links';
    END;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_company_user_employee_links_previous_employee'
)
BEGIN
    ALTER TABLE dbo.company_user_employee_links
        ADD CONSTRAINT FK_company_user_employee_links_previous_employee
            FOREIGN KEY (company_id, previous_employee_id)
            REFERENCES dbo.employees (company_id, id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_company_user_employee_links_last_replaced_by'
)
BEGIN
    ALTER TABLE dbo.company_user_employee_links
        ADD CONSTRAINT FK_company_user_employee_links_last_replaced_by
            FOREIGN KEY (last_replaced_by_user_id)
            REFERENCES dbo.users (id);
END;
GO
