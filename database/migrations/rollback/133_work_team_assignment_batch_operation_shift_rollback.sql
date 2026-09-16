/*
  Rollback: 133_work_team_assignment_batch_operation_shift_rollback.sql

  Drops shift FK/index/column from work_team_assignment_batches.
  Safe when column is unused or only nullable historical preview rows exist.

  Atomicity is owned by applySqlScriptInTransaction (Node TDS TX).
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.work_team_assignment_batches', N'U') IS NULL
BEGIN
    PRINT '133 rollback: work_team_assignment_batches missing — nothing to do';
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_work_team_assignment_batches_shift_tenant'
      AND parent_object_id = OBJECT_ID(N'dbo.work_team_assignment_batches')
)
BEGIN
    ALTER TABLE dbo.work_team_assignment_batches
        DROP CONSTRAINT FK_work_team_assignment_batches_shift_tenant;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_work_team_assignment_batches_operation_shift'
      AND object_id = OBJECT_ID(N'dbo.work_team_assignment_batches')
)
BEGIN
    DROP INDEX IX_work_team_assignment_batches_operation_shift
        ON dbo.work_team_assignment_batches;
END;
GO

IF COL_LENGTH(N'dbo.work_team_assignment_batches', N'operation_shift_id') IS NOT NULL
BEGIN
    ALTER TABLE dbo.work_team_assignment_batches
        DROP COLUMN operation_shift_id;
END;
GO
