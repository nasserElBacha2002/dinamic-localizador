-- Bot session states for assignment confirmation / unavailability selection (Task 5)

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_bot_sessions_state'
      AND parent_object_id = OBJECT_ID('bot_sessions')
)
BEGIN
    ALTER TABLE bot_sessions DROP CONSTRAINT CK_bot_sessions_state;
END;
GO

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
        'COMPLETED',
        'CANCELLED',
        'EXPIRED'
    ));
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
        'WAITING_UNAVAILABILITY_SELECTION'
      );
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
        'WAITING_UNAVAILABILITY_SELECTION'
      );
GO
