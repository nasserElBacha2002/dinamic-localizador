/*
  Rollback for 066_absence_phase4_gcs_attachments.sql
  Does NOT delete GCS objects — generate orphan report separately.
*/

USE dinamic_attendance;
GO

IF OBJECT_ID('dbo.absence_request_attachments', 'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.absence_request_attachments;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_absence_types_attachment_policy'
      AND parent_object_id = OBJECT_ID('dbo.absence_types')
)
    ALTER TABLE dbo.absence_types DROP CONSTRAINT CK_absence_types_attachment_policy;
GO

IF EXISTS (
    SELECT 1 FROM sys.default_constraints
    WHERE name = 'DF_absence_types_attachment_policy'
      AND parent_object_id = OBJECT_ID('dbo.absence_types')
)
    ALTER TABLE dbo.absence_types DROP CONSTRAINT DF_absence_types_attachment_policy;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.absence_types') AND name = 'attachment_policy'
)
    ALTER TABLE dbo.absence_types DROP COLUMN attachment_policy;
GO

IF EXISTS (
    SELECT 1 FROM sys.default_constraints
    WHERE name = 'DF_company_settings_absence_attachments_enabled'
      AND parent_object_id = OBJECT_ID('dbo.company_settings')
)
    ALTER TABLE dbo.company_settings DROP CONSTRAINT DF_company_settings_absence_attachments_enabled;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.company_settings') AND name = 'absence_attachments_enabled'
)
    ALTER TABLE dbo.company_settings DROP COLUMN absence_attachments_enabled;
GO
