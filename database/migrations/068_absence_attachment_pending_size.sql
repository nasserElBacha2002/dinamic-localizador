/*
  Migration: 068_absence_attachment_pending_size.sql
  Purpose: Allow size_bytes = 0 while PENDING_UPLOAD / UPLOADING (streaming upload
           reserves metadata before the real byte count is known).
  Does not edit 066 in place.
  Rollback: database/migrations/rollback/068_absence_attachment_pending_size_rollback.sql
*/

USE dinamic_attendance;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_ara_size'
      AND parent_object_id = OBJECT_ID('dbo.absence_request_attachments')
)
BEGIN
    ALTER TABLE dbo.absence_request_attachments DROP CONSTRAINT CK_ara_size;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_ara_size'
      AND parent_object_id = OBJECT_ID('dbo.absence_request_attachments')
)
BEGIN
    ALTER TABLE dbo.absence_request_attachments
        ADD CONSTRAINT CK_ara_size CHECK (
            (
                status IN (N'PENDING_UPLOAD', N'UPLOADING', N'FAILED', N'PENDING_DELETE', N'DELETED')
                AND size_bytes >= 0
            )
            OR (
                status IN (N'AVAILABLE', N'QUARANTINED', N'REJECTED')
                AND size_bytes > 0
            )
        );
END;
GO
