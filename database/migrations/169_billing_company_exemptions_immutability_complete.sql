/*
  Migration: 169_billing_company_exemptions_immutability_complete.sql
  DIN-406 Fase 2B — block any mutation of open permanent exemptions (incl. updated_at).

  Rollback: rollback/169_billing_company_exemptions_immutability_complete_rollback.sql
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.TR_billing_company_exemptions_immutable', N'TR') IS NOT NULL
BEGIN
    DROP TRIGGER dbo.TR_billing_company_exemptions_immutable;
END;
GO

EXEC(N'
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
        EXISTS (
            SELECT 1
            FROM deleted d
            WHERE d.is_permanent = 1
                AND d.expires_at IS NULL
                AND NOT EXISTS (SELECT 1 FROM inserted i WHERE i.id = d.id)
        )
        OR EXISTS (
            SELECT 1
            FROM deleted d
            INNER JOIN inserted i ON i.id = d.id
            WHERE d.is_permanent = 1
                AND d.expires_at IS NULL
        )
    )
    BEGIN
        THROW 50163, ''Permanent billing company exemptions cannot be modified or removed through ordinary operations.'', 1;
    END;
END;
');
GO