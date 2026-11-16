/*
  Rollback: 163_billing_company_exemptions_rollback.sql
  DIN-406 Fase 1C — billing company exemptions rollback.

  DISPOSABLE DATABASES ONLY (USE dinamic_attendance). Locks, validation, and drops run in one
  transaction so TABLOCKX/HOLDLOCK are not released between the existence checks and DROP TABLE.
  Does not delete exemption rows; blocked when billing_company_exemptions contain data.
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.billing_company_exemptions', N'U') IS NOT NULL
BEGIN
    SET XACT_ABORT ON;

    BEGIN TRY
        BEGIN TRANSACTION;

        SELECT TOP 0 id FROM dbo.billing_company_exemptions WITH (TABLOCKX, HOLDLOCK);

        IF OBJECT_ID(N'dbo.TR_billing_company_exemptions_immutable', N'TR') IS NOT NULL
        BEGIN
            DROP TRIGGER dbo.TR_billing_company_exemptions_immutable;
        END;

        IF EXISTS (SELECT 1 FROM dbo.billing_company_exemptions)
        BEGIN
            THROW 50163, 'Rollback blocked: billing_company_exemptions contain data.', 1;
        END;

        DROP TABLE dbo.billing_company_exemptions;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO