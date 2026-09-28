IF COL_LENGTH('dbo.operational_locations', 'client_id') IS NULL
BEGIN
    ALTER TABLE dbo.operational_locations
    ADD client_id UNIQUEIDENTIFIER NULL;
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.foreign_keys
    WHERE name = 'FK_operational_locations_client'
)
BEGIN
    ALTER TABLE dbo.operational_locations
    ADD CONSTRAINT FK_operational_locations_client
        FOREIGN KEY (company_id, client_id)
        REFERENCES dbo.clients (company_id, id);
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_operational_locations_company_client'
      AND object_id = OBJECT_ID('dbo.operational_locations')
)
BEGIN
    CREATE INDEX IX_operational_locations_company_client
        ON dbo.operational_locations (company_id, client_id);
END;