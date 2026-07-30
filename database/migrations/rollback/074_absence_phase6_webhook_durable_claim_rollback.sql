/*
  Rollback: 074_absence_phase6_webhook_durable_claim_rollback.sql
*/

USE dinamic_attendance;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_wwe_processing_expires'
      AND object_id = OBJECT_ID('dbo.whatsapp_webhook_events')
)
BEGIN
    DROP INDEX IX_wwe_processing_expires ON dbo.whatsapp_webhook_events;
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
            N'DUPLICATE',
            N'FAILED',
            N'ANOMALY'
        ));
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.whatsapp_webhook_events')
      AND name = 'processing_owner'
)
BEGIN
    DECLARE @sql NVARCHAR(MAX) = N'';
    IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_wwe_processing_version')
        SET @sql = @sql + N'ALTER TABLE dbo.whatsapp_webhook_events DROP CONSTRAINT DF_wwe_processing_version;';
    IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_wwe_max_attempts')
        SET @sql = @sql + N'ALTER TABLE dbo.whatsapp_webhook_events DROP CONSTRAINT DF_wwe_max_attempts;';
    SET @sql = @sql + N'
      ALTER TABLE dbo.whatsapp_webhook_events DROP COLUMN
        processing_owner, processing_expires_at, processing_version,
        next_attempt_at, max_attempts, response_body, response_type;';
    EXEC sp_executesql @sql;
END;
GO
