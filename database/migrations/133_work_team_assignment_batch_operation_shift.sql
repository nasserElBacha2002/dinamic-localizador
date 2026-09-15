/*
  Migration: 133_work_team_assignment_batch_operation_shift.sql

  Phase 4: persist immutable operation_shift_id on work-team assignment preview batches
  so confirm cannot rebind to a different shift.

  - Nullable operation_shift_id (NULL for SINGLE)
  - Tenant-safe composite FK → operation_shifts (company_id, operation_id, id)

  IMPORTANT: ADD COLUMN must be in its own GO batch before FK/index references.
  Atomicity is owned by applySqlScriptInTransaction (Node TDS TX) — do not nest
  T-SQL BEGIN TRANSACTION here (error 266 with the runner).

  Rollback: rollback/133_work_team_assignment_batch_operation_shift_rollback.sql
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.work_team_assignment_batches', N'U') IS NULL
BEGIN
    THROW 50133, 'Precondition failed: work_team_assignment_batches missing', 1;
END;
GO

IF OBJECT_ID(N'dbo.operation_shifts', N'U') IS NULL
BEGIN
    THROW 50133, 'Precondition failed: operation_shifts missing (run 127 first)', 1;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_operation_shifts_company_operation_id'
      AND object_id = OBJECT_ID(N'dbo.operation_shifts')
)
BEGIN
    THROW 50133, 'Precondition failed: UQ_operation_shifts_company_operation_id missing', 1;
END;
GO

/* Column must be visible in a separate batch before FK/index. */
IF COL_LENGTH(N'dbo.work_team_assignment_batches', N'operation_shift_id') IS NULL
BEGIN
    ALTER TABLE dbo.work_team_assignment_batches
        ADD operation_shift_id UNIQUEIDENTIFIER NULL;
END;
GO

IF COL_LENGTH(N'dbo.work_team_assignment_batches', N'operation_shift_id') IS NULL
BEGIN
    THROW 50133, 'operation_shift_id column missing after ADD', 1;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_work_team_assignment_batches_shift_tenant'
      AND parent_object_id = OBJECT_ID(N'dbo.work_team_assignment_batches')
)
BEGIN
    ALTER TABLE dbo.work_team_assignment_batches
        ADD CONSTRAINT FK_work_team_assignment_batches_shift_tenant
            FOREIGN KEY (company_id, operation_id, operation_shift_id)
            REFERENCES dbo.operation_shifts (company_id, operation_id, id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_work_team_assignment_batches_operation_shift'
      AND object_id = OBJECT_ID(N'dbo.work_team_assignment_batches')
)
BEGIN
    CREATE INDEX IX_work_team_assignment_batches_operation_shift
        ON dbo.work_team_assignment_batches (company_id, operation_id, operation_shift_id)
        WHERE operation_shift_id IS NOT NULL;
END;
GO
