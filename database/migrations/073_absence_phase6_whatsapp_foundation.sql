/*
  Migration: 073_absence_phase6_whatsapp_foundation.sql
  Purpose (Phase 6.1 foundation):
    - Durable webhook event claims (idempotency + payload hash anomaly detection)
    - Optimistic session fencing version on bot_sessions
  Rollback: database/migrations/rollback/073_absence_phase6_whatsapp_foundation_rollback.sql

  Note: Absence conversational sessions continue to use bot_sessions (already SQL-backed).
  Conceptual entity "whatsapp_absence_sessions" maps to bot_sessions rows in absence states.
*/

USE dinamic_attendance;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'whatsapp_webhook_events')
BEGIN
    CREATE TABLE dbo.whatsapp_webhook_events (
        id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        message_sid NVARCHAR(100) NOT NULL,
        event_type NVARCHAR(40) NOT NULL,
        payload_hash NVARCHAR(64) NOT NULL,
        processing_status NVARCHAR(30) NOT NULL
            CONSTRAINT DF_wwe_processing_status DEFAULT N'RECEIVED',
        response_reference NVARCHAR(200) NULL,
        processed_at DATETIME2 NULL,
        attempt_count INT NOT NULL
            CONSTRAINT DF_wwe_attempt_count DEFAULT 0,
        last_error NVARCHAR(1000) NULL,
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_wwe_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL
            CONSTRAINT DF_wwe_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_wwe_company
            FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
        CONSTRAINT CK_wwe_processing_status
            CHECK (processing_status IN (
                N'RECEIVED',
                N'PROCESSING',
                N'PROCESSED',
                N'DUPLICATE',
                N'FAILED',
                N'ANOMALY'
            )),
        CONSTRAINT UQ_wwe_company_sid_type
            UNIQUE (company_id, message_sid, event_type)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_wwe_company_status_created'
      AND object_id = OBJECT_ID('dbo.whatsapp_webhook_events')
)
BEGIN
    CREATE INDEX IX_wwe_company_status_created
        ON dbo.whatsapp_webhook_events (company_id, processing_status, created_at);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.bot_sessions')
      AND name = 'session_version'
)
BEGIN
    ALTER TABLE dbo.bot_sessions
        ADD session_version BIGINT NOT NULL
            CONSTRAINT DF_bot_sessions_session_version DEFAULT 0;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.bot_sessions')
      AND name = 'last_message_sid'
)
BEGIN
    ALTER TABLE dbo.bot_sessions
        ADD last_message_sid NVARCHAR(100) NULL;
END;
GO
