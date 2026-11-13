/*
  Migration: 160_billing_subscriptions.sql
  DIN-406 Fase 1B — Company billing subscriptions and immutable contractual terms.
  Additive only. No subscription seeds or backfills.

  Tables:
    - billing_subscriptions
    - billing_subscription_terms

  Rollback: rollback/160_billing_subscriptions_rollback.sql
*/

USE dinamic_attendance;
GO

/* Composite FK helper: tier must belong to declared plan when tier is present. */
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_billing_plan_tiers_plan_id_id'
      AND object_id = OBJECT_ID(N'dbo.billing_plan_tiers')
)
BEGIN
    CREATE UNIQUE INDEX UQ_billing_plan_tiers_plan_id_id
        ON dbo.billing_plan_tiers (billing_plan_id, id);
END;
GO

/* ---- billing_subscriptions ---- */

IF OBJECT_ID(N'dbo.billing_subscriptions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.billing_subscriptions (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_billing_subscriptions PRIMARY KEY
            CONSTRAINT DF_billing_subscriptions_id DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        billing_plan_id UNIQUEIDENTIFIER NOT NULL,
        billing_plan_tier_id UNIQUEIDENTIFIER NULL,
        subscription_status NVARCHAR(20) NOT NULL,
        effective_from DATETIME2 NOT NULL,
        effective_to DATETIME2 NULL,
        ended_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_billing_subscriptions_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL
            CONSTRAINT DF_billing_subscriptions_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_billing_subscriptions_company
            FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
        CONSTRAINT FK_billing_subscriptions_plan
            FOREIGN KEY (billing_plan_id) REFERENCES dbo.billing_plans (id),
        CONSTRAINT FK_billing_subscriptions_tier
            FOREIGN KEY (billing_plan_tier_id) REFERENCES dbo.billing_plan_tiers (id),
        CONSTRAINT FK_billing_subscriptions_tier_plan
            FOREIGN KEY (billing_plan_id, billing_plan_tier_id)
            REFERENCES dbo.billing_plan_tiers (billing_plan_id, id),
        CONSTRAINT CK_billing_subscriptions_status CHECK (
            subscription_status IN (N'SCHEDULED', N'ACTIVE', N'ENDED', N'CANCELLED')
        ),
        CONSTRAINT CK_billing_subscriptions_effective_range CHECK (
            effective_to IS NULL OR effective_to > effective_from
        )
    );
END;
GO

/* Nullable billing_plan_tier_id: composite FK is skipped when tier is NULL (SQL Server). */

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_billing_subscriptions_company_status'
      AND object_id = OBJECT_ID(N'dbo.billing_subscriptions')
)
BEGIN
    CREATE INDEX IX_billing_subscriptions_company_status
        ON dbo.billing_subscriptions (company_id, subscription_status, effective_from DESC);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UX_billing_subscriptions_company_active'
      AND object_id = OBJECT_ID(N'dbo.billing_subscriptions')
)
BEGIN
    CREATE UNIQUE INDEX UX_billing_subscriptions_company_active
        ON dbo.billing_subscriptions (company_id)
        WHERE subscription_status = N'ACTIVE';
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UX_billing_subscriptions_company_scheduled'
      AND object_id = OBJECT_ID(N'dbo.billing_subscriptions')
)
BEGIN
    CREATE UNIQUE INDEX UX_billing_subscriptions_company_scheduled
        ON dbo.billing_subscriptions (company_id)
        WHERE subscription_status = N'SCHEDULED';
END;
GO

/* ---- billing_subscription_terms (immutable agreed amounts; close via effective_to only) ---- */

IF OBJECT_ID(N'dbo.billing_subscription_terms', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.billing_subscription_terms (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_billing_subscription_terms PRIMARY KEY
            CONSTRAINT DF_billing_subscription_terms_id DEFAULT NEWID(),
        billing_subscription_id UNIQUEIDENTIFIER NOT NULL,
        agreed_amount DECIMAL(18, 6) NOT NULL,
        currency CHAR(3) NOT NULL,
        billing_period NVARCHAR(10) NOT NULL,
        price_kind NVARCHAR(20) NOT NULL
            CONSTRAINT DF_billing_subscription_terms_price_kind DEFAULT N'REGULAR',
        seat_min INT NOT NULL,
        seat_max INT NULL,
        billing_plan_id UNIQUEIDENTIFIER NULL,
        billing_plan_tier_id UNIQUEIDENTIFIER NULL,
        billing_plan_price_id UNIQUEIDENTIFIER NULL,
        effective_from DATETIME2 NOT NULL,
        effective_to DATETIME2 NULL,
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_billing_subscription_terms_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_billing_subscription_terms_subscription
            FOREIGN KEY (billing_subscription_id) REFERENCES dbo.billing_subscriptions (id),
        CONSTRAINT FK_billing_subscription_terms_catalog_plan
            FOREIGN KEY (billing_plan_id) REFERENCES dbo.billing_plans (id),
        CONSTRAINT FK_billing_subscription_terms_catalog_tier
            FOREIGN KEY (billing_plan_tier_id) REFERENCES dbo.billing_plan_tiers (id),
        CONSTRAINT FK_billing_subscription_terms_catalog_price
            FOREIGN KEY (billing_plan_price_id) REFERENCES dbo.billing_plan_prices (id),
        CONSTRAINT CK_billing_subscription_terms_currency CHECK (currency LIKE '[A-Z][A-Z][A-Z]'),
        CONSTRAINT CK_billing_subscription_terms_amount_non_negative CHECK (agreed_amount >= 0),
        CONSTRAINT CK_billing_subscription_terms_billing_period CHECK (
            billing_period IN (N'MONTHLY', N'YEARLY')
        ),
        CONSTRAINT CK_billing_subscription_terms_price_kind CHECK (
            price_kind IN (N'REGULAR', N'PROMOTIONAL')
        ),
        CONSTRAINT CK_billing_subscription_terms_seat_min CHECK (
            seat_min >= 1 AND seat_min <= 2147483647
        ),
        CONSTRAINT CK_billing_subscription_terms_seat_range CHECK (
            seat_max IS NULL OR (seat_max >= seat_min AND seat_max <= 2147483647)
        ),
        CONSTRAINT CK_billing_subscription_terms_effective_range CHECK (
            effective_to IS NULL OR effective_to > effective_from
        )
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_bst_subscription_effective'
      AND object_id = OBJECT_ID(N'dbo.billing_subscription_terms')
)
BEGIN
    CREATE INDEX IX_bst_subscription_effective
        ON dbo.billing_subscription_terms (
            billing_subscription_id,
            effective_from,
            effective_to
        );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UX_bst_subscription_open_term'
      AND object_id = OBJECT_ID(N'dbo.billing_subscription_terms')
)
BEGIN
    CREATE UNIQUE INDEX UX_bst_subscription_open_term
        ON dbo.billing_subscription_terms (billing_subscription_id)
        WHERE effective_to IS NULL;
END;
GO
