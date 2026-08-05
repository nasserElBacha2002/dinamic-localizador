/*
  Rollback: 083_payroll_receipt_whatsapp_notifications_rollback.sql
  Reverts: database/migrations/083_payroll_receipt_whatsapp_notifications.sql
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.whatsapp_payroll_receipt_notifications', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.whatsapp_payroll_receipt_notifications;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_pr_id_company'
      AND object_id = OBJECT_ID(N'dbo.payroll_receipts')
)
BEGIN
    DROP INDEX UQ_pr_id_company ON dbo.payroll_receipts;
END;
GO

-- Restore bot_sessions state CHECK without WAITING_PAYROLL_RECEIPT_PERIOD
IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_bot_sessions_state'
      AND parent_object_id = OBJECT_ID(N'dbo.bot_sessions')
)
BEGIN
    ALTER TABLE dbo.bot_sessions DROP CONSTRAINT CK_bot_sessions_state;
END;
GO

-- Cancel any sessions stuck in the removed state before re-adding the constraint
UPDATE dbo.bot_sessions
SET state = N'CANCELLED',
    updated_at = SYSUTCDATETIME()
WHERE state = N'WAITING_PAYROLL_RECEIPT_PERIOD';
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
        N'COMPLETED',
        N'CANCELLED',
        N'EXPIRED'
    ));
GO
