IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('stores')
      AND name = 'barrio'
)
BEGIN
    ALTER TABLE stores ADD barrio NVARCHAR(150) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('stores')
      AND name = 'localidad'
)
BEGIN
    ALTER TABLE stores ADD localidad NVARCHAR(150) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('stores')
      AND name = 'formato'
)
BEGIN
    ALTER TABLE stores ADD formato NVARCHAR(50) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_stores_formato'
      AND parent_object_id = OBJECT_ID('stores')
)
BEGIN
    ALTER TABLE stores
        ADD CONSTRAINT CK_stores_formato
        CHECK (
            formato IS NULL
            OR formato IN (
                N'Express',
                N'Express Interior MZA',
                N'Express Interior SALTA',
                N'EXPRESS PLUS INTERIOR',
                N'Market Bs As'
            )
        );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_stores_formato'
      AND object_id = OBJECT_ID('stores')
)
BEGIN
    CREATE INDEX IX_stores_formato ON stores (formato);
END;
GO
