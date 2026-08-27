/*
  Rollback: 103_admin_alert_outbox_constraints_rollback.sql

  Safe rollback:
    - Drops admin_alerts_enabled_at column.
    - Does NOT restore a narrower CK_waan_alert_type if ABSENCE_REQUEST_PENDING rows exist
      (same policy as migration 102). Severity CHECK is left as-is (compatible with all values).
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.company_settings', N'U') IS NOT NULL
   AND EXISTS (
        SELECT 1 FROM sys.columns
        WHERE object_id = OBJECT_ID(N'dbo.company_settings')
          AND name = N'admin_alerts_enabled_at'
   )
BEGIN
    ALTER TABLE dbo.company_settings DROP COLUMN admin_alerts_enabled_at;
END;
GO

/*
  alert_type / severity constraints: leave in place.
  Narrowing alert_type would conflict with Phase C rows; see 102 rollback.
*/
