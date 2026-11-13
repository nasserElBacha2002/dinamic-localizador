/*
  Migration: 159_billing_commercial_catalog.sql
  DIN-406 Fase 1A — Commercial billing catalog (plans, tiers, versioned prices).
  Additive only. No commercial price seeds.

  Tables:
    - billing_plans
    - billing_plan_tiers
    - billing_plan_prices

  Rollback: rollback/159_billing_commercial_catalog_rollback.sql
*/

USE dinamic_attendance;
GO

/* ---- billing_plans ---- */

IF OBJECT_ID(N'dbo.billing_plans', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.billing_plans (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_billing_plans PRIMARY KEY
            CONSTRAINT DF_billing_plans_id DEFAULT NEWID(),
        plan_code NVARCHAR(40) NOT NULL,
        display_name NVARCHAR(120) NOT NULL,
        description NVARCHAR(500) NULL,
        plan_kind NVARCHAR(20) NOT NULL
            CONSTRAINT DF_billing_plans_plan_kind DEFAULT N'STANDARD',
        sort_order INT NOT NULL
            CONSTRAINT DF_billing_plans_sort_order DEFAULT 0,
        is_active BIT NOT NULL
            CONSTRAINT DF_billing_plans_is_active DEFAULT 1,
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_billing_plans_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL
            CONSTRAINT DF_billing_plans_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_billing_plans_plan_code UNIQUE (plan_code),
        CONSTRAINT CK_billing_plans_plan_code_format CHECK (
            LEN(plan_code) >= 1
            AND plan_code = UPPER(plan_code)
            AND plan_code NOT LIKE '% %'
        ),
        CONSTRAINT CK_billing_plans_plan_kind CHECK (
            plan_kind IN (N'STANDARD', N'CUSTOM')
        ),
        CONSTRAINT CK_billing_plans_sort_order_nonneg CHECK (sort_order >= 0)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_billing_plans_active_sort'
      AND object_id = OBJECT_ID(N'dbo.billing_plans')
)
BEGIN
    CREATE INDEX IX_billing_plans_active_sort
        ON dbo.billing_plans (is_active, sort_order, display_name);
END;
GO

/* ---- billing_plan_tiers ---- */

IF OBJECT_ID(N'dbo.billing_plan_tiers', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.billing_plan_tiers (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_billing_plan_tiers PRIMARY KEY
            CONSTRAINT DF_billing_plan_tiers_id DEFAULT NEWID(),
        billing_plan_id UNIQUEIDENTIFIER NOT NULL,
        tier_code NVARCHAR(40) NOT NULL,
        display_name NVARCHAR(120) NOT NULL,
        seat_min INT NOT NULL,
        seat_max INT NULL,
        sort_order INT NOT NULL
            CONSTRAINT DF_billing_plan_tiers_sort_order DEFAULT 0,
        is_active BIT NOT NULL
            CONSTRAINT DF_billing_plan_tiers_is_active DEFAULT 1,
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_billing_plan_tiers_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL
            CONSTRAINT DF_billing_plan_tiers_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_billing_plan_tiers_plan
            FOREIGN KEY (billing_plan_id) REFERENCES dbo.billing_plans (id),
        CONSTRAINT UQ_billing_plan_tiers_plan_code UNIQUE (billing_plan_id, tier_code),
        CONSTRAINT CK_billing_plan_tiers_code_format CHECK (
            LEN(tier_code) >= 1
            AND tier_code = UPPER(tier_code)
            AND tier_code NOT LIKE '% %'
        ),
        CONSTRAINT CK_billing_plan_tiers_seat_min CHECK (
            seat_min >= 1 AND seat_min <= 2147483647
        ),
        CONSTRAINT CK_billing_plan_tiers_seat_range CHECK (
            seat_max IS NULL OR (seat_max >= seat_min AND seat_max <= 2147483647)
        ),
        CONSTRAINT CK_billing_plan_tiers_sort_order_nonneg CHECK (sort_order >= 0)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_billing_plan_tiers_plan_active_sort'
      AND object_id = OBJECT_ID(N'dbo.billing_plan_tiers')
)
BEGIN
    CREATE INDEX IX_billing_plan_tiers_plan_active_sort
        ON dbo.billing_plan_tiers (billing_plan_id, is_active, sort_order);
END;
GO

/* ---- billing_plan_prices (immutable amounts; close via effective_to only) ---- */

IF OBJECT_ID(N'dbo.billing_plan_prices', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.billing_plan_prices (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_billing_plan_prices PRIMARY KEY
            CONSTRAINT DF_billing_plan_prices_id DEFAULT NEWID(),
        billing_plan_tier_id UNIQUEIDENTIFIER NOT NULL,
        amount DECIMAL(18, 6) NOT NULL,
        currency CHAR(3) NOT NULL,
        billing_period NVARCHAR(10) NOT NULL,
        price_kind NVARCHAR(20) NOT NULL
            CONSTRAINT DF_billing_plan_prices_price_kind DEFAULT N'REGULAR',
        effective_from DATETIME2 NOT NULL,
        effective_to DATETIME2 NULL,
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_billing_plan_prices_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_billing_plan_prices_tier
            FOREIGN KEY (billing_plan_tier_id) REFERENCES dbo.billing_plan_tiers (id),
        CONSTRAINT CK_billing_plan_prices_currency CHECK (currency LIKE '[A-Z][A-Z][A-Z]'),
        CONSTRAINT CK_billing_plan_prices_amount_non_negative CHECK (amount >= 0),
        CONSTRAINT CK_billing_plan_prices_billing_period CHECK (
            billing_period IN (N'MONTHLY', N'YEARLY')
        ),
        CONSTRAINT CK_billing_plan_prices_price_kind CHECK (
            price_kind IN (N'REGULAR', N'PROMOTIONAL')
        ),
        CONSTRAINT CK_billing_plan_prices_effective_range CHECK (
            effective_to IS NULL OR effective_to > effective_from
        )
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_bpp_tier_currency_period_effective'
      AND object_id = OBJECT_ID(N'dbo.billing_plan_prices')
)
BEGIN
    CREATE INDEX IX_bpp_tier_currency_period_effective
        ON dbo.billing_plan_prices (
            billing_plan_tier_id,
            currency,
            billing_period,
            price_kind,
            effective_from,
            effective_to
        );
END;
GO

/* One open-ended row per tier + currency + period + price_kind (regular vs promotional). */
IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UX_bpp_open_applicability'
      AND object_id = OBJECT_ID(N'dbo.billing_plan_prices')
)
BEGIN
    DROP INDEX UX_bpp_open_applicability ON dbo.billing_plan_prices;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UX_bpp_open_applicability'
      AND object_id = OBJECT_ID(N'dbo.billing_plan_prices')
)
BEGIN
    CREATE UNIQUE INDEX UX_bpp_open_applicability
        ON dbo.billing_plan_prices (
            billing_plan_tier_id,
            currency,
            billing_period,
            price_kind
        )
        WHERE effective_to IS NULL;
END;
GO

/* No default commercial rates: catalog rows are inserted via platform tooling only. */
GO
