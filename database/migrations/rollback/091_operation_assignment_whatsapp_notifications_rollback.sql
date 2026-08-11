/*
  Rollback: 091_operation_assignment_whatsapp_notifications_rollback.sql
  Reverts: database/migrations/091_operation_assignment_whatsapp_notifications.sql
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.whatsapp_operation_assignment_notification_send_attempts', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.whatsapp_operation_assignment_notification_send_attempts;
END;
GO

IF OBJECT_ID(N'dbo.whatsapp_operation_assignment_notifications', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.whatsapp_operation_assignment_notifications;
END;
GO
