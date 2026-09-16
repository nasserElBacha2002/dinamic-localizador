/*
  Migration: 126_whatsapp_usage_quota_corrections.sql

  Additive corrections for Phase 2 quotas:
  - RESPONSE_BUILT / SHADOW outbound statuses
  - Retention helper indexes
  Compatible with 125 already applied. Idempotent.

  Rollback: rollback/126_whatsapp_usage_quota_corrections_rollback.sql
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.whatsapp_quota_outbound_reservations', N'U') IS NULL
BEGIN
    THROW 50126, 'Precondition failed: whatsapp_quota_outbound_reservations missing (apply 125)', 1;
END;
GO

/* Widen outbound status check for RESPONSE_BUILT + SHADOW evaluations */
IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_wqor_status'
      AND parent_object_id = OBJECT_ID(N'dbo.whatsapp_quota_outbound_reservations')
)
BEGIN
    ALTER TABLE dbo.whatsapp_quota_outbound_reservations DROP CONSTRAINT CK_wqor_status;
END;
GO

ALTER TABLE dbo.whatsapp_quota_outbound_reservations
    ADD CONSTRAINT CK_wqor_status CHECK (status IN (
        N'RESERVED',
        N'ATTEMPT_STARTED',
        N'RESPONSE_BUILT',
        N'ACCEPTED',
        N'RELEASED',
        N'AMBIGUOUS',
        N'SHADOW_WOULD_ADMIT',
        N'SHADOW_WOULD_REJECT'
    ));
GO

/* Retention / open-period lookup indexes */
IF OBJECT_ID(N'dbo.whatsapp_quota_employee_periods', N'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_wqep_open_interval'
          AND object_id = OBJECT_ID(N'dbo.whatsapp_quota_employee_periods')
   )
BEGIN
    CREATE INDEX IX_wqep_open_interval
        ON dbo.whatsapp_quota_employee_periods (company_id, employee_id, period_kind, period_start_utc, period_end_utc);
END;
GO

IF OBJECT_ID(N'dbo.whatsapp_quota_company_periods', N'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_wqcp_open_interval'
          AND object_id = OBJECT_ID(N'dbo.whatsapp_quota_company_periods')
   )
BEGIN
    CREATE INDEX IX_wqcp_open_interval
        ON dbo.whatsapp_quota_company_periods (company_id, period_kind, period_start_utc, period_end_utc);
END;
GO

IF OBJECT_ID(N'dbo.whatsapp_quota_outbound_reservations', N'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_wqor_status_updated'
          AND object_id = OBJECT_ID(N'dbo.whatsapp_quota_outbound_reservations')
   )
BEGIN
    CREATE INDEX IX_wqor_status_updated
        ON dbo.whatsapp_quota_outbound_reservations (status, updated_at);
END;
GO

IF OBJECT_ID(N'dbo.whatsapp_quota_turn_admissions', N'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_wqta_created_at'
          AND object_id = OBJECT_ID(N'dbo.whatsapp_quota_turn_admissions')
   )
BEGIN
    CREATE INDEX IX_wqta_created_at
        ON dbo.whatsapp_quota_turn_admissions (created_at);
END;
GO

IF OBJECT_ID(N'dbo.whatsapp_quota_limit_notices', N'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_wqln_status_updated'
          AND object_id = OBJECT_ID(N'dbo.whatsapp_quota_limit_notices')
   )
BEGIN
    CREATE INDEX IX_wqln_status_updated
        ON dbo.whatsapp_quota_limit_notices (status, updated_at);
END;
GO
