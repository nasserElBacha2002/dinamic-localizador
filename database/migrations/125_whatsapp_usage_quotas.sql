/*
  Migration: 125_whatsapp_usage_quotas.sql

  Phase 2: non-critical WhatsApp usage quotas (employee + company).
  Additive. Defaults OFF — no production ENFORCE from this migration.

  Preconditions: 123 + 124 (turn classification / system interactions).
  Rollback: rollback/125_whatsapp_usage_quotas_rollback.sql
  Operational rollback: set modes to OFF (preserves counters).
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.company_settings', N'U') IS NULL
BEGIN
    THROW 50125, 'Precondition failed: company_settings missing', 1;
END;
GO

IF OBJECT_ID(N'dbo.whatsapp_turn_classifications', N'U') IS NULL
BEGIN
    THROW 50125, 'Precondition failed: whatsapp_turn_classifications missing (apply 123)', 1;
END;
GO

/* ---- company_settings: quota policy (defaults safe / OFF) ---- */

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.company_settings')
      AND name = N'whatsapp_quota_mode'
)
BEGIN
    ALTER TABLE dbo.company_settings
        ADD whatsapp_quota_mode NVARCHAR(20) NOT NULL
            CONSTRAINT DF_company_settings_whatsapp_quota_mode DEFAULT N'OFF';
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_company_settings_whatsapp_quota_mode'
      AND parent_object_id = OBJECT_ID(N'dbo.company_settings')
)
BEGIN
    ALTER TABLE dbo.company_settings
        ADD CONSTRAINT CK_company_settings_whatsapp_quota_mode
            CHECK (whatsapp_quota_mode IN (N'OFF', N'SHADOW', N'ENFORCE'));
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.company_settings')
      AND name = N'whatsapp_quota_daily_turns'
)
BEGIN
    ALTER TABLE dbo.company_settings ADD
        whatsapp_quota_daily_turns INT NOT NULL
            CONSTRAINT DF_cs_wa_quota_daily_turns DEFAULT 20,
        whatsapp_quota_weekly_turns INT NOT NULL
            CONSTRAINT DF_cs_wa_quota_weekly_turns DEFAULT 60,
        whatsapp_quota_burst_turns INT NOT NULL
            CONSTRAINT DF_cs_wa_quota_burst_turns DEFAULT 5,
        whatsapp_quota_burst_window_seconds INT NOT NULL
            CONSTRAINT DF_cs_wa_quota_burst_window DEFAULT 60,
        whatsapp_quota_daily_outbounds INT NOT NULL
            CONSTRAINT DF_cs_wa_quota_daily_outbounds DEFAULT 40,
        whatsapp_quota_weekly_outbounds INT NOT NULL
            CONSTRAINT DF_cs_wa_quota_weekly_outbounds DEFAULT 120,
        whatsapp_quota_company_daily_outbounds INT NOT NULL
            CONSTRAINT DF_cs_wa_quota_company_daily_out DEFAULT 500,
        whatsapp_quota_limit_notice_enabled BIT NOT NULL
            CONSTRAINT DF_cs_wa_quota_notice_enabled DEFAULT 1;
END;
GO

/* ---- Employee period counters (DAY / WEEK) ---- */

IF OBJECT_ID(N'dbo.whatsapp_quota_employee_periods', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.whatsapp_quota_employee_periods (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_whatsapp_quota_employee_periods PRIMARY KEY
            CONSTRAINT DF_whatsapp_quota_employee_periods_id DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        employee_id UNIQUEIDENTIFIER NOT NULL,
        period_kind NVARCHAR(10) NOT NULL,
        period_key NVARCHAR(32) NOT NULL,
        period_start_utc DATETIME2 NOT NULL,
        period_end_utc DATETIME2 NOT NULL,
        timezone_id NVARCHAR(80) NOT NULL,
        turns_consumed INT NOT NULL
            CONSTRAINT DF_wqep_turns_consumed DEFAULT 0,
        turns_reserved INT NOT NULL
            CONSTRAINT DF_wqep_turns_reserved DEFAULT 0,
        outbounds_consumed INT NOT NULL
            CONSTRAINT DF_wqep_outbounds_consumed DEFAULT 0,
        outbounds_reserved INT NOT NULL
            CONSTRAINT DF_wqep_outbounds_reserved DEFAULT 0,
        turn_limit INT NOT NULL,
        outbound_limit INT NOT NULL,
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_wqep_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL
            CONSTRAINT DF_wqep_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_wqep_period_kind CHECK (period_kind IN (N'DAY', N'WEEK')),
        CONSTRAINT CK_wqep_nonneg CHECK (
            turns_consumed >= 0 AND turns_reserved >= 0
            AND outbounds_consumed >= 0 AND outbounds_reserved >= 0
            AND turn_limit >= 0 AND outbound_limit >= 0
        ),
        CONSTRAINT CK_wqep_turns_cap CHECK (turns_consumed + turns_reserved <= turn_limit),
        CONSTRAINT CK_wqep_outbounds_cap CHECK (outbounds_consumed + outbounds_reserved <= outbound_limit),
        CONSTRAINT UQ_wqep_period UNIQUE (company_id, employee_id, period_kind, period_key)
    );
END;
GO

IF OBJECT_ID(N'dbo.whatsapp_quota_employee_periods', N'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_wqep_company_employee'
          AND object_id = OBJECT_ID(N'dbo.whatsapp_quota_employee_periods')
   )
BEGIN
    CREATE INDEX IX_wqep_company_employee
        ON dbo.whatsapp_quota_employee_periods (company_id, employee_id, period_kind);
END;
GO

/* ---- Company daily outbound global ---- */

IF OBJECT_ID(N'dbo.whatsapp_quota_company_periods', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.whatsapp_quota_company_periods (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_whatsapp_quota_company_periods PRIMARY KEY
            CONSTRAINT DF_wqcp_id DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        period_kind NVARCHAR(10) NOT NULL,
        period_key NVARCHAR(32) NOT NULL,
        period_start_utc DATETIME2 NOT NULL,
        period_end_utc DATETIME2 NOT NULL,
        timezone_id NVARCHAR(80) NOT NULL,
        outbounds_consumed INT NOT NULL
            CONSTRAINT DF_wqcp_outbounds_consumed DEFAULT 0,
        outbounds_reserved INT NOT NULL
            CONSTRAINT DF_wqcp_outbounds_reserved DEFAULT 0,
        outbound_limit INT NOT NULL,
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_wqcp_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL
            CONSTRAINT DF_wqcp_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_wqcp_period_kind CHECK (period_kind = N'DAY'),
        CONSTRAINT CK_wqcp_nonneg CHECK (
            outbounds_consumed >= 0 AND outbounds_reserved >= 0 AND outbound_limit >= 0
        ),
        CONSTRAINT CK_wqcp_outbounds_cap CHECK (outbounds_consumed + outbounds_reserved <= outbound_limit),
        CONSTRAINT UQ_wqcp_period UNIQUE (company_id, period_kind, period_key)
    );
END;
GO

/* ---- Turn admissions (MessageSid idempotency) ---- */

IF OBJECT_ID(N'dbo.whatsapp_quota_turn_admissions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.whatsapp_quota_turn_admissions (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_whatsapp_quota_turn_admissions PRIMARY KEY
            CONSTRAINT DF_wqta_id DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        employee_id UNIQUEIDENTIFIER NOT NULL,
        message_sid NVARCHAR(64) NOT NULL,
        decision NVARCHAR(40) NOT NULL,
        reason_code NVARCHAR(80) NOT NULL,
        classification NVARCHAR(40) NOT NULL,
        day_period_id UNIQUEIDENTIFIER NULL,
        week_period_id UNIQUEIDENTIFIER NULL,
        mode NVARCHAR(20) NOT NULL,
        admitted_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_wqta_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_wqta_message_sid UNIQUE (message_sid),
        CONSTRAINT CK_wqta_decision CHECK (decision IN (
            N'ADMITTED',
            N'REJECTED',
            N'EXEMPT_CRITICAL',
            N'SHADOW_WOULD_ADMIT',
            N'SHADOW_WOULD_REJECT',
            N'QUOTA_FAILURE',
            N'AMBIGUOUS_HELD',
            N'DUPLICATE'
        ))
    );
END;
GO

IF OBJECT_ID(N'dbo.whatsapp_quota_turn_admissions', N'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_wqta_employee_admitted_at'
          AND object_id = OBJECT_ID(N'dbo.whatsapp_quota_turn_admissions')
   )
BEGIN
    CREATE INDEX IX_wqta_employee_admitted_at
        ON dbo.whatsapp_quota_turn_admissions (company_id, employee_id, admitted_at)
        WHERE admitted_at IS NOT NULL;
END;
GO

/* ---- Outbound reservations ---- */

IF OBJECT_ID(N'dbo.whatsapp_quota_outbound_reservations', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.whatsapp_quota_outbound_reservations (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_whatsapp_quota_outbound_reservations PRIMARY KEY
            CONSTRAINT DF_wqor_id DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        employee_id UNIQUEIDENTIFIER NOT NULL,
        turn_message_sid NVARCHAR(64) NOT NULL,
        logical_outbound_key NVARCHAR(160) NOT NULL,
        status NVARCHAR(30) NOT NULL,
        provider_message_sid NVARCHAR(64) NULL,
        day_period_id UNIQUEIDENTIFIER NULL,
        week_period_id UNIQUEIDENTIFIER NULL,
        company_period_id UNIQUEIDENTIFIER NULL,
        reason_code NVARCHAR(80) NULL,
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_wqor_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL
            CONSTRAINT DF_wqor_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_wqor_logical_key UNIQUE (logical_outbound_key),
        CONSTRAINT CK_wqor_status CHECK (status IN (
            N'RESERVED',
            N'ATTEMPT_STARTED',
            N'ACCEPTED',
            N'RELEASED',
            N'AMBIGUOUS'
        ))
    );
END;
GO

IF OBJECT_ID(N'dbo.whatsapp_quota_outbound_reservations', N'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_wqor_turn'
          AND object_id = OBJECT_ID(N'dbo.whatsapp_quota_outbound_reservations')
   )
BEGIN
    CREATE INDEX IX_wqor_turn
        ON dbo.whatsapp_quota_outbound_reservations (company_id, turn_message_sid);
END;
GO

/* ---- Limit notice episodes (one notice per block episode) ---- */

IF OBJECT_ID(N'dbo.whatsapp_quota_limit_notices', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.whatsapp_quota_limit_notices (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_whatsapp_quota_limit_notices PRIMARY KEY
            CONSTRAINT DF_wqln_id DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        employee_id UNIQUEIDENTIFIER NOT NULL,
        episode_key NVARCHAR(160) NOT NULL,
        status NVARCHAR(30) NOT NULL,
        blocking_reason NVARCHAR(80) NOT NULL,
        recover_at_utc DATETIME2 NULL,
        outbound_reservation_id UNIQUEIDENTIFIER NULL,
        provider_message_sid NVARCHAR(64) NULL,
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_wqln_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL
            CONSTRAINT DF_wqln_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_wqln_episode UNIQUE (company_id, employee_id, episode_key),
        CONSTRAINT CK_wqln_status CHECK (status IN (
            N'RESERVED',
            N'SENT',
            N'SUPPRESSED',
            N'AMBIGUOUS'
        ))
    );
END;
GO

/*
  Soft references only (no FK to companies/employees): retention and tenant deletion
  must not cascade-block quota telemetry. Tenant isolation via company_id + employee_id.
*/
