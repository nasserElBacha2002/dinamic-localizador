/*
  Rollback: 126_whatsapp_usage_quota_corrections_rollback.sql

  Restores outbound status check to 125 allowlist (fails if RESPONSE_BUILT/SHADOW rows exist).
  Drops indexes added by 126. Does not delete quota data.
*/

USE dinamic_attendance;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_wqep_open_interval'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_quota_employee_periods')
)
    DROP INDEX IX_wqep_open_interval ON dbo.whatsapp_quota_employee_periods;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_wqcp_open_interval'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_quota_company_periods')
)
    DROP INDEX IX_wqcp_open_interval ON dbo.whatsapp_quota_company_periods;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_wqor_status_updated'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_quota_outbound_reservations')
)
    DROP INDEX IX_wqor_status_updated ON dbo.whatsapp_quota_outbound_reservations;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_wqta_created_at'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_quota_turn_admissions')
)
    DROP INDEX IX_wqta_created_at ON dbo.whatsapp_quota_turn_admissions;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_wqln_status_updated'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_quota_limit_notices')
)
    DROP INDEX IX_wqln_status_updated ON dbo.whatsapp_quota_limit_notices;
GO

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
        N'ACCEPTED',
        N'RELEASED',
        N'AMBIGUOUS'
    ));
GO
