/*
  Rollback: 120_dynamic_admin_attendance_alert_corrections_rollback.sql

  Cannot shrink CK_waan_status while EXPIRED / SKIPPED_DISABLED rows exist.
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.whatsapp_admin_alert_notifications', N'U') IS NOT NULL
   AND EXISTS (
        SELECT 1
        FROM dbo.whatsapp_admin_alert_notifications
        WHERE status IN (N'EXPIRED', N'SKIPPED_DISABLED')
   )
BEGIN
    THROW 50120, 'Cannot rollback: EXPIRED/SKIPPED_DISABLED outbox rows exist', 1;
END;
GO

IF OBJECT_ID(N'dbo.whatsapp_admin_alert_notifications', N'U') IS NOT NULL
   AND EXISTS (
        SELECT 1 FROM sys.check_constraints
        WHERE name = N'CK_waan_status'
          AND parent_object_id = OBJECT_ID(N'dbo.whatsapp_admin_alert_notifications')
   )
BEGIN
    ALTER TABLE dbo.whatsapp_admin_alert_notifications DROP CONSTRAINT CK_waan_status;

    ALTER TABLE dbo.whatsapp_admin_alert_notifications
        ADD CONSTRAINT CK_waan_status
            CHECK (status IN (
                N'PENDING',
                N'PROCESSING',
                N'SEND_STARTED',
                N'SEND_ACCEPTED',
                N'FAILED',
                N'CANCELLED',
                N'SKIPPED',
                N'RECONCILIATION_REQUIRED',
                N'SENT_RECOVERY_REQUIRED'
            ));
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_waan_claim_priority_due'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_admin_alert_notifications')
)
    DROP INDEX IX_waan_claim_priority_due ON dbo.whatsapp_admin_alert_notifications;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_ar_company_employee_workday'
      AND object_id = OBJECT_ID(N'dbo.attendance_records')
)
    DROP INDEX IX_ar_company_employee_workday ON dbo.attendance_records;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_ow_company_expected_start'
      AND object_id = OBJECT_ID(N'dbo.operation_workdays')
)
    DROP INDEX IX_ow_company_expected_start ON dbo.operation_workdays;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_ow_company_expected_end'
      AND object_id = OBJECT_ID(N'dbo.operation_workdays')
)
    DROP INDEX IX_ow_company_expected_end ON dbo.operation_workdays;
GO

IF OBJECT_ID(N'dbo.whatsapp_admin_alert_notifications', N'U') IS NOT NULL
BEGIN
    IF COL_LENGTH(N'dbo.whatsapp_admin_alert_notifications', N'lateness_minutes') IS NOT NULL
        ALTER TABLE dbo.whatsapp_admin_alert_notifications DROP COLUMN lateness_minutes;
    IF COL_LENGTH(N'dbo.whatsapp_admin_alert_notifications', N'evaluated_at') IS NOT NULL
        ALTER TABLE dbo.whatsapp_admin_alert_notifications DROP COLUMN evaluated_at;
    IF COL_LENGTH(N'dbo.whatsapp_admin_alert_notifications', N'employee_workday_id') IS NOT NULL
        ALTER TABLE dbo.whatsapp_admin_alert_notifications DROP COLUMN employee_workday_id;
    IF COL_LENGTH(N'dbo.whatsapp_admin_alert_notifications', N'assignment_id') IS NOT NULL
        ALTER TABLE dbo.whatsapp_admin_alert_notifications DROP COLUMN assignment_id;
    IF COL_LENGTH(N'dbo.whatsapp_admin_alert_notifications', N'due_at') IS NOT NULL
        ALTER TABLE dbo.whatsapp_admin_alert_notifications DROP COLUMN due_at;
END;
GO
