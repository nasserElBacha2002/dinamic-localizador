/*
  Rollback: 096_scheduled_operations_onetime_lifecycle_index_rollback.sql
  Drops the ONE_TIME open-lifecycle filtered index.
*/

USE dinamic_attendance;
GO

IF EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'IX_scheduled_operations_onetime_open_lifecycle'
      AND object_id = OBJECT_ID(N'dbo.scheduled_operations')
)
BEGIN
    DROP INDEX IX_scheduled_operations_onetime_open_lifecycle
        ON dbo.scheduled_operations;
END;
GO
