/*
  Migration: 164_billing_plan_public_offering.sql
  DIN-406 Fase 2A — Administer which active plans are offered for new public subscriptions.
  Additive only.

  Rollback: rollback/164_billing_plan_public_offering_rollback.sql
*/

IF COL_LENGTH(N'dbo.billing_plans', N'is_public_for_new_subscription') IS NULL
BEGIN
    ALTER TABLE dbo.billing_plans
        ADD is_public_for_new_subscription BIT NOT NULL
            CONSTRAINT DF_billing_plans_public_for_new DEFAULT 0;
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_billing_plans_public_active_sort'
      AND object_id = OBJECT_ID(N'dbo.billing_plans')
)
BEGIN
    CREATE INDEX IX_billing_plans_public_active_sort
        ON dbo.billing_plans (is_public_for_new_subscription, is_active, sort_order, display_name);
END;