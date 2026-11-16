/*
  Rollback: 166_billing_admin_idempotency_digest_exemption_immutability_rollback.sql
  DIN-406 Fase 2B — drops idempotency digest columns.
*/

USE dinamic_attendance;
GO

IF COL_LENGTH(N'dbo.billing_subscriptions', N'admin_request_idempotency_digest') IS NOT NULL
BEGIN
    ALTER TABLE dbo.billing_subscriptions DROP COLUMN admin_request_idempotency_digest;
END;
GO

IF COL_LENGTH(N'dbo.billing_subscription_terms', N'admin_request_idempotency_digest') IS NOT NULL
BEGIN
    ALTER TABLE dbo.billing_subscription_terms DROP COLUMN admin_request_idempotency_digest;
END;
GO