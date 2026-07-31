/*
  Migration: 066_absence_phase4_gcs_attachments.sql
  Purpose:
    - absence_request_attachments metadata table (bytes in GCS only)
    - attachment_policy on absence_types (FORBIDDEN|OPTIONAL|REQUIRED)
    - Preserve requires_attachment → policy mapping
    - Feature flag absence_attachments_enabled DEFAULT 0
  Rollback: database/migrations/rollback/066_absence_phase4_gcs_attachments_rollback.sql
*/

USE dinamic_attendance;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.company_settings')
      AND name = 'absence_attachments_enabled'
)
BEGIN
    ALTER TABLE dbo.company_settings
        ADD absence_attachments_enabled BIT NOT NULL
            CONSTRAINT DF_company_settings_absence_attachments_enabled DEFAULT 0;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.absence_types')
      AND name = 'attachment_policy'
)
BEGIN
    ALTER TABLE dbo.absence_types
        ADD attachment_policy NVARCHAR(20) NOT NULL
            CONSTRAINT DF_absence_types_attachment_policy DEFAULT N'OPTIONAL';
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_absence_types_attachment_policy'
      AND parent_object_id = OBJECT_ID('dbo.absence_types')
)
BEGIN
    ALTER TABLE dbo.absence_types
        ADD CONSTRAINT CK_absence_types_attachment_policy
            CHECK (attachment_policy IN (N'FORBIDDEN', N'OPTIONAL', N'REQUIRED'));
END;
GO

-- Conservative backfill: requires_attachment true → REQUIRED, else OPTIONAL
UPDATE dbo.absence_types
SET attachment_policy = CASE
    WHEN requires_attachment = 1 THEN N'REQUIRED'
    ELSE N'OPTIONAL'
END;
GO

IF OBJECT_ID('dbo.absence_request_attachments', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.absence_request_attachments (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_ara_id DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        absence_request_id UNIQUEIDENTIFIER NOT NULL,
        storage_provider NVARCHAR(40) NOT NULL CONSTRAINT DF_ara_provider DEFAULT N'GOOGLE_CLOUD_STORAGE',
        bucket_name NVARCHAR(200) NOT NULL,
        object_key NVARCHAR(500) NOT NULL,
        object_generation BIGINT NULL,
        original_file_name NVARCHAR(255) NOT NULL,
        normalized_file_name NVARCHAR(255) NOT NULL,
        declared_content_type NVARCHAR(120) NOT NULL,
        detected_content_type NVARCHAR(120) NOT NULL,
        size_bytes BIGINT NOT NULL,
        checksum_sha256 CHAR(64) NOT NULL,
        status NVARCHAR(30) NOT NULL,
        scan_status NVARCHAR(30) NOT NULL CONSTRAINT DF_ara_scan DEFAULT N'UNSCANNED',
        uploaded_by_user_id UNIQUEIDENTIFIER NULL,
        uploaded_by_employee_id UNIQUEIDENTIFIER NULL,
        source NVARCHAR(30) NOT NULL,
        twilio_message_sid NVARCHAR(100) NULL,
        twilio_media_index INT NULL,
        attempt_count INT NOT NULL CONSTRAINT DF_ara_attempts DEFAULT 0,
        last_error NVARCHAR(1000) NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_ara_created DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL CONSTRAINT DF_ara_updated DEFAULT SYSUTCDATETIME(),
        available_at DATETIME2 NULL,
        deleted_at DATETIME2 NULL,
        deleted_by_user_id UNIQUEIDENTIFIER NULL,
        deletion_reason NVARCHAR(500) NULL,
        CONSTRAINT PK_absence_request_attachments PRIMARY KEY (id),
        CONSTRAINT FK_ara_company FOREIGN KEY (company_id) REFERENCES dbo.companies(id),
        CONSTRAINT FK_ara_request FOREIGN KEY (absence_request_id) REFERENCES dbo.absence_requests(id),
        CONSTRAINT CK_ara_status CHECK (status IN (
            N'PENDING_UPLOAD', N'UPLOADING', N'AVAILABLE', N'QUARANTINED',
            N'REJECTED', N'FAILED', N'PENDING_DELETE', N'DELETED'
        )),
        CONSTRAINT CK_ara_scan CHECK (scan_status IN (N'UNSCANNED', N'CLEAN', N'INFECTED', N'SKIPPED')),
        CONSTRAINT CK_ara_source CHECK (source IN (N'ADMIN', N'WHATSAPP', N'EMPLOYEE')),
        CONSTRAINT CK_ara_size CHECK (size_bytes > 0),
        CONSTRAINT CK_ara_provider CHECK (storage_provider = N'GOOGLE_CLOUD_STORAGE'),
        CONSTRAINT UQ_ara_object_key UNIQUE (company_id, object_key)
    );

    CREATE INDEX IX_ara_request_status
        ON dbo.absence_request_attachments (company_id, absence_request_id, status);

    CREATE INDEX IX_ara_cleanup
        ON dbo.absence_request_attachments (company_id, status, updated_at);

    CREATE UNIQUE INDEX UX_ara_twilio_media
        ON dbo.absence_request_attachments (company_id, twilio_message_sid, twilio_media_index)
        WHERE twilio_message_sid IS NOT NULL AND twilio_media_index IS NOT NULL;
END;
GO
