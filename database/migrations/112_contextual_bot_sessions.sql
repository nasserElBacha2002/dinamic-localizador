/*
  Persistent contextual retries for WhatsApp bot sessions.

  bot_sessions remains the single conversational state store. Existing
  session_version / last_message_sid columns are used as optimistic fencing
  tokens across processes and instances.
*/

IF COL_LENGTH('dbo.bot_sessions', 'intent') IS NULL
BEGIN
    ALTER TABLE dbo.bot_sessions ADD intent NVARCHAR(40) NULL;
END;
GO

IF COL_LENGTH('dbo.bot_sessions', 'failed_attempts') IS NULL
BEGIN
    ALTER TABLE dbo.bot_sessions
        ADD failed_attempts INT NOT NULL
            CONSTRAINT DF_bot_sessions_failed_attempts DEFAULT 0;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = N'CK_bot_sessions_failed_attempts'
      AND parent_object_id = OBJECT_ID(N'dbo.bot_sessions')
)
BEGIN
    ALTER TABLE dbo.bot_sessions
        ADD CONSTRAINT CK_bot_sessions_failed_attempts
        CHECK (failed_attempts >= 0);
END;
GO

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

;WITH ranked_active AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY
                employee_id,
                is_simulation,
                CASE WHEN is_simulation = 1 THEN simulation_session_id END
            ORDER BY created_at DESC, id DESC
        ) AS row_number
    FROM dbo.bot_sessions
    WHERE state IN (
        N'WAITING_MENU_SELECTION',
        N'WAITING_LOCATION',
        N'WAITING_OPERATION_SELECTION',
        N'WAITING_CHECKOUT_LOCATION',
        N'WAITING_CHECKOUT_OPERATION_SELECTION',
        N'WAITING_ABSENCE_TYPE',
        N'WAITING_ABSENCE_START_DATE',
        N'WAITING_ABSENCE_END_DATE',
        N'WAITING_ABSENCE_REASON',
        N'WAITING_ABSENCE_CONFIRMATION',
        N'WAITING_CONFIRM_ATTENDANCE_SELECTION',
        N'WAITING_UNAVAILABILITY_SELECTION',
        N'WAITING_ATTENDANCE_CONFIRMATION_RESPONSE',
        N'WAITING_PAYROLL_RECEIPT_PERIOD'
    )
)
UPDATE bs
SET state = N'CANCELLED',
    context_json = NULL,
    updated_at = SYSUTCDATETIME()
FROM dbo.bot_sessions bs
INNER JOIN ranked_active ranked ON ranked.id = bs.id
WHERE ranked.row_number > 1;
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
