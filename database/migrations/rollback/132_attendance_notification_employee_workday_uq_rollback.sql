/*
  Rollback: 132_attendance_notification_employee_workday_uq_rollback.sql

  Restores pre-Phase-3 notification uniqueness when safe.
  Blocks if employee_workday_id rows would violate the legacy UQ.
*/

USE dinamic_attendance;
GO

SET XACT_ABORT ON;
GO

IF OBJECT_ID(N'dbo.whatsapp_attendance_notifications', N'U') IS NULL
BEGIN
    PRINT '132 rollback: table missing — nothing to do';
    RETURN;
END;
GO

IF COL_LENGTH(N'dbo.whatsapp_attendance_notifications', N'employee_workday_id') IS NOT NULL
   AND EXISTS (
        SELECT 1
        FROM (
            SELECT operation_id, employee_id, notification_type, schedule_version, COUNT(*) AS cnt
            FROM dbo.whatsapp_attendance_notifications
            GROUP BY operation_id, employee_id, notification_type, schedule_version
            HAVING COUNT(*) > 1
        ) d
   )
BEGIN
    THROW 50132, 'Rollback blocked: collapsing EW-scoped notifications would violate legacy UQ', 1;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_whatsapp_attendance_notifications_ew_type_version'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_attendance_notifications')
)
BEGIN
    DROP INDEX UQ_whatsapp_attendance_notifications_ew_type_version
        ON dbo.whatsapp_attendance_notifications;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_whatsapp_attendance_notifications_op_emp_type_version_null_ew'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_attendance_notifications')
)
BEGIN
    DROP INDEX UQ_whatsapp_attendance_notifications_op_emp_type_version_null_ew
        ON dbo.whatsapp_attendance_notifications;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_whatsapp_attendance_notifications_employee_workday'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_attendance_notifications')
)
BEGIN
    DROP INDEX IX_whatsapp_attendance_notifications_employee_workday
        ON dbo.whatsapp_attendance_notifications;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_whatsapp_attendance_notifications_employee_workday_tenant'
)
BEGIN
    ALTER TABLE dbo.whatsapp_attendance_notifications
        DROP CONSTRAINT FK_whatsapp_attendance_notifications_employee_workday_tenant;
END;
GO

IF COL_LENGTH(N'dbo.whatsapp_attendance_notifications', N'employee_workday_id') IS NOT NULL
BEGIN
    ALTER TABLE dbo.whatsapp_attendance_notifications DROP COLUMN employee_workday_id;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_whatsapp_attendance_notifications_operation_employee_type_version'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_attendance_notifications')
)
BEGIN
    CREATE UNIQUE INDEX UQ_whatsapp_attendance_notifications_operation_employee_type_version
        ON dbo.whatsapp_attendance_notifications (operation_id, employee_id, notification_type, schedule_version);
END;
GO
