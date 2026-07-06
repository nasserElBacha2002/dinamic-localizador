-- Phase 3: Rename operational FK columns on physical tables.
-- store_id → service_id on scheduled_operations (and bot_simulation_sessions)
-- inventory_id → operation_id on operation_assignments, attendance_records,
--   whatsapp_attendance_notifications, bot_simulation_sessions
--
-- Legacy compatibility views are dropped before renames and recreated afterward.
-- Rollback: reverse sp_rename on columns and restore views (maintenance window).

IF OBJECT_ID('dbo.stores', 'V') IS NOT NULL
BEGIN
    DROP VIEW dbo.stores;
END;
GO

IF OBJECT_ID('dbo.inventories', 'V') IS NOT NULL
BEGIN
    DROP VIEW dbo.inventories;
END;
GO

IF OBJECT_ID('dbo.inventory_employees', 'V') IS NOT NULL
BEGIN
    DROP VIEW dbo.inventory_employees;
END;
GO

-- ---------------------------------------------------------------------------
-- scheduled_operations.store_id → service_id
-- ---------------------------------------------------------------------------
IF EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = 'FK_inventories_store_id'
      AND parent_object_id = OBJECT_ID('dbo.scheduled_operations')
)
BEGIN
    ALTER TABLE dbo.scheduled_operations DROP CONSTRAINT FK_inventories_store_id;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_inventories_store_id'
      AND object_id = OBJECT_ID('dbo.scheduled_operations')
)
BEGIN
    DROP INDEX IX_inventories_store_id ON dbo.scheduled_operations;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_inventories_company_store_scheduled_start'
      AND object_id = OBJECT_ID('dbo.scheduled_operations')
)
BEGIN
    DROP INDEX IX_inventories_company_store_scheduled_start ON dbo.scheduled_operations;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.scheduled_operations')
      AND name = 'store_id'
)
AND NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.scheduled_operations')
      AND name = 'service_id'
)
BEGIN
    EXEC sp_rename 'dbo.scheduled_operations.store_id', 'service_id', 'COLUMN';
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = 'FK_scheduled_operations_service_id'
      AND parent_object_id = OBJECT_ID('dbo.scheduled_operations')
)
BEGIN
    ALTER TABLE dbo.scheduled_operations
        ADD CONSTRAINT FK_scheduled_operations_service_id
        FOREIGN KEY (service_id) REFERENCES dbo.operational_locations (id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_scheduled_operations_service_id'
      AND object_id = OBJECT_ID('dbo.scheduled_operations')
)
BEGIN
    CREATE INDEX IX_scheduled_operations_service_id
        ON dbo.scheduled_operations (service_id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_scheduled_operations_company_service_scheduled_start'
      AND object_id = OBJECT_ID('dbo.scheduled_operations')
)
BEGIN
    CREATE INDEX IX_scheduled_operations_company_service_scheduled_start
        ON dbo.scheduled_operations (company_id, service_id, scheduled_start);
END;
GO

-- ---------------------------------------------------------------------------
-- operation_assignments.inventory_id → operation_id
-- ---------------------------------------------------------------------------
IF EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = 'FK_inventory_employees_inventory_id'
      AND parent_object_id = OBJECT_ID('dbo.operation_assignments')
)
BEGIN
    ALTER TABLE dbo.operation_assignments DROP CONSTRAINT FK_inventory_employees_inventory_id;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_inventory_employees_company_inventory_employee'
      AND object_id = OBJECT_ID('dbo.operation_assignments')
)
BEGIN
    DROP INDEX IX_inventory_employees_company_inventory_employee ON dbo.operation_assignments;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.operation_assignments')
      AND name = 'inventory_id'
)
AND NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.operation_assignments')
      AND name = 'operation_id'
)
BEGIN
    EXEC sp_rename 'dbo.operation_assignments.inventory_id', 'operation_id', 'COLUMN';
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = 'FK_operation_assignments_operation_id'
      AND parent_object_id = OBJECT_ID('dbo.operation_assignments')
)
BEGIN
    ALTER TABLE dbo.operation_assignments
        ADD CONSTRAINT FK_operation_assignments_operation_id
        FOREIGN KEY (operation_id) REFERENCES dbo.scheduled_operations (id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_operation_assignments_company_operation_employee'
      AND object_id = OBJECT_ID('dbo.operation_assignments')
)
BEGIN
    CREATE INDEX IX_operation_assignments_company_operation_employee
        ON dbo.operation_assignments (company_id, operation_id, employee_id);
END;
GO

-- ---------------------------------------------------------------------------
-- attendance_records.inventory_id → operation_id
-- ---------------------------------------------------------------------------
IF EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = 'FK_attendance_records_inventory_id'
      AND parent_object_id = OBJECT_ID('dbo.attendance_records')
)
BEGIN
    ALTER TABLE dbo.attendance_records DROP CONSTRAINT FK_attendance_records_inventory_id;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_attendance_records_inventory_id'
      AND object_id = OBJECT_ID('dbo.attendance_records')
)
BEGIN
    DROP INDEX IX_attendance_records_inventory_id ON dbo.attendance_records;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_attendance_records_company_employee_inventory_received_at'
      AND object_id = OBJECT_ID('dbo.attendance_records')
)
BEGIN
    DROP INDEX IX_attendance_records_company_employee_inventory_received_at ON dbo.attendance_records;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.attendance_records')
      AND name = 'inventory_id'
)
AND NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.attendance_records')
      AND name = 'operation_id'
)
BEGIN
    EXEC sp_rename 'dbo.attendance_records.inventory_id', 'operation_id', 'COLUMN';
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = 'FK_attendance_records_operation_id'
      AND parent_object_id = OBJECT_ID('dbo.attendance_records')
)
BEGIN
    ALTER TABLE dbo.attendance_records
        ADD CONSTRAINT FK_attendance_records_operation_id
        FOREIGN KEY (operation_id) REFERENCES dbo.scheduled_operations (id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_attendance_records_operation_id'
      AND object_id = OBJECT_ID('dbo.attendance_records')
)
BEGIN
    CREATE INDEX IX_attendance_records_operation_id
        ON dbo.attendance_records (operation_id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_attendance_records_company_employee_operation_received_at'
      AND object_id = OBJECT_ID('dbo.attendance_records')
)
BEGIN
    CREATE INDEX IX_attendance_records_company_employee_operation_received_at
        ON dbo.attendance_records (company_id, employee_id, operation_id, received_at);
END;
GO

-- ---------------------------------------------------------------------------
-- whatsapp_attendance_notifications.inventory_id → operation_id
-- ---------------------------------------------------------------------------
IF EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = 'FK_whatsapp_attendance_notifications_inventory'
      AND parent_object_id = OBJECT_ID('dbo.whatsapp_attendance_notifications')
)
BEGIN
    ALTER TABLE dbo.whatsapp_attendance_notifications
        DROP CONSTRAINT FK_whatsapp_attendance_notifications_inventory;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_whatsapp_attendance_notifications_company_inventory_employee_type'
      AND object_id = OBJECT_ID('dbo.whatsapp_attendance_notifications')
)
BEGIN
    DROP INDEX IX_whatsapp_attendance_notifications_company_inventory_employee_type
        ON dbo.whatsapp_attendance_notifications;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_whatsapp_attendance_notifications_inventory_employee_type_version'
      AND object_id = OBJECT_ID('dbo.whatsapp_attendance_notifications')
)
BEGIN
    DROP INDEX IX_whatsapp_attendance_notifications_inventory_employee_type_version
        ON dbo.whatsapp_attendance_notifications;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.whatsapp_attendance_notifications')
      AND name = 'inventory_id'
)
AND NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.whatsapp_attendance_notifications')
      AND name = 'operation_id'
)
BEGIN
    EXEC sp_rename 'dbo.whatsapp_attendance_notifications.inventory_id', 'operation_id', 'COLUMN';
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = 'FK_whatsapp_attendance_notifications_operation'
      AND parent_object_id = OBJECT_ID('dbo.whatsapp_attendance_notifications')
)
BEGIN
    ALTER TABLE dbo.whatsapp_attendance_notifications
        ADD CONSTRAINT FK_whatsapp_attendance_notifications_operation
        FOREIGN KEY (operation_id) REFERENCES dbo.scheduled_operations (id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_whatsapp_attendance_notifications_company_operation_employee_type'
      AND object_id = OBJECT_ID('dbo.whatsapp_attendance_notifications')
)
BEGIN
    CREATE INDEX IX_whatsapp_attendance_notifications_company_operation_employee_type
        ON dbo.whatsapp_attendance_notifications (company_id, operation_id, employee_id, notification_type);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_whatsapp_attendance_notifications_operation_employee_type_version'
      AND object_id = OBJECT_ID('dbo.whatsapp_attendance_notifications')
)
BEGIN
    CREATE INDEX IX_whatsapp_attendance_notifications_operation_employee_type_version
        ON dbo.whatsapp_attendance_notifications (operation_id, employee_id, notification_type, schedule_version);
END;
GO

-- ---------------------------------------------------------------------------
-- bot_simulation_sessions: inventory_id → operation_id, store_id → service_id
-- ---------------------------------------------------------------------------
IF EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = 'FK_bot_simulation_sessions_inventory'
      AND parent_object_id = OBJECT_ID('dbo.bot_simulation_sessions')
)
BEGIN
    ALTER TABLE dbo.bot_simulation_sessions DROP CONSTRAINT FK_bot_simulation_sessions_inventory;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = 'FK_bot_simulation_sessions_store'
      AND parent_object_id = OBJECT_ID('dbo.bot_simulation_sessions')
)
BEGIN
    ALTER TABLE dbo.bot_simulation_sessions DROP CONSTRAINT FK_bot_simulation_sessions_store;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.bot_simulation_sessions')
      AND name = 'inventory_id'
)
AND NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.bot_simulation_sessions')
      AND name = 'operation_id'
)
BEGIN
    EXEC sp_rename 'dbo.bot_simulation_sessions.inventory_id', 'operation_id', 'COLUMN';
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.bot_simulation_sessions')
      AND name = 'store_id'
)
AND NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.bot_simulation_sessions')
      AND name = 'service_id'
)
BEGIN
    EXEC sp_rename 'dbo.bot_simulation_sessions.store_id', 'service_id', 'COLUMN';
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = 'FK_bot_simulation_sessions_operation'
      AND parent_object_id = OBJECT_ID('dbo.bot_simulation_sessions')
)
BEGIN
    ALTER TABLE dbo.bot_simulation_sessions
        ADD CONSTRAINT FK_bot_simulation_sessions_operation
        FOREIGN KEY (operation_id) REFERENCES dbo.scheduled_operations (id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = 'FK_bot_simulation_sessions_service'
      AND parent_object_id = OBJECT_ID('dbo.bot_simulation_sessions')
)
BEGIN
    ALTER TABLE dbo.bot_simulation_sessions
        ADD CONSTRAINT FK_bot_simulation_sessions_service
        FOREIGN KEY (service_id) REFERENCES dbo.operational_locations (id);
END;
GO

-- ---------------------------------------------------------------------------
-- Recreate legacy compatibility views (column names reflect physical tables)
-- ---------------------------------------------------------------------------
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
