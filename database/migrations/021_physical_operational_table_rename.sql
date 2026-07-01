-- Phase 2.7: Physical operational table rename with legacy compatibility views.
-- Renames: stores → operational_locations, inventories → scheduled_operations,
--          inventory_employees → operation_assignments.
-- Legacy names remain available as read-only views.
--
-- Rollback (manual, maintenance window):
--   DROP VIEW IF EXISTS dbo.stores;
--   DROP VIEW IF EXISTS dbo.inventories;
--   DROP VIEW IF EXISTS dbo.inventory_employees;
--   EXEC sp_rename 'dbo.operational_locations', 'stores';
--   EXEC sp_rename 'dbo.scheduled_operations', 'inventories';
--   EXEC sp_rename 'dbo.operation_assignments', 'inventory_employees';

USE dinamic_attendance;
GO

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
   AND OBJECT_ID('dbo.operational_locations', 'U') IS NOT NULL
BEGIN
    EXEC('CREATE VIEW dbo.stores AS SELECT * FROM dbo.operational_locations');
END;
GO

IF OBJECT_ID('dbo.inventories', 'V') IS NULL
   AND OBJECT_ID('dbo.scheduled_operations', 'U') IS NOT NULL
BEGIN
    EXEC('CREATE VIEW dbo.inventories AS SELECT * FROM dbo.scheduled_operations');
END;
GO

IF OBJECT_ID('dbo.inventory_employees', 'V') IS NULL
   AND OBJECT_ID('dbo.operation_assignments', 'U') IS NOT NULL
BEGIN
    EXEC('CREATE VIEW dbo.inventory_employees AS SELECT * FROM dbo.operation_assignments');
END;
GO
