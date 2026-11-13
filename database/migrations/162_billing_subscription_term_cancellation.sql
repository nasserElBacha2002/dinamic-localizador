/*
  Migration: 162_billing_subscription_term_cancellation.sql
  DIN-406 Fase 1B review — future term cancellation without invalid intervals.

  Rollback: rollback/162_billing_subscription_term_cancellation_rollback.sql
*/

USE dinamic_attendance;
GO

IF COL_LENGTH(N'dbo.billing_subscription_terms', N'cancelled_at') IS NULL
BEGIN
    ALTER TABLE dbo.billing_subscription_terms
        ADD cancelled_at DATETIME2 NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_bst_subscription_cancelled'
      AND object_id = OBJECT_ID(N'dbo.billing_subscription_terms')
)
BEGIN
    CREATE INDEX IX_bst_subscription_cancelled
        ON dbo.billing_subscription_terms (billing_subscription_id, cancelled_at)
        WHERE cancelled_at IS NOT NULL;
END;
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
        WHERE i.cancelled_at IS NULL
            AND (
                i.effective_from < s.effective_from
                OR (
                    s.effective_to IS NOT NULL
                    AND i.effective_from >= s.effective_to
                )
                OR (
                    s.effective_to IS NOT NULL
                    AND i.effective_to IS NOT NULL
                    AND i.effective_to > s.effective_to
                )
                OR (
                    s.effective_to IS NOT NULL
                    AND i.effective_to IS NULL
                )
            )
    )
    BEGIN
        THROW 50162, 'Billing subscription term is outside subscription contractual period.', 1;
    END;
END;
GO
