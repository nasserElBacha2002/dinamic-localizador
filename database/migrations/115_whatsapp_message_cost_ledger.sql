/*
  Migration: 115_whatsapp_message_cost_ledger.sql
  Purpose:
    - Persist per-message Twilio channel cost ledger for Observability
    - Versioned tariffs for ESTIMATED channel fees (not Meta template fees)
    - Backfill historical outbound SIDs as PENDING / UNAVAILABLE
  Rollback: rollback/115_whatsapp_message_cost_ledger_rollback.sql

  Cost source note:
    Confirmed amounts come from Twilio Message Resource price/price_unit.
    That value is the Twilio messaging/channel fee. Meta WhatsApp template
    fees are billed separately by Twilio usage and are NOT included here.
*/

IF OBJECT_ID(N'dbo.whatsapp_message_cost_tariffs', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.whatsapp_message_cost_tariffs (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_wmct PRIMARY KEY
            DEFAULT NEWID(),
        category NVARCHAR(40) NOT NULL,
        currency CHAR(3) NOT NULL,
        amount DECIMAL(18, 6) NOT NULL,
        country_or_region NVARCHAR(40) NULL,
        source_reference NVARCHAR(200) NOT NULL,
        effective_from DATETIME2 NOT NULL,
        effective_to DATETIME2 NULL,
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_wmct_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL
            CONSTRAINT DF_wmct_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_wmct_category CHECK (
            category IN (N'TWILIO_WHATSAPP_CHANNEL')
        ),
        CONSTRAINT CK_wmct_currency CHECK (currency LIKE '[A-Z][A-Z][A-Z]'),
        CONSTRAINT CK_wmct_amount_non_negative CHECK (amount >= 0),
        CONSTRAINT CK_wmct_effective_range CHECK (
            effective_to IS NULL OR effective_to > effective_from
        )
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_wmct_category_effective'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_message_cost_tariffs')
)
BEGIN
    CREATE INDEX IX_wmct_category_effective
        ON dbo.whatsapp_message_cost_tariffs (
            category,
            effective_from,
            effective_to
        );
END;
GO

-- No default tariff seed: ESTIMATED only applies when an operator inserts a
-- versioned row with documented source_reference. Prefer PENDING/UNAVAILABLE
-- over an invented channel rate.
GO

IF OBJECT_ID(N'dbo.whatsapp_message_cost_ledger', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.whatsapp_message_cost_ledger (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_wmcl PRIMARY KEY
            DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NULL,
        whatsapp_message_id UNIQUEIDENTIFIER NULL,
        provider_message_sid NVARCHAR(100) NULL,
        channel NVARCHAR(20) NOT NULL
            CONSTRAINT DF_wmcl_channel DEFAULT N'WHATSAPP',
        direction NVARCHAR(10) NOT NULL,
        sent_at DATETIME2 NOT NULL,
        recipient_phone_masked NVARCHAR(40) NULL,
        message_kind NVARCHAR(40) NOT NULL,
        template_sid NVARCHAR(100) NULL,
        template_name NVARCHAR(120) NULL,
        flow_label NVARCHAR(60) NULL,
        provider_status NVARCHAR(40) NULL,
        pricing_category NVARCHAR(40) NULL,
        price_amount DECIMAL(18, 6) NULL,
        currency CHAR(3) NULL,
        cost_quality NVARCHAR(20) NOT NULL,
        cost_source NVARCHAR(40) NOT NULL,
        tariff_id UNIQUEIDENTIFIER NULL,
        last_synced_at DATETIME2 NULL,
        sync_attempt_count INT NOT NULL
            CONSTRAINT DF_wmcl_sync_attempt_count DEFAULT 0,
        next_sync_at DATETIME2 NULL,
        lease_owner NVARCHAR(100) NULL,
        lease_expires_at DATETIME2 NULL,
        last_sync_error_code NVARCHAR(80) NULL,
        last_sync_error_message NVARCHAR(500) NULL,
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_wmcl_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL
            CONSTRAINT DF_wmcl_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_wmcl_company
            FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
        CONSTRAINT FK_wmcl_whatsapp_message
            FOREIGN KEY (whatsapp_message_id) REFERENCES dbo.whatsapp_messages (id),
        CONSTRAINT FK_wmcl_tariff
            FOREIGN KEY (tariff_id) REFERENCES dbo.whatsapp_message_cost_tariffs (id),
        CONSTRAINT CK_wmcl_direction CHECK (direction IN (N'INBOUND', N'OUTBOUND')),
        CONSTRAINT CK_wmcl_channel CHECK (channel = N'WHATSAPP'),
        CONSTRAINT CK_wmcl_cost_quality CHECK (
            cost_quality IN (N'CONFIRMED', N'ESTIMATED', N'PENDING', N'UNAVAILABLE')
        ),
        CONSTRAINT CK_wmcl_cost_source CHECK (
            cost_source IN (
                N'TWILIO_MESSAGE_RESOURCE',
                N'TARIFF_TABLE',
                N'NONE',
                N'HISTORICAL_BACKFILL'
            )
        ),
        CONSTRAINT CK_wmcl_currency CHECK (
            currency IS NULL OR currency LIKE '[A-Z][A-Z][A-Z]'
        ),
        CONSTRAINT CK_wmcl_sync_attempt_count CHECK (sync_attempt_count >= 0)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UX_wmcl_provider_message_sid'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_message_cost_ledger')
)
BEGIN
    CREATE UNIQUE INDEX UX_wmcl_provider_message_sid
        ON dbo.whatsapp_message_cost_ledger (provider_message_sid)
        WHERE provider_message_sid IS NOT NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_wmcl_company_sent_at'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_message_cost_ledger')
)
BEGIN
    CREATE INDEX IX_wmcl_company_sent_at
        ON dbo.whatsapp_message_cost_ledger (company_id, sent_at)
        INCLUDE (cost_quality, price_amount, currency, message_kind, provider_status);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_wmcl_sync_claim'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_message_cost_ledger')
)
BEGIN
    CREATE INDEX IX_wmcl_sync_claim
        ON dbo.whatsapp_message_cost_ledger (
            cost_quality,
            next_sync_at,
            lease_expires_at,
            sync_attempt_count
        )
        INCLUDE (provider_message_sid, company_id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_wmcl_template_sid'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_message_cost_ledger')
)
BEGIN
    CREATE INDEX IX_wmcl_template_sid
        ON dbo.whatsapp_message_cost_ledger (template_sid, sent_at)
        WHERE template_sid IS NOT NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_wmcl_provider_status'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_message_cost_ledger')
)
BEGIN
    CREATE INDEX IX_wmcl_provider_status
        ON dbo.whatsapp_message_cost_ledger (provider_status, sent_at)
        WHERE provider_status IS NOT NULL;
END;
GO

-- Historical outbound with recoverable Twilio SID → PENDING (eligible for sync).
INSERT INTO dbo.whatsapp_message_cost_ledger (
    company_id,
    whatsapp_message_id,
    provider_message_sid,
    channel,
    direction,
    sent_at,
    recipient_phone_masked,
    message_kind,
    template_sid,
    template_name,
    flow_label,
    provider_status,
    cost_quality,
    cost_source,
    next_sync_at
)
SELECT
    m.company_id,
    m.id,
    COALESCE(m.provider_message_sid, m.message_sid),
    N'WHATSAPP',
    N'OUTBOUND',
    COALESCE(m.sent_at, m.created_at),
    NULL,
    CASE
        WHEN m.message_type = N'DOCUMENT' THEN N'DOCUMENT'
        WHEN m.template_sid IS NOT NULL THEN N'TEMPLATE'
        ELSE N'TEXT'
    END,
    m.template_sid,
    m.template_name,
    NULL,
    m.provider_status,
    N'PENDING',
    N'HISTORICAL_BACKFILL',
    SYSUTCDATETIME()
FROM dbo.whatsapp_messages m
WHERE m.direction = N'OUTBOUND'
  AND COALESCE(m.provider_message_sid, m.message_sid) IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM dbo.whatsapp_message_cost_ledger l
      WHERE l.provider_message_sid = COALESCE(m.provider_message_sid, m.message_sid)
  );
GO

-- Historical outbound without SID (e.g. TwiML bot replies) → UNAVAILABLE.
INSERT INTO dbo.whatsapp_message_cost_ledger (
    company_id,
    whatsapp_message_id,
    provider_message_sid,
    channel,
    direction,
    sent_at,
    message_kind,
    template_sid,
    template_name,
    flow_label,
    provider_status,
    cost_quality,
    cost_source,
    last_sync_error_code,
    last_sync_error_message
)
SELECT
    m.company_id,
    m.id,
    NULL,
    N'WHATSAPP',
    N'OUTBOUND',
    COALESCE(m.sent_at, m.created_at),
    N'BOT_TWIML',
    m.template_sid,
    m.template_name,
    NULL,
    m.provider_status,
    N'UNAVAILABLE',
    N'NONE',
    N'NO_PROVIDER_SID',
    N'Outbound message has no Twilio MessageSid (typically TwiML bot reply).'
FROM dbo.whatsapp_messages m
WHERE m.direction = N'OUTBOUND'
  AND m.provider_message_sid IS NULL
  AND m.message_sid IS NULL
  AND NOT EXISTS (
      SELECT 1
      FROM dbo.whatsapp_message_cost_ledger l
      WHERE l.whatsapp_message_id = m.id
  );
GO
