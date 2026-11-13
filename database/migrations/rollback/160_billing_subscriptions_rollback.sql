/*
  Rollback: 160_billing_subscriptions_rollback.sql
  DIN-406 Fase 1B — billing subscriptions rollback.

  DISPOSABLE DATABASES ONLY (USE dinamic_attendance). Locks, validation, and drops run in one
  transaction so TABLOCKX/HOLDLOCK are not released between the existence checks and DROP TABLE.
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.billing_subscription_terms', N'U') IS NOT NULL
    OR OBJECT_ID(N'dbo.billing_subscriptions', N'U') IS NOT NULL
BEGIN
    SET XACT_ABORT ON;

    BEGIN TRY
        BEGIN TRANSACTION;

        IF OBJECT_ID(N'dbo.billing_subscription_terms', N'U') IS NOT NULL
        BEGIN
            SELECT TOP 0 id FROM dbo.billing_subscription_terms WITH (TABLOCKX, HOLDLOCK);
        END;

        IF OBJECT_ID(N'dbo.billing_subscriptions', N'U') IS NOT NULL
        BEGIN
            SELECT TOP 0 id FROM dbo.billing_subscriptions WITH (TABLOCKX, HOLDLOCK);
        END;

        IF OBJECT_ID(N'dbo.billing_subscriptions', N'U') IS NULL
            AND OBJECT_ID(N'dbo.billing_subscription_terms', N'U') IS NOT NULL
        BEGIN
            THROW 50160, 'Rollback blocked: partial billing subscription schema; repair manually on disposable DB.', 1;
        END;

        IF (OBJECT_ID(N'dbo.billing_subscription_terms', N'U') IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.billing_subscription_terms))
            OR (OBJECT_ID(N'dbo.billing_subscriptions', N'U') IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.billing_subscriptions))
        BEGIN
            THROW 50160, 'Rollback blocked: billing subscriptions contain data.', 1;
        END;

        IF OBJECT_ID(N'dbo.billing_subscription_terms', N'U') IS NOT NULL
        BEGIN
            DROP TABLE dbo.billing_subscription_terms;
        END;

        IF OBJECT_ID(N'dbo.billing_subscriptions', N'U') IS NOT NULL
        BEGIN
            DROP TABLE dbo.billing_subscriptions;
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
