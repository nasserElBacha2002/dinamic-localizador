/*
  Rollback: 168_billing_subscription_term_commercial_benefit_rollback.sql
*/

USE dinamic_attendance;
GO

IF COL_LENGTH(N'dbo.billing_subscription_terms', N'commercial_benefit_reason') IS NOT NULL
BEGIN
    ALTER TABLE dbo.billing_subscription_terms DROP COLUMN commercial_benefit_reason;
END;
GO

IF COL_LENGTH(N'dbo.billing_subscription_terms', N'commercial_benefit_discount_amount') IS NOT NULL
BEGIN
    ALTER TABLE dbo.billing_subscription_terms DROP COLUMN commercial_benefit_discount_amount;
END;
GO

IF COL_LENGTH(N'dbo.billing_subscription_terms', N'commercial_benefit_discount_percent') IS NOT NULL
BEGIN
    ALTER TABLE dbo.billing_subscription_terms DROP COLUMN commercial_benefit_discount_percent;
END;
GO

IF COL_LENGTH(N'dbo.billing_subscription_terms', N'commercial_benefit_base_amount') IS NOT NULL
BEGIN
    ALTER TABLE dbo.billing_subscription_terms DROP COLUMN commercial_benefit_base_amount;
END;
GO

IF COL_LENGTH(N'dbo.billing_subscription_terms', N'commercial_benefit_kind') IS NOT NULL
BEGIN
    ALTER TABLE dbo.billing_subscription_terms DROP COLUMN commercial_benefit_kind;
END;
GO