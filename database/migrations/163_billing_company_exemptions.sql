/*
  Migration: 163_billing_company_exemptions.sql
  DIN-406 Fase 1C — Permanent strategic commercial exemptions (schema only).
  Additive only. No exemption seeds.

  Tables:
    - billing_company_exemptions

  Rollback: rollback/163_billing_company_exemptions_rollback.sql
*/

USE dinamic_attendance;
GO

/* ---- billing_company_exemptions ---- */

IF OBJECT_ID(N'dbo.billing_company_exemptions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.billing_company_exemptions (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_billing_company_exemptions PRIMARY KEY
            CONSTRAINT DF_billing_company_exemptions_id DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        exemption_reason NVARCHAR(500) NOT NULL,
        is_permanent BIT NOT NULL
            CONSTRAINT DF_billing_company_exemptions_is_permanent DEFAULT 1,
        expires_at DATETIME2 NULL,
        created_source NVARCHAR(40) NOT NULL,
        created_by_user_id UNIQUEIDENTIFIER NULL,
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_billing_company_exemptions_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL
            CONSTRAINT DF_billing_company_exemptions_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_billing_company_exemptions_company
            FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
        CONSTRAINT FK_billing_company_exemptions_created_by
            FOREIGN KEY (created_by_user_id) REFERENCES dbo.users (id),
        CONSTRAINT CK_billing_company_exemptions_reason
            CHECK (LEN(LTRIM(RTRIM(exemption_reason))) >= 1),
        CONSTRAINT CK_billing_company_exemptions_permanent_expiry
            CHECK (
                is_permanent = 0
                OR expires_at IS NULL
            ),
        CONSTRAINT CK_billing_company_exemptions_created_source
            CHECK (
                LEN(created_source) >= 1
                AND created_source = UPPER(created_source)
                AND created_source NOT LIKE '% %'
            )
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_billing_company_exemptions_company'
      AND object_id = OBJECT_ID(N'dbo.billing_company_exemptions')
)
BEGIN
    CREATE INDEX IX_billing_company_exemptions_company
        ON dbo.billing_company_exemptions (company_id, is_permanent, expires_at);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UX_bce_company_permanent_open'
      AND object_id = OBJECT_ID(N'dbo.billing_company_exemptions')
)
BEGIN
    CREATE UNIQUE INDEX UX_bce_company_permanent_open
        ON dbo.billing_company_exemptions (company_id)
        WHERE is_permanent = 1 AND expires_at IS NULL;
END;
GO

IF OBJECT_ID(N'dbo.TR_billing_company_exemptions_immutable', N'TR') IS NULL
BEGIN
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
END;
GO
