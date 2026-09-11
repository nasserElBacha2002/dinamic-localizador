/*
  Migration: 120_dynamic_admin_attendance_alert_corrections.sql

  - Persist due_at / assignment_id / employee_workday_id on admin outbox
  - Terminal statuses EXPIRED + SKIPPED_DISABLED
  - evaluated_at + lateness_minutes for observability
  - Claim priority helper index on due_at
  - Supporting indexes for dynamic candidate queries

  Safe / idempotent. No historical WhatsApp backfill.
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.whatsapp_admin_alert_notifications', N'U') IS NOT NULL
BEGIN
    IF COL_LENGTH(N'dbo.whatsapp_admin_alert_notifications', N'due_at') IS NULL
        ALTER TABLE dbo.whatsapp_admin_alert_notifications
            ADD due_at DATETIME2 NULL;

    IF COL_LENGTH(N'dbo.whatsapp_admin_alert_notifications', N'assignment_id') IS NULL
        ALTER TABLE dbo.whatsapp_admin_alert_notifications
            ADD assignment_id UNIQUEIDENTIFIER NULL;

    IF COL_LENGTH(N'dbo.whatsapp_admin_alert_notifications', N'employee_workday_id') IS NULL
        ALTER TABLE dbo.whatsapp_admin_alert_notifications
            ADD employee_workday_id UNIQUEIDENTIFIER NULL;

    IF COL_LENGTH(N'dbo.whatsapp_admin_alert_notifications', N'evaluated_at') IS NULL
        ALTER TABLE dbo.whatsapp_admin_alert_notifications
            ADD evaluated_at DATETIME2 NULL;

    IF COL_LENGTH(N'dbo.whatsapp_admin_alert_notifications', N'lateness_minutes') IS NULL
        ALTER TABLE dbo.whatsapp_admin_alert_notifications
            ADD lateness_minutes INT NULL;
END;
GO

/* Expand status CHECK for terminal skip/expire outcomes */
IF OBJECT_ID(N'dbo.whatsapp_admin_alert_notifications', N'U') IS NOT NULL
   AND EXISTS (
        SELECT 1 FROM sys.check_constraints
        WHERE name = N'CK_waan_status'
          AND parent_object_id = OBJECT_ID(N'dbo.whatsapp_admin_alert_notifications')
   )
BEGIN
    ALTER TABLE dbo.whatsapp_admin_alert_notifications DROP CONSTRAINT CK_waan_status;
END;
GO

IF OBJECT_ID(N'dbo.whatsapp_admin_alert_notifications', N'U') IS NOT NULL
BEGIN
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
                N'SENT_RECOVERY_REQUIRED',
                N'EXPIRED',
                N'SKIPPED_DISABLED'
            ));
END;
GO

IF OBJECT_ID(N'dbo.whatsapp_admin_alert_notifications', N'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_waan_claim_priority_due'
          AND object_id = OBJECT_ID(N'dbo.whatsapp_admin_alert_notifications')
   )
BEGIN
    CREATE INDEX IX_waan_claim_priority_due
        ON dbo.whatsapp_admin_alert_notifications (status, due_at, created_at)
        INCLUDE (alert_type, company_id, attempt_count, next_attempt_at, lease_expires_at);
END;
GO

IF OBJECT_ID(N'dbo.attendance_records', N'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_ar_company_employee_workday'
          AND object_id = OBJECT_ID(N'dbo.attendance_records')
   )
BEGIN
    CREATE INDEX IX_ar_company_employee_workday
        ON dbo.attendance_records (company_id, employee_workday_id)
        INCLUDE (validation_status, received_at, checkout_at, is_simulation);
END;
GO

IF OBJECT_ID(N'dbo.operation_workdays', N'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_ow_company_expected_start'
          AND object_id = OBJECT_ID(N'dbo.operation_workdays')
   )
BEGIN
    CREATE INDEX IX_ow_company_expected_start
        ON dbo.operation_workdays (company_id, status, expected_start_at)
        INCLUDE (operation_id, expected_end_at, schedule_version, work_date);
END;
GO

IF OBJECT_ID(N'dbo.operation_workdays', N'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_ow_company_expected_end'
          AND object_id = OBJECT_ID(N'dbo.operation_workdays')
   )
BEGIN
    CREATE INDEX IX_ow_company_expected_end
        ON dbo.operation_workdays (company_id, status, expected_end_at)
        INCLUDE (operation_id, expected_start_at, schedule_version, work_date);
END;
GO
