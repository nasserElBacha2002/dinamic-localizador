/*
  Migration: 165_billing_subscription_term_commercial_audit.sql
  DIN-406 Fase 2B — commercial reference, admin actor, and idempotency on contractual terms.

  Rollback: rollback/165_billing_subscription_term_commercial_audit_rollback.sql
*/

USE dinamic_attendance;
GO

IF COL_LENGTH(N'dbo.billing_subscription_terms', N'commercial_reference') IS NULL
BEGIN
    ALTER TABLE dbo.billing_subscription_terms
        ADD commercial_reference NVARCHAR(500) NULL;
END;
GO

IF COL_LENGTH(N'dbo.billing_subscription_terms', N'created_by_user_id') IS NULL
BEGIN
    ALTER TABLE dbo.billing_subscription_terms
        ADD created_by_user_id UNIQUEIDENTIFIER NULL;
END;
GO

IF COL_LENGTH(N'dbo.billing_subscription_terms', N'admin_request_key') IS NULL
BEGIN
    ALTER TABLE dbo.billing_subscription_terms
        ADD admin_request_key NVARCHAR(128) NULL;
END;
GO

IF COL_LENGTH(N'dbo.billing_subscriptions', N'admin_request_key') IS NULL
BEGIN
    ALTER TABLE dbo.billing_subscriptions
        ADD admin_request_key NVARCHAR(128) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UX_bst_subscription_admin_request'
      AND object_id = OBJECT_ID(N'dbo.billing_subscription_terms')
)
BEGIN
    CREATE UNIQUE INDEX UX_bst_subscription_admin_request
        ON dbo.billing_subscription_terms (billing_subscription_id, admin_request_key)
        WHERE admin_request_key IS NOT NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UX_billing_subscriptions_company_admin_request'
      AND object_id = OBJECT_ID(N'dbo.billing_subscriptions')
)
BEGIN
    CREATE UNIQUE INDEX UX_billing_subscriptions_company_admin_request
        ON dbo.billing_subscriptions (company_id, admin_request_key)
        WHERE admin_request_key IS NOT NULL;
END;