/*
  Migration: 161_billing_subscriptions_contract_guards.sql
  DIN-406 Fase 1B review — SQL guards for open subscription overlap and term containment.
  Additive only.

  Rollback: rollback/161_billing_subscriptions_contract_guards_rollback.sql
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.TR_billing_subscriptions_open_overlap', N'TR') IS NULL
BEGIN
    EXEC(N'
    CREATE TRIGGER dbo.TR_billing_subscriptions_open_overlap
    ON dbo.billing_subscriptions
    AFTER INSERT, UPDATE
    AS
    BEGIN
        SET NOCOUNT ON;

        IF NOT EXISTS (
            SELECT 1
            FROM inserted i
            WHERE i.subscription_status IN (N''ACTIVE'', N''SCHEDULED'')
        )
        BEGIN
            RETURN;
        END;

        IF EXISTS (
            SELECT 1
            FROM inserted i
            INNER JOIN dbo.billing_subscriptions o
                ON o.company_id = i.company_id
                AND o.id <> i.id
                AND o.subscription_status IN (N''ACTIVE'', N''SCHEDULED'')
                AND i.subscription_status IN (N''ACTIVE'', N''SCHEDULED'')
                AND i.effective_from < ISNULL(o.effective_to, ''9999-12-31T23:59:59.9999999'')
                AND o.effective_from < ISNULL(i.effective_to, ''9999-12-31T23:59:59.9999999'')
        )
        BEGIN
            THROW 50161, ''Open billing subscriptions overlap for the same company.'', 1;
        END;
    END;
    ');
END;
GO

IF OBJECT_ID(N'dbo.TR_billing_subscription_terms_within_subscription', N'TR') IS NULL
BEGIN
    EXEC(N'
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
    ');
END;
GO
