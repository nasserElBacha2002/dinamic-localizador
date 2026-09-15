/*
  Migration: 132_attendance_notification_employee_workday_uq.sql

  Phase 3: reminder idempotency per employee_workday (shift-aware).
  - Add employee_workday_id to whatsapp_attendance_notifications
  - Filtered UQ: (employee_workday_id, notification_type, schedule_version) when EW set
  - Keep legacy UQ for rows without employee_workday_id (confirmation reminders)

  Rollback: rollback/132_attendance_notification_employee_workday_uq_rollback.sql
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.whatsapp_attendance_notifications', N'U') IS NULL
BEGIN
    THROW 50132, 'Precondition failed: whatsapp_attendance_notifications missing', 1;
END;
GO

IF COL_LENGTH(N'dbo.whatsapp_attendance_notifications', N'employee_workday_id') IS NULL
BEGIN
    ALTER TABLE dbo.whatsapp_attendance_notifications
        ADD employee_workday_id UNIQUEIDENTIFIER NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_whatsapp_attendance_notifications_employee_workday_tenant'
      AND parent_object_id = OBJECT_ID(N'dbo.whatsapp_attendance_notifications')
)
AND COL_LENGTH(N'dbo.whatsapp_attendance_notifications', N'employee_workday_id') IS NOT NULL
AND OBJECT_ID(N'dbo.employee_workdays', N'U') IS NOT NULL
BEGIN
    ALTER TABLE dbo.whatsapp_attendance_notifications
        ADD CONSTRAINT FK_whatsapp_attendance_notifications_employee_workday_tenant
            FOREIGN KEY (company_id, employee_workday_id)
            REFERENCES dbo.employee_workdays (company_id, id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_whatsapp_attendance_notifications_employee_workday'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_attendance_notifications')
)
BEGIN
    CREATE INDEX IX_whatsapp_attendance_notifications_employee_workday
        ON dbo.whatsapp_attendance_notifications (company_id, employee_workday_id)
        WHERE employee_workday_id IS NOT NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_whatsapp_attendance_notifications_ew_type_version'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_attendance_notifications')
)
BEGIN
    CREATE UNIQUE INDEX UQ_whatsapp_attendance_notifications_ew_type_version
        ON dbo.whatsapp_attendance_notifications (employee_workday_id, notification_type, schedule_version)
        WHERE employee_workday_id IS NOT NULL;
END;
GO

/* Legacy path (confirmation / pre-workday rows): keep op+emp+type+version when EW is null. */
IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_whatsapp_attendance_notifications_operation_employee_type_version'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_attendance_notifications')
)
BEGIN
    DROP INDEX UQ_whatsapp_attendance_notifications_operation_employee_type_version
        ON dbo.whatsapp_attendance_notifications;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_whatsapp_attendance_notifications_op_emp_type_version_null_ew'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_attendance_notifications')
)
BEGIN
    CREATE UNIQUE INDEX UQ_whatsapp_attendance_notifications_op_emp_type_version_null_ew
        ON dbo.whatsapp_attendance_notifications (operation_id, employee_id, notification_type, schedule_version)
        WHERE employee_workday_id IS NULL;
END;
GO
