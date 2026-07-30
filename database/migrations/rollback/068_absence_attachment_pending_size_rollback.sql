/*
  Rollback: 068_absence_attachment_pending_size_rollback.sql
  Restores CK_ara_size to size_bytes > 0 (066 original).
  Fails if pending rows with size_bytes = 0 exist — clean those first.
*/

USE dinamic_attendance;
GO

IF EXISTS (
    SELECT 1
    FROM dbo.absence_request_attachments
    WHERE size_bytes <= 0
)
BEGIN
    THROW 50001, 'Cannot rollback CK_ara_size: rows with size_bytes <= 0 exist', 1;
END;
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

ALTER TABLE dbo.absence_request_attachments
    ADD CONSTRAINT CK_ara_size CHECK (size_bytes > 0);
GO
