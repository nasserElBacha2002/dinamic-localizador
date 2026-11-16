/*
  Rollback: 167_billing_company_exemptions_immutability_hardening_rollback.sql
  Restores migration 163 trigger body (without id-mutation guard).
*/

USE dinamic_attendance;
GO

EXEC(N'
IF OBJECT_ID(N''dbo.TR_billing_company_exemptions_immutable'', N''TR'') IS NOT NULL
    DROP TRIGGER dbo.TR_billing_company_exemptions_immutable;

CREATE TRIGGER dbo.TR_billing_company_exemptions_immutable
ON dbo.billing_company_exemptions
AFTER UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
        FROM deleted d
        WHERE d.is_permanent = 1 AND d.expires_at IS NULL
    )
    AND (
        EXISTS (SELECT 1 FROM deleted) AND NOT EXISTS (SELECT 1 FROM inserted)
        OR EXISTS (
            SELECT 1
            FROM deleted d
            INNER JOIN inserted i ON i.id = d.id
            WHERE d.is_permanent = 1
                AND d.expires_at IS NULL
                AND (
                    i.company_id <> d.company_id
                    OR i.is_permanent <> d.is_permanent
                    OR i.expires_at IS NOT NULL
                    OR i.exemption_reason <> d.exemption_reason
                    OR i.created_source <> d.created_source
                    OR ISNULL(i.created_by_user_id, ''00000000-0000-0000-0000-000000000000'')
                        <> ISNULL(d.created_by_user_id, ''00000000-0000-0000-0000-000000000000'')
                )
        )
    )
    BEGIN
        THROW 50163, ''Permanent billing company exemptions cannot be modified or removed through ordinary operations.'', 1;
    END;
END;
');
GO