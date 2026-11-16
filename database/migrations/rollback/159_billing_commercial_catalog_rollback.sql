/*
  Rollback: 159_billing_commercial_catalog_rollback.sql
  DIN-406 Fase 1A — billing commercial catalog rollback.

  DISPOSABLE DATABASES ONLY (USE dinamic_attendance). Locks, validation, and drops run in one
  transaction so TABLOCKX/HOLDLOCK are not released between the existence checks and DROP TABLE.
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.billing_plan_prices', N'U') IS NOT NULL
    OR OBJECT_ID(N'dbo.billing_plan_tiers', N'U') IS NOT NULL
    OR OBJECT_ID(N'dbo.billing_plans', N'U') IS NOT NULL
BEGIN
    SET XACT_ABORT ON;

    BEGIN TRY
        BEGIN TRANSACTION;

        IF OBJECT_ID(N'dbo.billing_plan_prices', N'U') IS NOT NULL
        BEGIN
            SELECT TOP 0 id FROM dbo.billing_plan_prices WITH (TABLOCKX, HOLDLOCK);
        END;

        IF OBJECT_ID(N'dbo.billing_plan_tiers', N'U') IS NOT NULL
        BEGIN
            SELECT TOP 0 id FROM dbo.billing_plan_tiers WITH (TABLOCKX, HOLDLOCK);
        END;

        IF OBJECT_ID(N'dbo.billing_plans', N'U') IS NOT NULL
        BEGIN
            SELECT TOP 0 id FROM dbo.billing_plans WITH (TABLOCKX, HOLDLOCK);
        END;

        IF OBJECT_ID(N'dbo.billing_plans', N'U') IS NULL
            AND (
                OBJECT_ID(N'dbo.billing_plan_tiers', N'U') IS NOT NULL
                OR OBJECT_ID(N'dbo.billing_plan_prices', N'U') IS NOT NULL
            )
        BEGIN
            THROW 50159, 'Rollback blocked: partial billing catalog schema; repair manually on disposable DB.', 1;
        END;

        IF (OBJECT_ID(N'dbo.billing_plans', N'U') IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.billing_plans))
            OR (OBJECT_ID(N'dbo.billing_plan_tiers', N'U') IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.billing_plan_tiers))
            OR (OBJECT_ID(N'dbo.billing_plan_prices', N'U') IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.billing_plan_prices))
        BEGIN
            THROW 50159, 'Rollback blocked: billing catalog contains data.', 1;
        END;

        IF OBJECT_ID(N'dbo.billing_plan_prices', N'U') IS NOT NULL
        BEGIN
            DROP TABLE dbo.billing_plan_prices;
        END;

        IF OBJECT_ID(N'dbo.billing_plan_tiers', N'U') IS NOT NULL
        BEGIN
            DROP TABLE dbo.billing_plan_tiers;
        END;

        IF OBJECT_ID(N'dbo.billing_plans', N'U') IS NOT NULL
        BEGIN
            DROP TABLE dbo.billing_plans;
        END;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
