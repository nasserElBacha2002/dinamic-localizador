-- Rename Spanish store columns to English (data-preserving)

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_stores_formato'
      AND parent_object_id = OBJECT_ID('stores')
)
BEGIN
    ALTER TABLE stores DROP CONSTRAINT CK_stores_formato;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_stores_formato'
      AND object_id = OBJECT_ID('stores')
)
BEGIN
    DROP INDEX IX_stores_formato ON stores;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('stores')
      AND name = 'barrio'
)
AND NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('stores')
      AND name = 'neighborhood'
)
BEGIN
    EXEC sp_rename 'stores.barrio', 'neighborhood', 'COLUMN';
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('stores')
      AND name = 'localidad'
)
AND NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('stores')
      AND name = 'locality'
)
BEGIN
    EXEC sp_rename 'stores.localidad', 'locality', 'COLUMN';
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('stores')
      AND name = 'formato'
)
AND NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('stores')
      AND name = 'store_format'
)
BEGIN
    EXEC sp_rename 'stores.formato', 'store_format', 'COLUMN';
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_stores_store_format'
      AND parent_object_id = OBJECT_ID('stores')
)
BEGIN
    ALTER TABLE stores
        ADD CONSTRAINT CK_stores_store_format
        CHECK (
            store_format IS NULL
            OR store_format IN (
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
    WHERE name = 'IX_stores_store_format'
      AND object_id = OBJECT_ID('stores')
)
BEGIN
    CREATE INDEX IX_stores_store_format ON stores (store_format);
END;
GO
