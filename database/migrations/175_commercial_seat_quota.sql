/*
  Migration: 175_commercial_seat_quota.sql
  DIN-463 — Commercial seat quota settings and decision ledger (additive).
  Defaults: company mode NULL (inherit matrix); no global DB row — env only.

  Rollback: rollback/175_commercial_seat_quota_rollback.sql
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.company_settings', N'U') IS NULL
BEGIN
    THROW 50175, 'Precondition failed: company_settings missing', 1;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.company_settings')
      AND name = N'commercial_seat_quota_mode'
)
BEGIN
    ALTER TABLE dbo.company_settings
        ADD commercial_seat_quota_mode NVARCHAR(20) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_company_settings_commercial_seat_quota_mode'
      AND parent_object_id = OBJECT_ID(N'dbo.company_settings')
)
BEGIN
    ALTER TABLE dbo.company_settings
        ADD CONSTRAINT CK_company_settings_commercial_seat_quota_mode
            CHECK (
                commercial_seat_quota_mode IS NULL
                OR commercial_seat_quota_mode IN (N'DISABLED', N'OBSERVE', N'ENFORCE')
            );
END;
GO

IF OBJECT_ID(N'dbo.commercial_seat_quota_events', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.commercial_seat_quota_events (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_commercial_seat_quota_events PRIMARY KEY
            CONSTRAINT DF_commercial_seat_quota_events_id DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        occurred_at DATETIME2 NOT NULL
            CONSTRAINT DF_commercial_seat_quota_events_occurred_at DEFAULT SYSUTCDATETIME(),
        operation NVARCHAR(40) NOT NULL,
        effective_mode NVARCHAR(20) NOT NULL,
        decision NVARCHAR(30) NOT NULL,
        reason_code NVARCHAR(60) NOT NULL,
        active_count_before INT NULL,
        delta_requested INT NOT NULL,
        projected_count INT NULL,
        seat_max INT NULL,
        billing_subscription_id UNIQUEIDENTIFIER NULL,
        billing_subscription_term_id UNIQUEIDENTIFIER NULL,
        is_exempt BIT NOT NULL CONSTRAINT DF_csqe_is_exempt DEFAULT 0,
        enforce_seat_limit BIT NOT NULL CONSTRAINT DF_csqe_enforce_seat_limit DEFAULT 1,
        mutation_persisted BIT NOT NULL CONSTRAINT DF_csqe_mutation_persisted DEFAULT 0,
        correlation_id NVARCHAR(64) NULL,
        actor_user_id UNIQUEIDENTIFIER NULL,
        CONSTRAINT FK_commercial_seat_quota_events_company
            FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
        CONSTRAINT CK_csqe_effective_mode CHECK (
            effective_mode IN (N'DISABLED', N'OBSERVE', N'ENFORCE')
        ),
        CONSTRAINT CK_csqe_decision CHECK (
            decision IN (N'SKIPPED', N'ALLOWED', N'WOULD_EXCEED', N'REJECTED', N'INCONSISTENCY', N'EVALUATION_ERROR')
        ),
        CONSTRAINT CK_csqe_counts_non_negative CHECK (
            (active_count_before IS NULL OR active_count_before >= 0)
            AND delta_requested >= 0
            AND (projected_count IS NULL OR projected_count >= 0)
        )
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_csqe_company_occurred'
      AND object_id = OBJECT_ID(N'dbo.commercial_seat_quota_events')
)
BEGIN
    CREATE INDEX IX_csqe_company_occurred
        ON dbo.commercial_seat_quota_events (company_id, occurred_at DESC);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_employees_company_active_quota'
      AND object_id = OBJECT_ID(N'dbo.employees')
)
BEGIN
    CREATE INDEX IX_employees_company_active_quota
        ON dbo.employees (company_id, active)
        WHERE active = 1;
END;
GO