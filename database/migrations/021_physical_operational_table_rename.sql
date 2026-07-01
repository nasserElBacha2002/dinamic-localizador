-- Phase 2.7: Physical operational table rename with legacy compatibility views.
-- Renames: stores → operational_locations, inventories → scheduled_operations,
--          inventory_employees → operation_assignments.
-- Legacy names remain available as compatibility views (not DML-guaranteed read-only).
--
-- Migration runner: backend/src/database/run-migrations.ts splits batches on standalone GO lines.
--
-- Rollback (manual, maintenance window — run against target DB from connection string):
--   IF OBJECT_ID('dbo.stores', 'V') IS NOT NULL DROP VIEW dbo.stores;
--   IF OBJECT_ID('dbo.inventories', 'V') IS NOT NULL DROP VIEW dbo.inventories;
--   IF OBJECT_ID('dbo.inventory_employees', 'V') IS NOT NULL DROP VIEW dbo.inventory_employees;
--   IF OBJECT_ID('dbo.operational_locations', 'U') IS NOT NULL AND OBJECT_ID('dbo.stores', 'U') IS NULL
--       EXEC sp_rename 'dbo.operational_locations', 'stores';
--   IF OBJECT_ID('dbo.scheduled_operations', 'U') IS NOT NULL AND OBJECT_ID('dbo.inventories', 'U') IS NULL
--       EXEC sp_rename 'dbo.scheduled_operations', 'inventories';
--   IF OBJECT_ID('dbo.operation_assignments', 'U') IS NOT NULL AND OBJECT_ID('dbo.inventory_employees', 'U') IS NULL
--       EXEC sp_rename 'dbo.operation_assignments', 'inventory_employees';
--   Verify OBJECT_ID values before and after rollback.

IF OBJECT_ID('dbo.stores', 'U') IS NOT NULL
   AND OBJECT_ID('dbo.operational_locations', 'U') IS NULL
BEGIN
    EXEC sp_rename 'dbo.stores', 'operational_locations';
END;
GO

IF OBJECT_ID('dbo.inventories', 'U') IS NOT NULL
   AND OBJECT_ID('dbo.scheduled_operations', 'U') IS NULL
BEGIN
    EXEC sp_rename 'dbo.inventories', 'scheduled_operations';
END;
GO

IF OBJECT_ID('dbo.inventory_employees', 'U') IS NOT NULL
   AND OBJECT_ID('dbo.operation_assignments', 'U') IS NULL
BEGIN
    EXEC sp_rename 'dbo.inventory_employees', 'operation_assignments';
END;
GO

IF OBJECT_ID('dbo.stores', 'V') IS NULL
   AND OBJECT_ID('dbo.stores', 'U') IS NULL
   AND OBJECT_ID('dbo.operational_locations', 'U') IS NOT NULL
BEGIN
    EXEC(N'CREATE VIEW dbo.stores AS SELECT * FROM dbo.operational_locations');
END;
GO

IF OBJECT_ID('dbo.inventories', 'V') IS NULL
   AND OBJECT_ID('dbo.inventories', 'U') IS NULL
   AND OBJECT_ID('dbo.scheduled_operations', 'U') IS NOT NULL
BEGIN
    EXEC(N'CREATE VIEW dbo.inventories AS SELECT * FROM dbo.scheduled_operations');
END;
GO

IF OBJECT_ID('dbo.inventory_employees', 'V') IS NULL
   AND OBJECT_ID('dbo.inventory_employees', 'U') IS NULL
   AND OBJECT_ID('dbo.operation_assignments', 'U') IS NOT NULL
BEGIN
    EXEC(N'CREATE VIEW dbo.inventory_employees AS SELECT * FROM dbo.operation_assignments');
END;
GO
