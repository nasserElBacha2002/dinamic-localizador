/*
  Migration: 074_absence_phase6_webhook_durable_claim.sql
  Purpose (Phase 6.1 corrections):
    - Durable webhook claim lease/version/retry metadata
    - Persist replayable response text (no secrets)
  Rollback: database/migrations/rollback/074_absence_phase6_webhook_durable_claim_rollback.sql
*/

USE dinamic_attendance;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.whatsapp_webhook_events')
      AND name = 'processing_owner'
)
BEGIN
    ALTER TABLE dbo.whatsapp_webhook_events
        ADD processing_owner NVARCHAR(80) NULL,
            processing_expires_at DATETIME2 NULL,
            processing_version BIGINT NOT NULL
                CONSTRAINT DF_wwe_processing_version DEFAULT 0,
            next_attempt_at DATETIME2 NULL,
            max_attempts INT NOT NULL
                CONSTRAINT DF_wwe_max_attempts DEFAULT 8,
            response_body NVARCHAR(MAX) NULL,
            response_type NVARCHAR(40) NULL;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_wwe_processing_status'
      AND parent_object_id = OBJECT_ID('dbo.whatsapp_webhook_events')
)
BEGIN
    ALTER TABLE dbo.whatsapp_webhook_events DROP CONSTRAINT CK_wwe_processing_status;
END;
GO

ALTER TABLE dbo.whatsapp_webhook_events
    ADD CONSTRAINT CK_wwe_processing_status
        CHECK (processing_status IN (
            N'RECEIVED',
            N'PROCESSING',
            N'PROCESSED',
            N'FAILED',
            N'ANOMALY'
        ));
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_wwe_processing_expires'
      AND object_id = OBJECT_ID('dbo.whatsapp_webhook_events')
)
BEGIN
    CREATE INDEX IX_wwe_processing_expires
        ON dbo.whatsapp_webhook_events (processing_status, processing_expires_at)
        INCLUDE (processing_owner, processing_version, attempt_count);
END;
GO
