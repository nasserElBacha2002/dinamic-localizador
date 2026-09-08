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

UPDATE dbo.bot_sessions
SET intent = CASE
    WHEN state = N'WAITING_MENU_SELECTION' THEN N'MENU'
    WHEN state IN (N'WAITING_LOCATION', N'WAITING_OPERATION_SELECTION') THEN N'CHECK_IN'
    WHEN state IN (
        N'WAITING_CHECKOUT_LOCATION',
        N'WAITING_CHECKOUT_OPERATION_SELECTION'
    ) THEN N'CHECK_OUT'
    WHEN state LIKE N'WAITING_ABSENCE_%' THEN N'ABSENCE'
    WHEN state = N'WAITING_CONFIRM_ATTENDANCE_SELECTION' THEN N'CONFIRM_ATTENDANCE'
    WHEN state = N'WAITING_UNAVAILABILITY_SELECTION' THEN N'REPORT_UNAVAILABILITY'
    WHEN state = N'WAITING_ATTENDANCE_CONFIRMATION_RESPONSE'
        THEN N'ATTENDANCE_CONFIRMATION_RESPONSE'
    WHEN state = N'WAITING_PAYROLL_RECEIPT_PERIOD' THEN N'PAYROLL_RECEIPT'
    ELSE NULL
END
WHERE intent IS NULL OR intent = N'ASSIGNMENT_CONFIRMATION';
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_bot_sessions_intent'
      AND parent_object_id = OBJECT_ID(N'dbo.bot_sessions')
)
BEGIN
    ALTER TABLE dbo.bot_sessions
        ADD CONSTRAINT CK_bot_sessions_intent CHECK (
            intent IS NULL OR intent IN (
                N'MENU',
                N'CHECK_IN',
                N'CHECK_OUT',
                N'PAYROLL_RECEIPT',
                N'ABSENCE',
                N'CONFIRM_ATTENDANCE',
                N'REPORT_UNAVAILABILITY',
                N'ATTENDANCE_CONFIRMATION_RESPONSE'
            )
        );
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

ALTER TABLE dbo.bot_sessions
    ADD CONSTRAINT CK_bot_sessions_intent_state CHECK (
        (state IN (N'COMPLETED', N'CANCELLED', N'EXPIRED') AND intent IS NULL)
        OR (state = N'WAITING_MENU_SELECTION' AND intent = N'MENU')
        OR (
            state IN (N'WAITING_LOCATION', N'WAITING_OPERATION_SELECTION')
            AND intent = N'CHECK_IN'
        )
        OR (
            state IN (
                N'WAITING_CHECKOUT_LOCATION',
                N'WAITING_CHECKOUT_OPERATION_SELECTION'
            )
            AND intent = N'CHECK_OUT'
        )
        OR (state LIKE N'WAITING_ABSENCE_%' AND intent = N'ABSENCE')
        OR (
            state = N'WAITING_CONFIRM_ATTENDANCE_SELECTION'
            AND intent = N'CONFIRM_ATTENDANCE'
        )
        OR (
            state = N'WAITING_UNAVAILABILITY_SELECTION'
            AND intent = N'REPORT_UNAVAILABILITY'
        )
        OR (
            state = N'WAITING_ATTENDANCE_CONFIRMATION_RESPONSE'
            AND intent = N'ATTENDANCE_CONFIRMATION_RESPONSE'
        )
        OR (
            state = N'WAITING_PAYROLL_RECEIPT_PERIOD'
            AND intent = N'PAYROLL_RECEIPT'
        )
    );
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
      AND (
        is_simulation = 0
        OR (is_simulation = 1 AND simulation_session_id IS NOT NULL)
      )
)
UPDATE bs
SET state = N'CANCELLED',
    intent = NULL,
    context_json = NULL,
    session_version = session_version + 1,
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
