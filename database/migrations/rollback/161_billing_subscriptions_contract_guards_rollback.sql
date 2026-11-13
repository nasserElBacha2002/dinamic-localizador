/*
  Rollback: 161_billing_subscriptions_contract_guards_rollback.sql
  DISPOSABLE DATABASES ONLY.
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.TR_billing_subscription_terms_within_subscription', N'TR') IS NOT NULL
BEGIN
    DROP TRIGGER dbo.TR_billing_subscription_terms_within_subscription;
END;
GO

IF OBJECT_ID(N'dbo.TR_billing_subscriptions_open_overlap', N'TR') IS NOT NULL
BEGIN
    DROP TRIGGER dbo.TR_billing_subscriptions_open_overlap;
END;
GO
