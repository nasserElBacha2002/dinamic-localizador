USE dinamic_attendance;
GO

-- Batch traceability for work team assignments to operations.
-- Rollback (manual):
--   ALTER TABLE dbo.operation_assignments DROP CONSTRAINT IF EXISTS FK_operation_assignments_source_batch;
--   ALTER TABLE dbo.operation_assignments DROP COLUMN IF EXISTS source_assignment_batch_id;
--   ALTER TABLE dbo.operation_assignments DROP COLUMN IF EXISTS source_work_team_id;
--   ALTER TABLE dbo.operation_assignments DROP COLUMN IF EXISTS assignment_origin;
--   DROP TABLE IF EXISTS dbo.work_team_assignment_batch_items;
--   DROP TABLE IF EXISTS dbo.work_team_assignment_batch_teams;
--   DROP TABLE IF EXISTS dbo.work_team_assignment_batches;

IF OBJECT_ID('dbo.work_team_assignment_batches', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.work_team_assignment_batches (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT DF_work_team_assignment_batches_id DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        operation_id UNIQUEIDENTIFIER NOT NULL,
        requested_by UNIQUEIDENTIFIER NULL,
        requested_at DATETIME2 NOT NULL
            CONSTRAINT DF_work_team_assignment_batches_requested_at DEFAULT SYSUTCDATETIME(),
        valid_from DATE NULL,
        valid_until DATE NULL,
        status NVARCHAR(20) NOT NULL
            CONSTRAINT DF_work_team_assignment_batches_status DEFAULT N'PREVIEWED',
        preview_expires_at DATETIME2 NULL,
        members_snapshot_hash NVARCHAR(128) NULL,
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_work_team_assignment_batches_created_at DEFAULT SYSUTCDATETIME(),
        completed_at DATETIME2 NULL,
        CONSTRAINT PK_work_team_assignment_batches PRIMARY KEY (id),
        CONSTRAINT FK_work_team_assignment_batches_company
            FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
        CONSTRAINT FK_work_team_assignment_batches_operation
            FOREIGN KEY (operation_id) REFERENCES dbo.scheduled_operations (id),
        CONSTRAINT CK_work_team_assignment_batches_status
            CHECK (status IN (N'PREVIEWED', N'COMPLETED', N'FAILED'))
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_work_team_assignment_batches_company_operation'
      AND object_id = OBJECT_ID('dbo.work_team_assignment_batches')
)
BEGIN
    CREATE INDEX IX_work_team_assignment_batches_company_operation
        ON dbo.work_team_assignment_batches (company_id, operation_id, requested_at DESC);
END;
GO

IF OBJECT_ID('dbo.work_team_assignment_batch_teams', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.work_team_assignment_batch_teams (
        batch_id UNIQUEIDENTIFIER NOT NULL,
        work_team_id UNIQUEIDENTIFIER NOT NULL,
        work_team_name_snapshot NVARCHAR(200) NOT NULL,
        work_team_updated_at_snapshot DATETIME2 NOT NULL,
        members_snapshot_hash NVARCHAR(128) NOT NULL,
        CONSTRAINT PK_work_team_assignment_batch_teams PRIMARY KEY (batch_id, work_team_id),
        CONSTRAINT FK_work_team_assignment_batch_teams_batch
            FOREIGN KEY (batch_id) REFERENCES dbo.work_team_assignment_batches (id),
        CONSTRAINT FK_work_team_assignment_batch_teams_team
            FOREIGN KEY (work_team_id) REFERENCES dbo.work_teams (id)
    );
END;
GO

IF OBJECT_ID('dbo.work_team_assignment_batch_items', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.work_team_assignment_batch_items (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT DF_work_team_assignment_batch_items_id DEFAULT NEWID(),
        batch_id UNIQUEIDENTIFIER NOT NULL,
        work_team_id UNIQUEIDENTIFIER NULL,
        employee_id UNIQUEIDENTIFIER NOT NULL,
        operation_assignment_id UNIQUEIDENTIFIER NULL,
        result NVARCHAR(20) NOT NULL,
        reason NVARCHAR(50) NULL,
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_work_team_assignment_batch_items_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_work_team_assignment_batch_items PRIMARY KEY (id),
        CONSTRAINT FK_work_team_assignment_batch_items_batch
            FOREIGN KEY (batch_id) REFERENCES dbo.work_team_assignment_batches (id),
        CONSTRAINT CK_work_team_assignment_batch_items_result
            CHECK (result IN (N'ADDED', N'SKIPPED')),
        CONSTRAINT CK_work_team_assignment_batch_items_reason
            CHECK (
                reason IS NULL
                OR reason IN (
                    N'already_assigned',
                    N'duplicate_in_request',
                    N'assignment_period_overlap',
                    N'employee_inactive',
                    N'employee_not_found'
                )
            )
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_work_team_assignment_batch_items_batch'
      AND object_id = OBJECT_ID('dbo.work_team_assignment_batch_items')
)
BEGIN
    CREATE INDEX IX_work_team_assignment_batch_items_batch
        ON dbo.work_team_assignment_batch_items (batch_id, result)
        INCLUDE (employee_id, work_team_id, reason, operation_assignment_id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_work_team_assignment_batch_items_assignment'
      AND object_id = OBJECT_ID('dbo.work_team_assignment_batch_items')
)
BEGIN
    CREATE INDEX IX_work_team_assignment_batch_items_assignment
        ON dbo.work_team_assignment_batch_items (operation_assignment_id)
        WHERE operation_assignment_id IS NOT NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.operation_assignments')
      AND name = 'source_assignment_batch_id'
)
BEGIN
    ALTER TABLE dbo.operation_assignments
        ADD source_assignment_batch_id UNIQUEIDENTIFIER NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.operation_assignments')
      AND name = 'source_work_team_id'
)
BEGIN
    ALTER TABLE dbo.operation_assignments
        ADD source_work_team_id UNIQUEIDENTIFIER NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.operation_assignments')
      AND name = 'assignment_origin'
)
BEGIN
    ALTER TABLE dbo.operation_assignments
        ADD assignment_origin NVARCHAR(20) NOT NULL
            CONSTRAINT DF_operation_assignments_assignment_origin DEFAULT N'MANUAL';
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_operation_assignments_assignment_origin'
      AND parent_object_id = OBJECT_ID('dbo.operation_assignments')
)
BEGIN
    ALTER TABLE dbo.operation_assignments
        ADD CONSTRAINT CK_operation_assignments_assignment_origin
        CHECK (assignment_origin IN (N'MANUAL', N'WORK_TEAM', N'SYSTEM'));
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_operation_assignments_source_batch'
      AND parent_object_id = OBJECT_ID('dbo.operation_assignments')
)
BEGIN
    ALTER TABLE dbo.operation_assignments
        ADD CONSTRAINT FK_operation_assignments_source_batch
        FOREIGN KEY (source_assignment_batch_id)
        REFERENCES dbo.work_team_assignment_batches (id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_operation_assignments_source_work_team'
      AND parent_object_id = OBJECT_ID('dbo.operation_assignments')
)
BEGIN
    ALTER TABLE dbo.operation_assignments
        ADD CONSTRAINT FK_operation_assignments_source_work_team
        FOREIGN KEY (source_work_team_id)
        REFERENCES dbo.work_teams (id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_operation_assignments_source_batch'
      AND object_id = OBJECT_ID('dbo.operation_assignments')
)
BEGIN
    CREATE INDEX IX_operation_assignments_source_batch
        ON dbo.operation_assignments (company_id, source_assignment_batch_id)
        WHERE source_assignment_batch_id IS NOT NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_operation_assignments_source_work_team'
      AND object_id = OBJECT_ID('dbo.operation_assignments')
)
BEGIN
    CREATE INDEX IX_operation_assignments_source_work_team
        ON dbo.operation_assignments (company_id, source_work_team_id)
        WHERE source_work_team_id IS NOT NULL;
END;
GO
