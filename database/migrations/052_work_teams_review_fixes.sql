USE dinamic_attendance;
GO

-- Work team review fixes: assignment versioning, batch item sources, status expansion, overlap index.
-- Rollback (manual):
--   DROP TABLE IF EXISTS dbo.work_team_assignment_batch_item_sources;
--   DROP INDEX IF EXISTS IX_operation_assignments_overlap ON dbo.operation_assignments;
--   ALTER TABLE dbo.work_team_assignment_batch_teams DROP COLUMN IF EXISTS assignment_version_snapshot;
--   ALTER TABLE dbo.work_teams DROP COLUMN IF EXISTS assignment_version;

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.work_teams')
      AND name = 'assignment_version'
)
BEGIN
    ALTER TABLE dbo.work_teams
        ADD assignment_version INT NOT NULL
            CONSTRAINT DF_work_teams_assignment_version DEFAULT 0;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.work_team_assignment_batch_teams')
      AND name = 'assignment_version_snapshot'
)
BEGIN
    ALTER TABLE dbo.work_team_assignment_batch_teams
        ADD assignment_version_snapshot INT NOT NULL
            CONSTRAINT DF_work_team_assignment_batch_teams_assignment_version DEFAULT 0;
END;
GO

IF OBJECT_ID('dbo.work_team_assignment_batch_item_sources', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.work_team_assignment_batch_item_sources (
        batch_item_id UNIQUEIDENTIFIER NOT NULL,
        work_team_id UNIQUEIDENTIFIER NOT NULL,
        is_primary BIT NOT NULL
            CONSTRAINT DF_work_team_assignment_batch_item_sources_is_primary DEFAULT 0,
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_work_team_assignment_batch_item_sources_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_work_team_assignment_batch_item_sources PRIMARY KEY (batch_item_id, work_team_id),
        CONSTRAINT FK_work_team_assignment_batch_item_sources_item
            FOREIGN KEY (batch_item_id) REFERENCES dbo.work_team_assignment_batch_items (id),
        CONSTRAINT FK_work_team_assignment_batch_item_sources_team
            FOREIGN KEY (work_team_id) REFERENCES dbo.work_teams (id)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_work_team_assignment_batch_item_sources_team'
      AND object_id = OBJECT_ID('dbo.work_team_assignment_batch_item_sources')
)
BEGIN
    CREATE INDEX IX_work_team_assignment_batch_item_sources_team
        ON dbo.work_team_assignment_batch_item_sources (work_team_id, batch_item_id)
        INCLUDE (is_primary);
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_work_team_assignment_batches_status'
      AND parent_object_id = OBJECT_ID('dbo.work_team_assignment_batches')
)
BEGIN
    ALTER TABLE dbo.work_team_assignment_batches
        DROP CONSTRAINT CK_work_team_assignment_batches_status;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_work_team_assignment_batches_status'
      AND parent_object_id = OBJECT_ID('dbo.work_team_assignment_batches')
)
BEGIN
    ALTER TABLE dbo.work_team_assignment_batches
        ADD CONSTRAINT CK_work_team_assignment_batches_status
        CHECK (status IN (N'PREVIEWED', N'COMPLETED', N'FAILED', N'EXPIRED', N'STALE'));
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_operation_assignments_overlap'
      AND object_id = OBJECT_ID('dbo.operation_assignments')
)
BEGIN
    CREATE INDEX IX_operation_assignments_overlap
        ON dbo.operation_assignments (company_id, operation_id, employee_id, valid_from, valid_until)
        WHERE cancelled_at IS NULL;
END;
GO
