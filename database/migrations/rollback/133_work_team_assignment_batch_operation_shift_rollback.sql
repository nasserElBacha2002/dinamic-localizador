/*
  Rollback: 133_work_team_assignment_batch_operation_shift_rollback.sql

  Drops shift FK/index/column from work_team_assignment_batches.
  Safe when column is unused or only nullable historical preview rows exist.
*/

USE dinamic_attendance;
GO

SET XACT_ABORT ON;
GO

IF OBJECT_ID(N'dbo.work_team_assignment_batches', N'U') IS NULL
BEGIN
    PRINT '133 rollback: work_team_assignment_batches missing — nothing to do';
    RETURN;
END;
GO

BEGIN TRY
    BEGIN TRANSACTION;

    IF EXISTS (
        SELECT 1 FROM sys.foreign_keys
        WHERE name = N'FK_work_team_assignment_batches_shift_tenant'
          AND parent_object_id = OBJECT_ID(N'dbo.work_team_assignment_batches')
    )
    BEGIN
        ALTER TABLE dbo.work_team_assignment_batches
            DROP CONSTRAINT FK_work_team_assignment_batches_shift_tenant;
    END;

    IF EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_work_team_assignment_batches_operation_shift'
          AND object_id = OBJECT_ID(N'dbo.work_team_assignment_batches')
    )
    BEGIN
        DROP INDEX IX_work_team_assignment_batches_operation_shift
            ON dbo.work_team_assignment_batches;
    END;

    IF COL_LENGTH(N'dbo.work_team_assignment_batches', N'operation_shift_id') IS NOT NULL
    BEGIN
        ALTER TABLE dbo.work_team_assignment_batches
            DROP COLUMN operation_shift_id;
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
