/*
  Rollback: 092_phase3_scheduled_operations_active_unique_rollback.sql
  Reverts: database/migrations/092_phase3_scheduled_operations_active_unique.sql
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
