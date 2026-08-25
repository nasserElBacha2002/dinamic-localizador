/*
  Migration: 103_admin_alert_outbox_constraints.sql
  Purpose:
    - Add company_settings.admin_alerts_enabled_at (temporal frontier for reconciliation).
    - Idempotently ensure CK_waan_alert_type and CK_waan_severity match the final contract
      regardless of whether 101 was applied as original or already-edited.
  Semantics (admin_alerts_enabled_at):
    - false -> true: set enabled_at = SYSUTCDATETIME() (new frontier; no historical backfill)
    - true stays true (other settings updates): do NOT change enabled_at
    - true -> false: keep enabled_at (ignored while disabled)
    - false -> true again: set a NEW enabled_at
  Rollback: database/migrations/rollback/103_admin_alert_outbox_constraints_rollback.sql
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.company_settings', N'U') IS NULL
BEGIN
    THROW 50103, 'Precondition failed: company_settings missing', 1;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.company_settings')
      AND name = N'admin_alerts_enabled_at'
)
BEGIN
    ALTER TABLE dbo.company_settings
        ADD admin_alerts_enabled_at DATETIME2 NULL;
END;
GO

/* Already-enabled tenants: frontier = now so reconciler does not flood historical events. */
UPDATE dbo.company_settings
SET admin_alerts_enabled_at = SYSUTCDATETIME()
WHERE admin_alerts_enabled = 1
  AND admin_alerts_enabled_at IS NULL;
GO

IF OBJECT_ID(N'dbo.whatsapp_admin_alert_notifications', N'U') IS NULL
BEGIN
    THROW 50103, 'Precondition failed: whatsapp_admin_alert_notifications missing (apply 101 first)', 1;
END;
GO

IF EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = N'CK_waan_alert_type'
      AND parent_object_id = OBJECT_ID(N'dbo.whatsapp_admin_alert_notifications')
)
BEGIN
    ALTER TABLE dbo.whatsapp_admin_alert_notifications
        DROP CONSTRAINT CK_waan_alert_type;
END;
GO

ALTER TABLE dbo.whatsapp_admin_alert_notifications
    ADD CONSTRAINT CK_waan_alert_type
        CHECK (alert_type IN (
            N'EMPLOYEE_UNAVAILABLE',
            N'MISSING_CHECKIN_AFTER_OPERATION',
            N'FORWARDED_LOCATION_REJECTED',
            N'ABSENCE_REQUEST_PENDING'
        ));
GO

IF EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = N'CK_waan_severity'
      AND parent_object_id = OBJECT_ID(N'dbo.whatsapp_admin_alert_notifications')
)
BEGIN
    ALTER TABLE dbo.whatsapp_admin_alert_notifications
        DROP CONSTRAINT CK_waan_severity;
END;
GO

ALTER TABLE dbo.whatsapp_admin_alert_notifications
    ADD CONSTRAINT CK_waan_severity
        CHECK (severity IN (N'INFO', N'WARNING', N'CRITICAL'));
GO
