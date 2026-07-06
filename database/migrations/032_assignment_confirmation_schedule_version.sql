-- Assignment confirmation schedule version + bot session state for reminder replies

USE dinamic_attendance;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('operation_assignments') AND name = 'confirmation_schedule_version'
)
BEGIN
    ALTER TABLE operation_assignments
        ADD confirmation_schedule_version INT NOT NULL
            CONSTRAINT DF_operation_assignments_confirmation_schedule_version DEFAULT 1;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_operation_assignments_confirmation_schedule_version'
)
BEGIN
    ALTER TABLE operation_assignments
        ADD CONSTRAINT CK_operation_assignments_confirmation_schedule_version
        CHECK (confirmation_schedule_version >= 1);
END;
GO

UPDATE operation_assignments
SET confirmation_schedule_version = 1
WHERE confirmation_schedule_version IS NULL OR confirmation_schedule_version < 1;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_bot_sessions_state'
      AND parent_object_id = OBJECT_ID('bot_sessions')
)
BEGIN
    ALTER TABLE bot_sessions DROP CONSTRAINT CK_bot_sessions_state;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_bot_sessions_state'
      AND parent_object_id = OBJECT_ID('bot_sessions')
)
BEGIN
    ALTER TABLE bot_sessions
        ADD CONSTRAINT CK_bot_sessions_state
        CHECK (state IN (
            'WAITING_LOCATION',
            'WAITING_INVENTORY_SELECTION',
            'WAITING_CHECKOUT_LOCATION',
            'WAITING_CHECKOUT_INVENTORY_SELECTION',
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
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UX_bot_sessions_active_employee'
      AND object_id = OBJECT_ID('bot_sessions')
)
BEGIN
    DROP INDEX UX_bot_sessions_active_employee ON bot_sessions;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UX_bot_sessions_active_employee'
      AND object_id = OBJECT_ID('bot_sessions')
)
BEGIN
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
            'WAITING_ABSENCE_CONFIRMATION',
            'WAITING_CONFIRM_ATTENDANCE_SELECTION',
            'WAITING_UNAVAILABILITY_SELECTION',
            'WAITING_ATTENDANCE_CONFIRMATION_RESPONSE'
          );
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UX_bot_sessions_active_simulation'
      AND object_id = OBJECT_ID('bot_sessions')
)
BEGIN
    DROP INDEX UX_bot_sessions_active_simulation ON bot_sessions;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UX_bot_sessions_active_simulation'
      AND object_id = OBJECT_ID('bot_sessions')
)
BEGIN
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
            'WAITING_ABSENCE_CONFIRMATION',
            'WAITING_CONFIRM_ATTENDANCE_SELECTION',
            'WAITING_UNAVAILABILITY_SELECTION',
            'WAITING_ATTENDANCE_CONFIRMATION_RESPONSE'
          );
END;
GO
