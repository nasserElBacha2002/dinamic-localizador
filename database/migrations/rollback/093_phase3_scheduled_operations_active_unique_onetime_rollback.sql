/*
  Rollback: 093_phase3_scheduled_operations_active_unique_onetime_rollback.sql
  Reverts: 093 filter ensure. Leaves index absent (same end-state as rolling back 092).
  Re-apply 092/093 via migration runner to restore.
*/

USE dinamic_attendance;
GO

IF EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'UQ_scheduled_operations_active_service_start'
      AND object_id = OBJECT_ID(N'dbo.scheduled_operations')
)
BEGIN
    DROP INDEX UQ_scheduled_operations_active_service_start ON dbo.scheduled_operations;
END;
GO
