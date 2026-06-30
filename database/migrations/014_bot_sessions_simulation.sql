-- Isolate simulated bot sessions from production WhatsApp bot sessions

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('bot_sessions') AND name = 'is_simulation'
)
BEGIN
    ALTER TABLE bot_sessions
        ADD is_simulation BIT NOT NULL
            CONSTRAINT DF_bot_sessions_is_simulation DEFAULT 0;
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('bot_sessions') AND name = 'simulation_session_id'
)
BEGIN
    ALTER TABLE bot_sessions
        ADD simulation_session_id UNIQUEIDENTIFIER NULL;
END;

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UX_bot_sessions_active_employee'
      AND object_id = OBJECT_ID('bot_sessions')
)
BEGIN
    DROP INDEX UX_bot_sessions_active_employee ON bot_sessions;
END;
GO

CREATE UNIQUE INDEX UX_bot_sessions_active_employee
    ON bot_sessions (employee_id)
    WHERE is_simulation = 0
      AND state IN (
        'WAITING_LOCATION',
        'WAITING_INVENTORY_SELECTION',
        'WAITING_CHECKOUT_LOCATION',
        'WAITING_CHECKOUT_INVENTORY_SELECTION',
        'WAITING_ABSENCE_TYPE',
        'WAITING_ABSENCE_START_DATE',
        'WAITING_ABSENCE_END_DATE',
        'WAITING_ABSENCE_REASON',
        'WAITING_ABSENCE_CONFIRMATION'
    );
GO

CREATE UNIQUE INDEX UX_bot_sessions_active_simulation
    ON bot_sessions (employee_id, simulation_session_id)
    WHERE is_simulation = 1
      AND simulation_session_id IS NOT NULL
      AND state IN (
        'WAITING_LOCATION',
        'WAITING_INVENTORY_SELECTION',
        'WAITING_CHECKOUT_LOCATION',
        'WAITING_CHECKOUT_INVENTORY_SELECTION',
        'WAITING_ABSENCE_TYPE',
        'WAITING_ABSENCE_START_DATE',
        'WAITING_ABSENCE_END_DATE',
        'WAITING_ABSENCE_REASON',
        'WAITING_ABSENCE_CONFIRMATION'
      );
GO
