/*
  Migration: 166_billing_admin_idempotency_digest_exemption_immutability.sql
  DIN-406 Fase 2B — immutable admin idempotency digests + permanent exemption trigger hardening.

  Rollback: rollback/166_billing_admin_idempotency_digest_exemption_immutability_rollback.sql
*/

USE dinamic_attendance;
GO

IF COL_LENGTH(N'dbo.billing_subscription_terms', N'admin_request_idempotency_digest') IS NULL
BEGIN
    ALTER TABLE dbo.billing_subscription_terms
        ADD admin_request_idempotency_digest CHAR(64) NULL;
END;
GO

IF COL_LENGTH(N'dbo.billing_subscriptions', N'admin_request_idempotency_digest') IS NULL
BEGIN
    ALTER TABLE dbo.billing_subscriptions
        ADD admin_request_idempotency_digest CHAR(64) NULL;
END;
GO