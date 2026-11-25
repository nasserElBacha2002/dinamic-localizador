/* DIN-473 corrections: version-scoped notification bindings */

IF COL_LENGTH(N'dbo.replacement_request_notifications', N'request_version') IS NULL
  ALTER TABLE dbo.replacement_request_notifications
    ADD request_version INT NOT NULL
    CONSTRAINT DF_replacement_notifications_request_version DEFAULT 1;
GO

UPDATE rn
SET rn.request_version = rr.request_version
FROM dbo.replacement_request_notifications rn
JOIN dbo.replacement_requests rr
  ON rr.company_id = rn.company_id AND rr.id = rn.request_id
WHERE rn.request_version = 1 AND rr.request_version <> 1;
GO

IF COL_LENGTH(N'dbo.replacement_requests', N'candidates_materialization_error') IS NULL
  ALTER TABLE dbo.replacement_requests
    ADD candidates_materialization_error NVARCHAR(500) NULL;
GO

IF COL_LENGTH(N'dbo.replacement_requests', N'primary_notification_alert_type') IS NULL
  ALTER TABLE dbo.replacement_requests
    ADD primary_notification_alert_type NVARCHAR(40) NULL;
GO

IF EXISTS (
  SELECT 1 FROM sys.key_constraints
  WHERE name = N'UQ_replacement_notifications_request_recipient'
    AND parent_object_id = OBJECT_ID(N'dbo.replacement_request_notifications')
)
  ALTER TABLE dbo.replacement_request_notifications
    DROP CONSTRAINT UQ_replacement_notifications_request_recipient;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'UQ_replacement_notifications_request_recipient_version'
    AND object_id = OBJECT_ID(N'dbo.replacement_request_notifications')
)
  CREATE UNIQUE INDEX UQ_replacement_notifications_request_recipient_version
    ON dbo.replacement_request_notifications(company_id, request_id, recipient_id, request_version);
GO