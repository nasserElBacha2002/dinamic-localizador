/*
  Migration: 168_billing_subscription_term_commercial_benefit.sql
  DIN-406 Fase 2C — structured commercial benefit attributes on contractual terms.

  Rollback: rollback/168_billing_subscription_term_commercial_benefit_rollback.sql
*/

USE dinamic_attendance;
GO

IF COL_LENGTH(N'dbo.billing_subscription_terms', N'commercial_benefit_kind') IS NULL
BEGIN
    ALTER TABLE dbo.billing_subscription_terms
        ADD commercial_benefit_kind NVARCHAR(32) NULL;
END;
GO

IF COL_LENGTH(N'dbo.billing_subscription_terms', N'commercial_benefit_base_amount') IS NULL
BEGIN
    ALTER TABLE dbo.billing_subscription_terms
        ADD commercial_benefit_base_amount DECIMAL(18, 6) NULL;
END;
GO

IF COL_LENGTH(N'dbo.billing_subscription_terms', N'commercial_benefit_discount_percent') IS NULL
BEGIN
    ALTER TABLE dbo.billing_subscription_terms
        ADD commercial_benefit_discount_percent DECIMAL(9, 4) NULL;
END;
GO

IF COL_LENGTH(N'dbo.billing_subscription_terms', N'commercial_benefit_discount_amount') IS NULL
BEGIN
    ALTER TABLE dbo.billing_subscription_terms
        ADD commercial_benefit_discount_amount DECIMAL(18, 6) NULL;
END;
GO

IF COL_LENGTH(N'dbo.billing_subscription_terms', N'commercial_benefit_reason') IS NULL
BEGIN
    ALTER TABLE dbo.billing_subscription_terms
        ADD commercial_benefit_reason NVARCHAR(500) NULL;
END;
GO