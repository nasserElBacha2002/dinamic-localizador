-- Remove legacy global CHECK on stores.store_format.
-- store_format is validated at application level against company_location_types per company.
-- Idempotent: only drops constraints if they exist. Does not modify column data.

USE dinamic_attendance;
GO

IF EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = 'CK_stores_store_format'
      AND parent_object_id = OBJECT_ID('stores')
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
)
BEGIN
    ALTER TABLE stores DROP CONSTRAINT CK_stores_formato;
END;
GO
