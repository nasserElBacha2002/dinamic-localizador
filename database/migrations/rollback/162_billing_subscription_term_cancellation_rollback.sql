/*
  Rollback: 162_billing_subscription_term_cancellation_rollback.sql
  DISPOSABLE DATABASES ONLY.

  One transactional batch: validation, TABLOCKX, index/trigger/column DDL, and trigger recreate
  via sp_executesql (CREATE TRIGGER must be the first statement in its batch).
  Rejected rollback or any failure rolls back the entire batch — no partial index/trigger/column state.
  Does not delete contractual rows; blocked when cancelled_at is populated.
*/

USE dinamic_attendance;
GO

SET XACT_ABORT ON;
GO

BEGIN TRY
    BEGIN TRANSACTION;

    IF COL_LENGTH(N'dbo.billing_subscription_terms', N'cancelled_at') IS NULL
    BEGIN
        THROW 50162, 'Rollback 162 skipped: cancelled_at column not present.', 1;
    END;

    IF OBJECT_ID(N'dbo.billing_subscription_terms', N'U') IS NOT NULL
    BEGIN
        SELECT TOP 0 id
        FROM dbo.billing_subscription_terms WITH (TABLOCKX, HOLDLOCK);
    END;

    IF EXISTS (SELECT 1 FROM dbo.billing_subscription_terms WHERE cancelled_at IS NOT NULL)
    BEGIN
        THROW 50162, 'Rollback blocked: billing_subscription_terms contain cancelled_at data.', 1;
    END;

    IF EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_bst_subscription_cancelled'
          AND object_id = OBJECT_ID(N'dbo.billing_subscription_terms')
    )
    BEGIN
        DROP INDEX IX_bst_subscription_cancelled ON dbo.billing_subscription_terms;
    END;

    IF OBJECT_ID(N'dbo.TR_billing_subscription_terms_within_subscription', N'TR') IS NOT NULL
    BEGIN
        DROP TRIGGER dbo.TR_billing_subscription_terms_within_subscription;
    END;

    DECLARE @createTrigger NVARCHAR(MAX) = N'
CREATE TRIGGER dbo.TR_billing_subscription_terms_within_subscription
ON dbo.billing_subscription_terms
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
        FROM inserted i
        INNER JOIN dbo.billing_subscriptions s
            ON s.id = i.billing_subscription_id
        WHERE i.effective_from < s.effective_from
            OR (
                s.effective_to IS NOT NULL
                AND i.effective_from >= s.effective_to
            )
            OR (
                s.effective_to IS NOT NULL
                AND i.effective_to IS NOT NULL
                AND i.effective_to > s.effective_to
            )
    )
    BEGIN
        THROW 50162, ''Billing subscription term is outside subscription contractual period.'', 1;
    END;
END;
';
    EXEC sp_executesql @createTrigger;

    ALTER TABLE dbo.billing_subscription_terms DROP COLUMN cancelled_at;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
