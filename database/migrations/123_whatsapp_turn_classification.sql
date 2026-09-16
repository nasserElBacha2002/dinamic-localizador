/*
  Migration: 123_whatsapp_turn_classification.sql

  Phase 1 (shadow): durable system-initiated interaction context +
  inbound turn classification telemetry. No quotas / no blocking.

  Deploy-safe before code: empty tables unused by older binaries.
  Rollback: rollback/123_whatsapp_turn_classification_rollback.sql
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.whatsapp_system_interactions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.whatsapp_system_interactions (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_whatsapp_system_interactions PRIMARY KEY
            CONSTRAINT DF_whatsapp_system_interactions_id DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        employee_id UNIQUEIDENTIFIER NOT NULL,
        channel NVARCHAR(20) NOT NULL
            CONSTRAINT DF_whatsapp_system_interactions_channel DEFAULT N'WHATSAPP',
        origin NVARCHAR(20) NOT NULL
            CONSTRAINT DF_whatsapp_system_interactions_origin DEFAULT N'SYSTEM',
        category NVARCHAR(80) NOT NULL,
        classification NVARCHAR(40) NOT NULL
            CONSTRAINT DF_whatsapp_system_interactions_classification DEFAULT N'SYSTEM_EXEMPT',
        related_operation_id UNIQUEIDENTIFIER NULL,
        source_job NVARCHAR(80) NOT NULL,
        source_key NVARCHAR(120) NOT NULL,
        source_message_id UNIQUEIDENTIFIER NULL,
        provider_message_sid NVARCHAR(64) NULL,
        status NVARCHAR(20) NOT NULL
            CONSTRAINT DF_whatsapp_system_interactions_status DEFAULT N'ACTIVE',
        started_at DATETIME2 NOT NULL
            CONSTRAINT DF_whatsapp_system_interactions_started_at DEFAULT SYSUTCDATETIME(),
        expires_at DATETIME2 NOT NULL,
        consumed_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_whatsapp_system_interactions_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL
            CONSTRAINT DF_whatsapp_system_interactions_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_whatsapp_system_interactions_origin
            CHECK (origin = N'SYSTEM'),
        CONSTRAINT CK_whatsapp_system_interactions_channel
            CHECK (channel = N'WHATSAPP'),
        CONSTRAINT CK_whatsapp_system_interactions_classification
            CHECK (classification = N'SYSTEM_EXEMPT'),
        CONSTRAINT CK_whatsapp_system_interactions_status
            CHECK (status IN (N'ACTIVE', N'CONSUMED', N'EXPIRED', N'CANCELLED')),
        CONSTRAINT UQ_whatsapp_system_interactions_source
            UNIQUE (company_id, source_key)
    );
END;
GO

IF OBJECT_ID(N'dbo.whatsapp_system_interactions', N'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_whatsapp_system_interactions_active_lookup'
          AND object_id = OBJECT_ID(N'dbo.whatsapp_system_interactions')
   )
BEGIN
    CREATE INDEX IX_whatsapp_system_interactions_active_lookup
        ON dbo.whatsapp_system_interactions (
            company_id, employee_id, status, expires_at, category
        )
        INCLUDE (related_operation_id, started_at);
END;
GO

IF OBJECT_ID(N'dbo.whatsapp_system_interactions', N'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_whatsapp_system_interactions_provider_sid'
          AND object_id = OBJECT_ID(N'dbo.whatsapp_system_interactions')
   )
BEGIN
    CREATE INDEX IX_whatsapp_system_interactions_provider_sid
        ON dbo.whatsapp_system_interactions (company_id, provider_message_sid)
        WHERE provider_message_sid IS NOT NULL;
END;
GO

IF OBJECT_ID(N'dbo.whatsapp_turn_classifications', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.whatsapp_turn_classifications (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_whatsapp_turn_classifications PRIMARY KEY
            CONSTRAINT DF_whatsapp_turn_classifications_id DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NULL,
        employee_id UNIQUEIDENTIFIER NULL,
        message_sid NVARCHAR(64) NOT NULL,
        message_type NVARCHAR(20) NOT NULL,
        origin NVARCHAR(20) NOT NULL,
        classification NVARCHAR(40) NOT NULL,
        category NVARCHAR(80) NOT NULL,
        reason_code NVARCHAR(80) NOT NULL,
        rule_version NVARCHAR(20) NOT NULL,
        active_session_intent NVARCHAR(80) NULL,
        active_session_state NVARCHAR(80) NULL,
        resolved_intent NVARCHAR(80) NULL,
        resolved_handler NVARCHAR(80) NULL,
        related_operation_id UNIQUEIDENTIFIER NULL,
        system_interaction_id UNIQUEIDENTIFIER NULL,
        classified_at DATETIME2 NOT NULL
            CONSTRAINT DF_whatsapp_turn_classifications_classified_at DEFAULT SYSUTCDATETIME(),
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_whatsapp_turn_classifications_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_whatsapp_turn_classifications_origin
            CHECK (origin IN (N'EMPLOYEE', N'SYSTEM', N'UNKNOWN')),
        CONSTRAINT CK_whatsapp_turn_classifications_classification
            CHECK (classification IN (
                N'CRITICAL_EXEMPT',
                N'EMPLOYEE_LIMITED',
                N'SYSTEM_EXEMPT',
                N'AMBIGUOUS'
            )),
        CONSTRAINT UQ_whatsapp_turn_classifications_message_sid
            UNIQUE (message_sid)
    );
END;
GO

IF OBJECT_ID(N'dbo.whatsapp_turn_classifications', N'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_whatsapp_turn_classifications_company_classified'
          AND object_id = OBJECT_ID(N'dbo.whatsapp_turn_classifications')
   )
BEGIN
    CREATE INDEX IX_whatsapp_turn_classifications_company_classified
        ON dbo.whatsapp_turn_classifications (company_id, classified_at DESC)
        INCLUDE (employee_id, classification, reason_code);
END;
GO
