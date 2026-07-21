-- Remove legacy global CHECK on stores.store_format / operational_locations.store_format.
-- store_format is validated at application level against company_location_types per company.
-- Idempotent: only drops constraints if they exist. Does not modify column data.
-- Note: after migration 021 the physical table is operational_locations; constraint name
-- may still be CK_stores_store_format.

USE dinamic_attendance;
GO

IF EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = 'CK_stores_store_format'
      AND parent_object_id = OBJECT_ID('stores')
      AND OBJECTPROPERTY(OBJECT_ID('stores'), 'IsTable') = 1
)
BEGIN
    ALTER TABLE stores DROP CONSTRAINT CK_stores_store_format;
END;
GO

IF EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = 'CK_stores_formato'
      AND parent_object_id = OBJECT_ID('stores')
      AND OBJECTPROPERTY(OBJECT_ID('stores'), 'IsTable') = 1
)
BEGIN
    ALTER TABLE stores DROP CONSTRAINT CK_stores_formato;
END;
GO

IF EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = 'CK_stores_store_format'
      AND parent_object_id = OBJECT_ID('dbo.operational_locations')
)
BEGIN
    ALTER TABLE dbo.operational_locations DROP CONSTRAINT CK_stores_store_format;
END;
GO

IF EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = 'CK_stores_formato'
      AND parent_object_id = OBJECT_ID('dbo.operational_locations')
)
BEGIN
    ALTER TABLE dbo.operational_locations DROP CONSTRAINT CK_stores_formato;
END;
GO
