/*
  Rollback: 159_billing_commercial_catalog_rollback.sql
  Drops DIN-406 Fase 1A billing catalog tables (child → parent).
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.billing_plan_prices', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.billing_plan_prices;
END;
GO

IF OBJECT_ID(N'dbo.billing_plan_tiers', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.billing_plan_tiers;
END;
GO

IF OBJECT_ID(N'dbo.billing_plans', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.billing_plans;
END;
GO
