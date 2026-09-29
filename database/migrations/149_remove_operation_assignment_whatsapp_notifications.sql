/*
  Retires the discontinued EVENTUAL_OPERATION_ASSIGNED WhatsApp outbox.

  Deployment precondition (mandatory): deploy a version that no longer creates
  or runs this outbox, and verify all previous backend instances are stopped
  before this migration is applied. This migration intentionally discards all
  historical/pending rows so they can never be sent after retirement.

  Forward-only: do not run as part of a rolling deployment with old binaries.
*/

USE dinamic_attendance;
GO

/* The attempts table owns the only known FK to the outbox. */
IF OBJECT_ID(N'dbo.whatsapp_operation_assignment_notification_send_attempts', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.whatsapp_operation_assignment_notification_send_attempts;
END;
GO

IF OBJECT_ID(N'dbo.whatsapp_operation_assignment_notifications', N'U') IS NOT NULL
BEGIN
    /*
      Migration 091 defines no remaining inbound FK after attempts is removed.
      Fail clearly rather than silently dropping an unexpected integration FK.
    */
    IF EXISTS (
        SELECT 1
        FROM sys.foreign_keys AS fk
        WHERE fk.referenced_object_id = OBJECT_ID(N'dbo.whatsapp_operation_assignment_notifications')
    )
    BEGIN
        ;THROW 50149, 'Unexpected FK references whatsapp_operation_assignment_notifications; resolve them before retiring the table.', 1;
    END;

    DROP TABLE dbo.whatsapp_operation_assignment_notifications;
END;
GO
