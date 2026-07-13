-- Phase 3 completion: bot_sessions.operation_id, bot state rename, module key, drop hollow legacy views.
-- Idempotent — safe on databases that already applied 035/036.

-- ---------------------------------------------------------------------------
-- bot_sessions.inventory_id → operation_id (catalog-based FK drop)
-- ---------------------------------------------------------------------------
IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.bot_sessions') AND name = 'inventory_id'
)
AND NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.bot_sessions') AND name = 'operation_id'
)
BEGIN
    DECLARE @fkSql NVARCHAR(MAX) = N'';
    SELECT @fkSql = @fkSql + N'ALTER TABLE ' + QUOTENAME(OBJECT_SCHEMA_NAME(fk.parent_object_id))
        + N'.' + QUOTENAME(OBJECT_NAME(fk.parent_object_id))
        + N' DROP CONSTRAINT ' + QUOTENAME(fk.name) + N';'
    FROM sys.foreign_keys fk
    INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
    INNER JOIN sys.columns c ON c.object_id = fkc.parent_object_id AND c.column_id = fkc.parent_column_id
    WHERE c.object_id = OBJECT_ID('dbo.bot_sessions') AND c.name = N'inventory_id';
    IF LEN(@fkSql) > 0 EXEC sp_executesql @fkSql;

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

-- ---------------------------------------------------------------------------
-- Bot session states: WAITING_*_INVENTORY_* → WAITING_*_OPERATION_*
-- ---------------------------------------------------------------------------
IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_bot_sessions_state'
      AND parent_object_id = OBJECT_ID('dbo.bot_sessions')
)
BEGIN
    ALTER TABLE dbo.bot_sessions DROP CONSTRAINT CK_bot_sessions_state;
END;
GO

UPDATE dbo.bot_sessions
SET state = 'WAITING_OPERATION_SELECTION'
WHERE state = 'WAITING_INVENTORY_SELECTION';
GO

UPDATE dbo.bot_sessions
SET state = 'WAITING_CHECKOUT_OPERATION_SELECTION'
WHERE state = 'WAITING_CHECKOUT_INVENTORY_SELECTION';
GO

ALTER TABLE dbo.bot_sessions
    ADD CONSTRAINT CK_bot_sessions_state
    CHECK (state IN (
        'WAITING_LOCATION',
        'WAITING_OPERATION_SELECTION',
        'WAITING_CHECKOUT_LOCATION',
        'WAITING_CHECKOUT_OPERATION_SELECTION',
        'WAITING_ABSENCE_TYPE',
        'WAITING_ABSENCE_START_DATE',
        'WAITING_ABSENCE_END_DATE',
        'WAITING_ABSENCE_REASON',
        'WAITING_ABSENCE_CONFIRMATION',
        'WAITING_CONFIRM_ATTENDANCE_SELECTION',
        'WAITING_UNAVAILABILITY_SELECTION',
        'WAITING_ATTENDANCE_CONFIRMATION_RESPONSE',
        'COMPLETED',
        'CANCELLED',
        'EXPIRED'
    ));
GO

-- ---------------------------------------------------------------------------
-- company_modules: inventory_operations → operations
-- ---------------------------------------------------------------------------
IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'company_modules')
BEGIN
    UPDATE company_modules
    SET module_key = N'operations'
    WHERE module_key = N'inventory_operations'
      AND NOT EXISTS (
          SELECT 1 FROM company_modules cm2
          WHERE cm2.company_id = company_modules.company_id
            AND cm2.module_key = N'operations'
      );
END;
GO

-- ---------------------------------------------------------------------------
-- Drop hollow legacy compatibility views (no column-alias compatibility)
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.inventory_employees', 'V') IS NOT NULL
BEGIN
    DROP VIEW dbo.inventory_employees;
END;
GO

IF OBJECT_ID('dbo.inventories', 'V') IS NOT NULL
BEGIN
    DROP VIEW dbo.inventories;
END;
GO

IF OBJECT_ID('dbo.stores', 'V') IS NOT NULL
BEGIN
    DROP VIEW dbo.stores;
END;
GO
