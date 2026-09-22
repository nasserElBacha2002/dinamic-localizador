IF COL_LENGTH(N'dbo.company_location_types', N'client_id') IS NULL
BEGIN
    ALTER TABLE dbo.company_location_types
    ADD client_id UNIQUEIDENTIFIER NULL;
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_company_location_types_client'
      AND parent_object_id = OBJECT_ID(N'dbo.company_location_types')
)
BEGIN
    ALTER TABLE dbo.company_location_types
    ADD CONSTRAINT FK_company_location_types_client
        FOREIGN KEY (company_id, client_id)
        REFERENCES dbo.clients (company_id, id);
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_company_location_types_company_client'
      AND object_id = OBJECT_ID(N'dbo.company_location_types')
)
BEGIN
    CREATE INDEX IX_company_location_types_company_client
        ON dbo.company_location_types (company_id, client_id);
END;
