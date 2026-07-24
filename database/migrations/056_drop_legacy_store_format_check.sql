-- Ensure legacy CK_stores_store_format is dropped.
-- Migration 053 intended to remove it, but some environments still have the constraint
-- while 053 is marked applied (restore / partial apply). store_format is validated at
-- application level against company_location_types.
-- Idempotent.
--
-- Rollback (manual): not restored; format values are company-scoped.

USE dinamic_attendance;
GO

IF EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = N'CK_stores_store_format'
      AND parent_object_id = OBJECT_ID(N'dbo.operational_locations')
)
BEGIN
    ALTER TABLE dbo.operational_locations DROP CONSTRAINT CK_stores_store_format;
END;
GO

IF EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = N'CK_stores_formato'
      AND parent_object_id = OBJECT_ID(N'dbo.operational_locations')
)
BEGIN
    ALTER TABLE dbo.operational_locations DROP CONSTRAINT CK_stores_formato;
END;
GO

IF EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = N'CK_stores_store_format'
      AND parent_object_id = OBJECT_ID(N'dbo.stores')
      AND OBJECTPROPERTY(OBJECT_ID(N'dbo.stores'), N'IsTable') = 1
)
BEGIN
    ALTER TABLE dbo.stores DROP CONSTRAINT CK_stores_store_format;
END;
GO
