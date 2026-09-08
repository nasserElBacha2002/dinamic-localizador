IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_bot_sessions_state'
      AND parent_object_id = OBJECT_ID(N'dbo.bot_sessions')
)
BEGIN
    ALTER TABLE dbo.bot_sessions DROP CONSTRAINT CK_bot_sessions_state;
END;
GO

UPDATE dbo.bot_sessions
SET state = N'CANCELLED',
    context_json = NULL,
    updated_at = SYSUTCDATETIME()
WHERE state = N'WAITING_MENU_SELECTION';
GO

ALTER TABLE dbo.bot_sessions
    ADD CONSTRAINT CK_bot_sessions_state
    CHECK (state IN (
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

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_bot_sessions_failed_attempts'
      AND parent_object_id = OBJECT_ID(N'dbo.bot_sessions')
)
BEGIN
    ALTER TABLE dbo.bot_sessions DROP CONSTRAINT CK_bot_sessions_failed_attempts;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.default_constraints
    WHERE name = N'DF_bot_sessions_failed_attempts'
      AND parent_object_id = OBJECT_ID(N'dbo.bot_sessions')
)
BEGIN
    ALTER TABLE dbo.bot_sessions DROP CONSTRAINT DF_bot_sessions_failed_attempts;
END;
GO

IF COL_LENGTH('dbo.bot_sessions', 'failed_attempts') IS NOT NULL
BEGIN
    ALTER TABLE dbo.bot_sessions DROP COLUMN failed_attempts;
END;
GO

IF COL_LENGTH('dbo.bot_sessions', 'intent') IS NOT NULL
BEGIN
    ALTER TABLE dbo.bot_sessions DROP COLUMN intent;
END;
GO
