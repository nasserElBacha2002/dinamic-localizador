/*
  Rollback: 084_payroll_receipt_whatsapp_corrections_rollback.sql
  Reverts: database/migrations/084_payroll_receipt_whatsapp_corrections.sql
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.whatsapp_payroll_receipt_notification_send_attempts', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.whatsapp_payroll_receipt_notification_send_attempts;
END;
GO

IF OBJECT_ID(N'dbo.whatsapp_payroll_receipt_notifications', N'U') IS NOT NULL
BEGIN
    IF EXISTS (
        SELECT 1 FROM sys.check_constraints
        WHERE name = N'CK_wprn_status'
          AND parent_object_id = OBJECT_ID(N'dbo.whatsapp_payroll_receipt_notifications')
    )
    BEGIN
        ALTER TABLE dbo.whatsapp_payroll_receipt_notifications DROP CONSTRAINT CK_wprn_status;
    END;

    UPDATE dbo.whatsapp_payroll_receipt_notifications
    SET status = N'SENT',
        updated_at = SYSUTCDATETIME()
    WHERE status IN (N'SEND_ACCEPTED', N'SEND_STARTED');

    UPDATE dbo.whatsapp_payroll_receipt_notifications
    SET status = N'SENT_RECOVERY_REQUIRED',
        updated_at = SYSUTCDATETIME()
    WHERE status = N'RECONCILIATION_REQUIRED';

    ALTER TABLE dbo.whatsapp_payroll_receipt_notifications
        ADD CONSTRAINT CK_wprn_status
        CHECK (status IN (
            N'PENDING',
            N'PROCESSING',
            N'SENT',
            N'FAILED',
            N'CANCELLED',
            N'SENT_RECOVERY_REQUIRED'
        ));

    IF COL_LENGTH(N'dbo.whatsapp_payroll_receipt_notifications', N'active_send_attempt_id') IS NOT NULL
    BEGIN
        ALTER TABLE dbo.whatsapp_payroll_receipt_notifications DROP COLUMN active_send_attempt_id;
    END;

    IF COL_LENGTH(N'dbo.whatsapp_payroll_receipt_notifications', N'provider_status') IS NOT NULL
    BEGIN
        ALTER TABLE dbo.whatsapp_payroll_receipt_notifications DROP COLUMN provider_status;
    END;

    IF COL_LENGTH(N'dbo.whatsapp_payroll_receipt_notifications', N'cancel_requested_at') IS NOT NULL
    BEGIN
        ALTER TABLE dbo.whatsapp_payroll_receipt_notifications DROP COLUMN cancel_requested_at;
    END;

    IF EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'UQ_wprn_id_company'
          AND object_id = OBJECT_ID(N'dbo.whatsapp_payroll_receipt_notifications')
    )
    BEGIN
        DROP INDEX UQ_wprn_id_company ON dbo.whatsapp_payroll_receipt_notifications;
    END;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_whatsapp_messages_message_type'
      AND parent_object_id = OBJECT_ID(N'dbo.whatsapp_messages')
)
BEGIN
    ALTER TABLE dbo.whatsapp_messages DROP CONSTRAINT CK_whatsapp_messages_message_type;
END;
GO

-- Cancel DOCUMENT rows before restoring narrower CHECK (should be none in normal rollback)
UPDATE dbo.whatsapp_messages
SET message_type = N'UNKNOWN'
WHERE message_type = N'DOCUMENT';
GO

ALTER TABLE dbo.whatsapp_messages
    ADD CONSTRAINT CK_whatsapp_messages_message_type
    CHECK (message_type IN (N'TEXT', N'LOCATION', N'UNKNOWN'));
GO
