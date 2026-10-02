-- Additive: WAITING_ABSENCE_KIND_SELECTION for unified absence/unavailability WhatsApp entry.
-- Intent compatibility already covered by CK_bot_sessions_intent_state (WAITING_ABSENCE_% → ABSENCE).

IF EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = N'CK_bot_sessions_state'
      AND parent_object_id = OBJECT_ID(N'dbo.bot_sessions')
)
BEGIN
    ALTER TABLE dbo.bot_sessions DROP CONSTRAINT CK_bot_sessions_state;
END;
GO

ALTER TABLE dbo.bot_sessions
    ADD CONSTRAINT CK_bot_sessions_state
    CHECK (state IN (
        N'WAITING_MENU_SELECTION',
        N'WAITING_LOCATION',
        N'WAITING_OPERATION_SELECTION',
        N'WAITING_CHECKOUT_LOCATION',
        N'WAITING_CHECKOUT_OPERATION_SELECTION',
        N'WAITING_ABSENCE_KIND_SELECTION',
        N'WAITING_ABSENCE_TYPE',
        N'WAITING_ABSENCE_START_DATE',
        N'WAITING_ABSENCE_END_DATE',
        N'WAITING_ABSENCE_REASON',
        N'WAITING_ABSENCE_CONFIRMATION',
        N'WAITING_CONFIRM_ATTENDANCE_SELECTION',
        N'WAITING_UNAVAILABILITY_SELECTION',
        N'WAITING_ATTENDANCE_CONFIRMATION_RESPONSE',
        N'WAITING_PAYROLL_RECEIPT_PERIOD',
        N'COMPLETED',
        N'CANCELLED',
        N'EXPIRED'
    ));
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UX_bot_sessions_active_employee'
      AND object_id = OBJECT_ID(N'dbo.bot_sessions')
)
BEGIN
    DROP INDEX UX_bot_sessions_active_employee ON dbo.bot_sessions;
END;
GO

CREATE UNIQUE INDEX UX_bot_sessions_active_employee
    ON dbo.bot_sessions (employee_id)
    WHERE is_simulation = 0
      AND state IN (
        N'WAITING_MENU_SELECTION',
        N'WAITING_LOCATION',
        N'WAITING_OPERATION_SELECTION',
        N'WAITING_CHECKOUT_LOCATION',
        N'WAITING_CHECKOUT_OPERATION_SELECTION',
        N'WAITING_ABSENCE_KIND_SELECTION',
        N'WAITING_ABSENCE_TYPE',
        N'WAITING_ABSENCE_START_DATE',
        N'WAITING_ABSENCE_END_DATE',
        N'WAITING_ABSENCE_REASON',
        N'WAITING_ABSENCE_CONFIRMATION',
        N'WAITING_CONFIRM_ATTENDANCE_SELECTION',
        N'WAITING_UNAVAILABILITY_SELECTION',
        N'WAITING_ATTENDANCE_CONFIRMATION_RESPONSE',
        N'WAITING_PAYROLL_RECEIPT_PERIOD'
      );
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UX_bot_sessions_active_simulation'
      AND object_id = OBJECT_ID(N'dbo.bot_sessions')
)
BEGIN
    DROP INDEX UX_bot_sessions_active_simulation ON dbo.bot_sessions;
END;
GO

CREATE UNIQUE INDEX UX_bot_sessions_active_simulation
    ON dbo.bot_sessions (employee_id, simulation_session_id)
    WHERE is_simulation = 1
      AND simulation_session_id IS NOT NULL
      AND state IN (
        N'WAITING_MENU_SELECTION',
        N'WAITING_LOCATION',
        N'WAITING_OPERATION_SELECTION',
        N'WAITING_CHECKOUT_LOCATION',
        N'WAITING_CHECKOUT_OPERATION_SELECTION',
        N'WAITING_ABSENCE_KIND_SELECTION',
        N'WAITING_ABSENCE_TYPE',
        N'WAITING_ABSENCE_START_DATE',
        N'WAITING_ABSENCE_END_DATE',
        N'WAITING_ABSENCE_REASON',
        N'WAITING_ABSENCE_CONFIRMATION',
        N'WAITING_CONFIRM_ATTENDANCE_SELECTION',
        N'WAITING_UNAVAILABILITY_SELECTION',
        N'WAITING_ATTENDANCE_CONFIRMATION_RESPONSE',
        N'WAITING_PAYROLL_RECEIPT_PERIOD'
      );
GO
