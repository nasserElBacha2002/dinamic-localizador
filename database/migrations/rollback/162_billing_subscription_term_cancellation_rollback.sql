/*
  Rollback: 162_billing_subscription_term_cancellation_rollback.sql
  DISPOSABLE DATABASES ONLY — restores 161 trigger body; drop cancelled_at only when empty.
*/

USE dinamic_attendance;
GO

CREATE OR ALTER TRIGGER dbo.TR_billing_subscription_terms_within_subscription
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
        THROW 50162, 'Billing subscription term is outside subscription contractual period.', 1;
    END;
END;
GO

IF COL_LENGTH(N'dbo.billing_subscription_terms', N'cancelled_at') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM dbo.billing_subscription_terms WHERE cancelled_at IS NOT NULL)
BEGIN
    DROP INDEX IF EXISTS IX_bst_subscription_cancelled ON dbo.billing_subscription_terms;
    ALTER TABLE dbo.billing_subscription_terms DROP COLUMN cancelled_at;
END;
GO
