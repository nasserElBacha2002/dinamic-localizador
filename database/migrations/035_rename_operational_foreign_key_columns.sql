-- Phase 3: Rename operational FK columns on physical tables (catalog-based).
-- store_id → service_id on scheduled_operations and bot_simulation_sessions
-- inventory_id → operation_id on operation_assignments, attendance_records,
--   whatsapp_attendance_notifications, bot_simulation_sessions, bot_sessions
--
-- Legacy compatibility views are dropped before renames; 037 removes them permanently.
-- Rollback: reverse sp_rename on columns (maintenance window).

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
IF OBJECT_ID('dbo.scheduled_operations', 'U') IS NOT NULL
   AND EXISTS (
       SELECT 1 FROM sys.columns
       WHERE object_id = OBJECT_ID('dbo.scheduled_operations') AND name = 'store_id'
   )
   AND NOT EXISTS (
       SELECT 1 FROM sys.columns
       WHERE object_id = OBJECT_ID('dbo.scheduled_operations') AND name = 'service_id'
   )
BEGIN
    DECLARE @fkSql NVARCHAR(MAX) = N'';
    SELECT @fkSql = @fkSql
        + N'ALTER TABLE ' + QUOTENAME(OBJECT_SCHEMA_NAME(fk.parent_object_id))
        + N'.' + QUOTENAME(OBJECT_NAME(fk.parent_object_id))
        + N' DROP CONSTRAINT ' + QUOTENAME(fk.name) + N';'
    FROM sys.foreign_keys fk
    INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
    INNER JOIN sys.columns c
        ON c.object_id = fkc.parent_object_id AND c.column_id = fkc.parent_column_id
    WHERE c.object_id = OBJECT_ID('dbo.scheduled_operations') AND c.name = N'store_id';
    IF LEN(@fkSql) > 0 EXEC sp_executesql @fkSql;

    DECLARE @idxSql NVARCHAR(MAX) = N'';
    SELECT @idxSql = @idxSql
        + CASE
              WHEN i.is_unique_constraint = 1 THEN
                  N'ALTER TABLE ' + QUOTENAME(OBJECT_SCHEMA_NAME(i.object_id))
                  + N'.' + QUOTENAME(OBJECT_NAME(i.object_id))
                  + N' DROP CONSTRAINT ' + QUOTENAME(i.name) + N';'
              ELSE
                  N'DROP INDEX ' + QUOTENAME(i.name) + N' ON '
                  + QUOTENAME(OBJECT_SCHEMA_NAME(i.object_id)) + N'.' + QUOTENAME(OBJECT_NAME(i.object_id)) + N';'
          END
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('dbo.scheduled_operations')
      AND i.is_primary_key = 0
      AND i.type > 0
      AND EXISTS (
          SELECT 1
          FROM sys.index_columns ic
          INNER JOIN sys.columns c
              ON c.object_id = ic.object_id AND c.column_id = ic.column_id
          WHERE ic.object_id = i.object_id
            AND ic.index_id = i.index_id
            AND c.name = N'store_id'
      )
      AND (
          (SELECT COUNT(*) FROM sys.index_columns ic2
           WHERE ic2.object_id = i.object_id AND ic2.index_id = i.index_id) = 1
          OR i.is_unique = 0
          OR (i.is_unique = 1 AND i.is_primary_key = 0)
      );
    IF LEN(@idxSql) > 0 EXEC sp_executesql @idxSql;

    EXEC sp_rename 'dbo.scheduled_operations.store_id', 'service_id', 'COLUMN';
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = 'FK_scheduled_operations_service_id'
      AND parent_object_id = OBJECT_ID('dbo.scheduled_operations')
)
AND EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.scheduled_operations') AND name = 'service_id'
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
AND EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.scheduled_operations') AND name = 'service_id'
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
AND EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.scheduled_operations') AND name = 'service_id'
)
BEGIN
    CREATE INDEX IX_scheduled_operations_company_service_scheduled_start
        ON dbo.scheduled_operations (company_id, service_id, scheduled_start);
END;
GO

-- ---------------------------------------------------------------------------
-- operation_assignments.inventory_id → operation_id
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.operation_assignments', 'U') IS NOT NULL
   AND EXISTS (
       SELECT 1 FROM sys.columns
       WHERE object_id = OBJECT_ID('dbo.operation_assignments') AND name = 'inventory_id'
   )
   AND NOT EXISTS (
       SELECT 1 FROM sys.columns
       WHERE object_id = OBJECT_ID('dbo.operation_assignments') AND name = 'operation_id'
   )
BEGIN
    DECLARE @fkSql NVARCHAR(MAX) = N'';
    SELECT @fkSql = @fkSql
        + N'ALTER TABLE ' + QUOTENAME(OBJECT_SCHEMA_NAME(fk.parent_object_id))
        + N'.' + QUOTENAME(OBJECT_NAME(fk.parent_object_id))
        + N' DROP CONSTRAINT ' + QUOTENAME(fk.name) + N';'
    FROM sys.foreign_keys fk
    INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
    INNER JOIN sys.columns c
        ON c.object_id = fkc.parent_object_id AND c.column_id = fkc.parent_column_id
    WHERE c.object_id = OBJECT_ID('dbo.operation_assignments') AND c.name = N'inventory_id';
    IF LEN(@fkSql) > 0 EXEC sp_executesql @fkSql;

    DECLARE @idxSql NVARCHAR(MAX) = N'';
    SELECT @idxSql = @idxSql
        + CASE
              WHEN i.is_unique_constraint = 1 THEN
                  N'ALTER TABLE ' + QUOTENAME(OBJECT_SCHEMA_NAME(i.object_id))
                  + N'.' + QUOTENAME(OBJECT_NAME(i.object_id))
                  + N' DROP CONSTRAINT ' + QUOTENAME(i.name) + N';'
              ELSE
                  N'DROP INDEX ' + QUOTENAME(i.name) + N' ON '
                  + QUOTENAME(OBJECT_SCHEMA_NAME(i.object_id)) + N'.' + QUOTENAME(OBJECT_NAME(i.object_id)) + N';'
          END
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('dbo.operation_assignments')
      AND i.is_primary_key = 0
      AND i.type > 0
      AND EXISTS (
          SELECT 1
          FROM sys.index_columns ic
          INNER JOIN sys.columns c
              ON c.object_id = ic.object_id AND c.column_id = ic.column_id
          WHERE ic.object_id = i.object_id
            AND ic.index_id = i.index_id
            AND c.name = N'inventory_id'
      )
      AND (
          (SELECT COUNT(*) FROM sys.index_columns ic2
           WHERE ic2.object_id = i.object_id AND ic2.index_id = i.index_id) = 1
          OR i.is_unique = 0
          OR (i.is_unique = 1 AND i.is_primary_key = 0)
      );
    IF LEN(@idxSql) > 0 EXEC sp_executesql @idxSql;

    EXEC sp_rename 'dbo.operation_assignments.inventory_id', 'operation_id', 'COLUMN';
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = 'FK_operation_assignments_operation_id'
      AND parent_object_id = OBJECT_ID('dbo.operation_assignments')
)
AND EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.operation_assignments') AND name = 'operation_id'
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
AND EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.operation_assignments') AND name = 'operation_id'
)
BEGIN
    CREATE INDEX IX_operation_assignments_company_operation_employee
        ON dbo.operation_assignments (company_id, operation_id, employee_id);
END;
GO

-- ---------------------------------------------------------------------------
-- attendance_records.inventory_id → operation_id
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.attendance_records', 'U') IS NOT NULL
   AND EXISTS (
       SELECT 1 FROM sys.columns
       WHERE object_id = OBJECT_ID('dbo.attendance_records') AND name = 'inventory_id'
   )
   AND NOT EXISTS (
       SELECT 1 FROM sys.columns
       WHERE object_id = OBJECT_ID('dbo.attendance_records') AND name = 'operation_id'
   )
BEGIN
    DECLARE @fkSql NVARCHAR(MAX) = N'';
    SELECT @fkSql = @fkSql
        + N'ALTER TABLE ' + QUOTENAME(OBJECT_SCHEMA_NAME(fk.parent_object_id))
        + N'.' + QUOTENAME(OBJECT_NAME(fk.parent_object_id))
        + N' DROP CONSTRAINT ' + QUOTENAME(fk.name) + N';'
    FROM sys.foreign_keys fk
    INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
    INNER JOIN sys.columns c
        ON c.object_id = fkc.parent_object_id AND c.column_id = fkc.parent_column_id
    WHERE c.object_id = OBJECT_ID('dbo.attendance_records') AND c.name = N'inventory_id';
    IF LEN(@fkSql) > 0 EXEC sp_executesql @fkSql;

    DECLARE @idxSql NVARCHAR(MAX) = N'';
    SELECT @idxSql = @idxSql
        + CASE
              WHEN i.is_unique_constraint = 1 THEN
                  N'ALTER TABLE ' + QUOTENAME(OBJECT_SCHEMA_NAME(i.object_id))
                  + N'.' + QUOTENAME(OBJECT_NAME(i.object_id))
                  + N' DROP CONSTRAINT ' + QUOTENAME(i.name) + N';'
              ELSE
                  N'DROP INDEX ' + QUOTENAME(i.name) + N' ON '
                  + QUOTENAME(OBJECT_SCHEMA_NAME(i.object_id)) + N'.' + QUOTENAME(OBJECT_NAME(i.object_id)) + N';'
          END
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('dbo.attendance_records')
      AND i.is_primary_key = 0
      AND i.type > 0
      AND EXISTS (
          SELECT 1
          FROM sys.index_columns ic
          INNER JOIN sys.columns c
              ON c.object_id = ic.object_id AND c.column_id = ic.column_id
          WHERE ic.object_id = i.object_id
            AND ic.index_id = i.index_id
            AND c.name = N'inventory_id'
      )
      AND (
          (SELECT COUNT(*) FROM sys.index_columns ic2
           WHERE ic2.object_id = i.object_id AND ic2.index_id = i.index_id) = 1
          OR i.is_unique = 0
          OR (i.is_unique = 1 AND i.is_primary_key = 0)
      );
    IF LEN(@idxSql) > 0 EXEC sp_executesql @idxSql;

    EXEC sp_rename 'dbo.attendance_records.inventory_id', 'operation_id', 'COLUMN';
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = 'FK_attendance_records_operation_id'
      AND parent_object_id = OBJECT_ID('dbo.attendance_records')
)
AND EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.attendance_records') AND name = 'operation_id'
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
AND EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.attendance_records') AND name = 'operation_id'
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
AND EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.attendance_records') AND name = 'operation_id'
)
BEGIN
    CREATE INDEX IX_attendance_records_company_employee_operation_received_at
        ON dbo.attendance_records (company_id, employee_id, operation_id, received_at);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UX_attendance_records_operation_employee_active'
      AND object_id = OBJECT_ID('dbo.attendance_records')
)
AND EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.attendance_records') AND name = 'operation_id'
)
BEGIN
    CREATE UNIQUE INDEX UX_attendance_records_operation_employee_active
        ON dbo.attendance_records (operation_id, employee_id)
        WHERE validation_status IN ('VALID', 'PENDING_REVIEW');
END;
GO

-- ---------------------------------------------------------------------------
-- whatsapp_attendance_notifications.inventory_id → operation_id
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.whatsapp_attendance_notifications', 'U') IS NOT NULL
   AND EXISTS (
       SELECT 1 FROM sys.columns
       WHERE object_id = OBJECT_ID('dbo.whatsapp_attendance_notifications') AND name = 'inventory_id'
   )
   AND NOT EXISTS (
       SELECT 1 FROM sys.columns
       WHERE object_id = OBJECT_ID('dbo.whatsapp_attendance_notifications') AND name = 'operation_id'
   )
BEGIN
    DECLARE @fkSql NVARCHAR(MAX) = N'';
    SELECT @fkSql = @fkSql
        + N'ALTER TABLE ' + QUOTENAME(OBJECT_SCHEMA_NAME(fk.parent_object_id))
        + N'.' + QUOTENAME(OBJECT_NAME(fk.parent_object_id))
        + N' DROP CONSTRAINT ' + QUOTENAME(fk.name) + N';'
    FROM sys.foreign_keys fk
    INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
    INNER JOIN sys.columns c
        ON c.object_id = fkc.parent_object_id AND c.column_id = fkc.parent_column_id
    WHERE c.object_id = OBJECT_ID('dbo.whatsapp_attendance_notifications') AND c.name = N'inventory_id';
    IF LEN(@fkSql) > 0 EXEC sp_executesql @fkSql;

    DECLARE @idxSql NVARCHAR(MAX) = N'';
    SELECT @idxSql = @idxSql
        + CASE
              WHEN i.is_unique_constraint = 1 THEN
                  N'ALTER TABLE ' + QUOTENAME(OBJECT_SCHEMA_NAME(i.object_id))
                  + N'.' + QUOTENAME(OBJECT_NAME(i.object_id))
                  + N' DROP CONSTRAINT ' + QUOTENAME(i.name) + N';'
              ELSE
                  N'DROP INDEX ' + QUOTENAME(i.name) + N' ON '
                  + QUOTENAME(OBJECT_SCHEMA_NAME(i.object_id)) + N'.' + QUOTENAME(OBJECT_NAME(i.object_id)) + N';'
          END
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('dbo.whatsapp_attendance_notifications')
      AND i.is_primary_key = 0
      AND i.type > 0
      AND EXISTS (
          SELECT 1
          FROM sys.index_columns ic
          INNER JOIN sys.columns c
              ON c.object_id = ic.object_id AND c.column_id = ic.column_id
          WHERE ic.object_id = i.object_id
            AND ic.index_id = i.index_id
            AND c.name = N'inventory_id'
      )
      AND (
          (SELECT COUNT(*) FROM sys.index_columns ic2
           WHERE ic2.object_id = i.object_id AND ic2.index_id = i.index_id) = 1
          OR i.is_unique = 0
          OR (i.is_unique = 1 AND i.is_primary_key = 0)
      );
    IF LEN(@idxSql) > 0 EXEC sp_executesql @idxSql;

    EXEC sp_rename 'dbo.whatsapp_attendance_notifications.inventory_id', 'operation_id', 'COLUMN';
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = 'FK_whatsapp_attendance_notifications_operation'
      AND parent_object_id = OBJECT_ID('dbo.whatsapp_attendance_notifications')
)
AND EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.whatsapp_attendance_notifications') AND name = 'operation_id'
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
AND EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.whatsapp_attendance_notifications') AND name = 'operation_id'
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
AND EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.whatsapp_attendance_notifications') AND name = 'operation_id'
)
BEGIN
    CREATE INDEX IX_whatsapp_attendance_notifications_operation_employee_type_version
        ON dbo.whatsapp_attendance_notifications (operation_id, employee_id, notification_type, schedule_version);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UQ_whatsapp_attendance_notifications_operation_employee_type_version'
      AND object_id = OBJECT_ID('dbo.whatsapp_attendance_notifications')
)
AND EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.whatsapp_attendance_notifications') AND name = 'operation_id'
)
BEGIN
    CREATE UNIQUE INDEX UQ_whatsapp_attendance_notifications_operation_employee_type_version
        ON dbo.whatsapp_attendance_notifications (operation_id, employee_id, notification_type, schedule_version);
END;
GO

-- ---------------------------------------------------------------------------
-- bot_simulation_sessions.inventory_id → operation_id
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.bot_simulation_sessions', 'U') IS NOT NULL
   AND EXISTS (
       SELECT 1 FROM sys.columns
       WHERE object_id = OBJECT_ID('dbo.bot_simulation_sessions') AND name = 'inventory_id'
   )
   AND NOT EXISTS (
       SELECT 1 FROM sys.columns
       WHERE object_id = OBJECT_ID('dbo.bot_simulation_sessions') AND name = 'operation_id'
   )
BEGIN
    DECLARE @fkSql NVARCHAR(MAX) = N'';
    SELECT @fkSql = @fkSql
        + N'ALTER TABLE ' + QUOTENAME(OBJECT_SCHEMA_NAME(fk.parent_object_id))
        + N'.' + QUOTENAME(OBJECT_NAME(fk.parent_object_id))
        + N' DROP CONSTRAINT ' + QUOTENAME(fk.name) + N';'
    FROM sys.foreign_keys fk
    INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
    INNER JOIN sys.columns c
        ON c.object_id = fkc.parent_object_id AND c.column_id = fkc.parent_column_id
    WHERE c.object_id = OBJECT_ID('dbo.bot_simulation_sessions') AND c.name = N'inventory_id';
    IF LEN(@fkSql) > 0 EXEC sp_executesql @fkSql;

    DECLARE @idxSql NVARCHAR(MAX) = N'';
    SELECT @idxSql = @idxSql
        + CASE
              WHEN i.is_unique_constraint = 1 THEN
                  N'ALTER TABLE ' + QUOTENAME(OBJECT_SCHEMA_NAME(i.object_id))
                  + N'.' + QUOTENAME(OBJECT_NAME(i.object_id))
                  + N' DROP CONSTRAINT ' + QUOTENAME(i.name) + N';'
              ELSE
                  N'DROP INDEX ' + QUOTENAME(i.name) + N' ON '
                  + QUOTENAME(OBJECT_SCHEMA_NAME(i.object_id)) + N'.' + QUOTENAME(OBJECT_NAME(i.object_id)) + N';'
          END
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('dbo.bot_simulation_sessions')
      AND i.is_primary_key = 0
      AND i.type > 0
      AND EXISTS (
          SELECT 1
          FROM sys.index_columns ic
          INNER JOIN sys.columns c
              ON c.object_id = ic.object_id AND c.column_id = ic.column_id
          WHERE ic.object_id = i.object_id
            AND ic.index_id = i.index_id
            AND c.name = N'inventory_id'
      )
      AND (
          (SELECT COUNT(*) FROM sys.index_columns ic2
           WHERE ic2.object_id = i.object_id AND ic2.index_id = i.index_id) = 1
          OR i.is_unique = 0
          OR (i.is_unique = 1 AND i.is_primary_key = 0)
      );
    IF LEN(@idxSql) > 0 EXEC sp_executesql @idxSql;

    EXEC sp_rename 'dbo.bot_simulation_sessions.inventory_id', 'operation_id', 'COLUMN';
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = 'FK_bot_simulation_sessions_operation'
      AND parent_object_id = OBJECT_ID('dbo.bot_simulation_sessions')
)
AND EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.bot_simulation_sessions') AND name = 'operation_id'
)
BEGIN
    ALTER TABLE dbo.bot_simulation_sessions
        ADD CONSTRAINT FK_bot_simulation_sessions_operation
        FOREIGN KEY (operation_id) REFERENCES dbo.scheduled_operations (id);
END;
GO

-- ---------------------------------------------------------------------------
-- bot_simulation_sessions.store_id → service_id
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.bot_simulation_sessions', 'U') IS NOT NULL
   AND EXISTS (
       SELECT 1 FROM sys.columns
       WHERE object_id = OBJECT_ID('dbo.bot_simulation_sessions') AND name = 'store_id'
   )
   AND NOT EXISTS (
       SELECT 1 FROM sys.columns
       WHERE object_id = OBJECT_ID('dbo.bot_simulation_sessions') AND name = 'service_id'
   )
BEGIN
    DECLARE @fkSql NVARCHAR(MAX) = N'';
    SELECT @fkSql = @fkSql
        + N'ALTER TABLE ' + QUOTENAME(OBJECT_SCHEMA_NAME(fk.parent_object_id))
        + N'.' + QUOTENAME(OBJECT_NAME(fk.parent_object_id))
        + N' DROP CONSTRAINT ' + QUOTENAME(fk.name) + N';'
    FROM sys.foreign_keys fk
    INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
    INNER JOIN sys.columns c
        ON c.object_id = fkc.parent_object_id AND c.column_id = fkc.parent_column_id
    WHERE c.object_id = OBJECT_ID('dbo.bot_simulation_sessions') AND c.name = N'store_id';
    IF LEN(@fkSql) > 0 EXEC sp_executesql @fkSql;

    DECLARE @idxSql NVARCHAR(MAX) = N'';
    SELECT @idxSql = @idxSql
        + CASE
              WHEN i.is_unique_constraint = 1 THEN
                  N'ALTER TABLE ' + QUOTENAME(OBJECT_SCHEMA_NAME(i.object_id))
                  + N'.' + QUOTENAME(OBJECT_NAME(i.object_id))
                  + N' DROP CONSTRAINT ' + QUOTENAME(i.name) + N';'
              ELSE
                  N'DROP INDEX ' + QUOTENAME(i.name) + N' ON '
                  + QUOTENAME(OBJECT_SCHEMA_NAME(i.object_id)) + N'.' + QUOTENAME(OBJECT_NAME(i.object_id)) + N';'
          END
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('dbo.bot_simulation_sessions')
      AND i.is_primary_key = 0
      AND i.type > 0
      AND EXISTS (
          SELECT 1
          FROM sys.index_columns ic
          INNER JOIN sys.columns c
              ON c.object_id = ic.object_id AND c.column_id = ic.column_id
          WHERE ic.object_id = i.object_id
            AND ic.index_id = i.index_id
            AND c.name = N'store_id'
      )
      AND (
          (SELECT COUNT(*) FROM sys.index_columns ic2
           WHERE ic2.object_id = i.object_id AND ic2.index_id = i.index_id) = 1
          OR i.is_unique = 0
          OR (i.is_unique = 1 AND i.is_primary_key = 0)
      );
    IF LEN(@idxSql) > 0 EXEC sp_executesql @idxSql;

    EXEC sp_rename 'dbo.bot_simulation_sessions.store_id', 'service_id', 'COLUMN';
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = 'FK_bot_simulation_sessions_service'
      AND parent_object_id = OBJECT_ID('dbo.bot_simulation_sessions')
)
AND EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.bot_simulation_sessions') AND name = 'service_id'
)
BEGIN
    ALTER TABLE dbo.bot_simulation_sessions
        ADD CONSTRAINT FK_bot_simulation_sessions_service
        FOREIGN KEY (service_id) REFERENCES dbo.operational_locations (id);
END;
GO

-- ---------------------------------------------------------------------------
-- bot_sessions.inventory_id → operation_id
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.bot_sessions', 'U') IS NOT NULL
   AND EXISTS (
       SELECT 1 FROM sys.columns
       WHERE object_id = OBJECT_ID('dbo.bot_sessions') AND name = 'inventory_id'
   )
   AND NOT EXISTS (
       SELECT 1 FROM sys.columns
       WHERE object_id = OBJECT_ID('dbo.bot_sessions') AND name = 'operation_id'
   )
BEGIN
    DECLARE @fkSql NVARCHAR(MAX) = N'';
    SELECT @fkSql = @fkSql
        + N'ALTER TABLE ' + QUOTENAME(OBJECT_SCHEMA_NAME(fk.parent_object_id))
        + N'.' + QUOTENAME(OBJECT_NAME(fk.parent_object_id))
        + N' DROP CONSTRAINT ' + QUOTENAME(fk.name) + N';'
    FROM sys.foreign_keys fk
    INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
    INNER JOIN sys.columns c
        ON c.object_id = fkc.parent_object_id AND c.column_id = fkc.parent_column_id
    WHERE c.object_id = OBJECT_ID('dbo.bot_sessions') AND c.name = N'inventory_id';
    IF LEN(@fkSql) > 0 EXEC sp_executesql @fkSql;

    DECLARE @idxSql NVARCHAR(MAX) = N'';
    SELECT @idxSql = @idxSql
        + CASE
              WHEN i.is_unique_constraint = 1 THEN
                  N'ALTER TABLE ' + QUOTENAME(OBJECT_SCHEMA_NAME(i.object_id))
                  + N'.' + QUOTENAME(OBJECT_NAME(i.object_id))
                  + N' DROP CONSTRAINT ' + QUOTENAME(i.name) + N';'
              ELSE
                  N'DROP INDEX ' + QUOTENAME(i.name) + N' ON '
                  + QUOTENAME(OBJECT_SCHEMA_NAME(i.object_id)) + N'.' + QUOTENAME(OBJECT_NAME(i.object_id)) + N';'
          END
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('dbo.bot_sessions')
      AND i.is_primary_key = 0
      AND i.type > 0
      AND EXISTS (
          SELECT 1
          FROM sys.index_columns ic
          INNER JOIN sys.columns c
              ON c.object_id = ic.object_id AND c.column_id = ic.column_id
          WHERE ic.object_id = i.object_id
            AND ic.index_id = i.index_id
            AND c.name = N'inventory_id'
      )
      AND (
          (SELECT COUNT(*) FROM sys.index_columns ic2
           WHERE ic2.object_id = i.object_id AND ic2.index_id = i.index_id) = 1
          OR i.is_unique = 0
          OR (i.is_unique = 1 AND i.is_primary_key = 0)
      );
    IF LEN(@idxSql) > 0 EXEC sp_executesql @idxSql;

    EXEC sp_rename 'dbo.bot_sessions.inventory_id', 'operation_id', 'COLUMN';
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = 'FK_bot_sessions_operation'
      AND parent_object_id = OBJECT_ID('dbo.bot_sessions')
)
AND EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.bot_sessions') AND name = 'operation_id'
)
BEGIN
    ALTER TABLE dbo.bot_sessions
        ADD CONSTRAINT FK_bot_sessions_operation
        FOREIGN KEY (operation_id) REFERENCES dbo.scheduled_operations (id);
END;
GO
