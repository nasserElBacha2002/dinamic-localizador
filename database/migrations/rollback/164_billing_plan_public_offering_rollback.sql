/*
  Rollback: 164_billing_plan_public_offering_rollback.sql
  DISPOSABLE DATABASES ONLY.
*/

USE dinamic_attendance;
GO

IF COL_LENGTH(N'dbo.billing_plans', N'is_public_for_new_subscription') IS NOT NULL
BEGIN
    SET XACT_ABORT ON;

    BEGIN TRY
        BEGIN TRANSACTION;

        IF EXISTS (
            SELECT 1 FROM sys.indexes
            WHERE name = N'IX_billing_plans_public_active_sort'
              AND object_id = OBJECT_ID(N'dbo.billing_plans')
        )
        BEGIN
            DROP INDEX IX_billing_plans_public_active_sort ON dbo.billing_plans;
        END;

        DECLARE @dfName NVARCHAR(256) = (
            SELECT dc.name
            FROM sys.default_constraints dc
            INNER JOIN sys.columns c
                ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
            WHERE dc.parent_object_id = OBJECT_ID(N'dbo.billing_plans')
              AND c.name = N'is_public_for_new_subscription'
        );

        IF @dfName IS NOT NULL
        BEGIN
            EXEC(N'ALTER TABLE dbo.billing_plans DROP CONSTRAINT ' + QUOTENAME(@dfName));
        END;

        ALTER TABLE dbo.billing_plans DROP COLUMN is_public_for_new_subscription;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO