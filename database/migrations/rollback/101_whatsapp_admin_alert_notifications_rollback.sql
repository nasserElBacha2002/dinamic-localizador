USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.whatsapp_admin_alert_notification_send_attempts', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.whatsapp_admin_alert_notification_send_attempts;
END;
GO

IF OBJECT_ID(N'dbo.whatsapp_admin_alert_notifications', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.whatsapp_admin_alert_notifications;
END;
GO
