USE dinamic_attendance;
GO

-- Reusable work team templates (employee groups) scoped per company.
-- Rollback (manual):
--   DROP TABLE IF EXISTS dbo.work_team_members;
--   DROP TABLE IF EXISTS dbo.work_teams;

IF OBJECT_ID('dbo.work_teams', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.work_teams (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT DF_work_teams_id DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        name NVARCHAR(200) NOT NULL,
        normalized_name NVARCHAR(200) NOT NULL,
        description NVARCHAR(500) NULL,
        is_active BIT NOT NULL
            CONSTRAINT DF_work_teams_is_active DEFAULT 1,
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_work_teams_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL
            CONSTRAINT DF_work_teams_updated_at DEFAULT SYSUTCDATETIME(),
        created_by UNIQUEIDENTIFIER NULL,
        updated_by UNIQUEIDENTIFIER NULL,
        CONSTRAINT PK_work_teams PRIMARY KEY (id),
        CONSTRAINT FK_work_teams_company
            FOREIGN KEY (company_id) REFERENCES dbo.companies (id)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_work_teams_company_id_normalized_name'
      AND object_id = OBJECT_ID('dbo.work_teams')
)
BEGIN
    CREATE UNIQUE INDEX UQ_work_teams_company_id_normalized_name
        ON dbo.work_teams (company_id, normalized_name);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_work_teams_company_active_updated'
      AND object_id = OBJECT_ID('dbo.work_teams')
)
BEGIN
    CREATE INDEX IX_work_teams_company_active_updated
        ON dbo.work_teams (company_id, is_active, updated_at DESC)
        INCLUDE (name, description);
END;
GO

IF OBJECT_ID('dbo.work_team_members', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.work_team_members (
        work_team_id UNIQUEIDENTIFIER NOT NULL,
        employee_id UNIQUEIDENTIFIER NOT NULL,
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_work_team_members_created_at DEFAULT SYSUTCDATETIME(),
        created_by UNIQUEIDENTIFIER NULL,
        CONSTRAINT PK_work_team_members PRIMARY KEY (work_team_id, employee_id),
        CONSTRAINT FK_work_team_members_team
            FOREIGN KEY (work_team_id) REFERENCES dbo.work_teams (id),
        CONSTRAINT FK_work_team_members_employee
            FOREIGN KEY (employee_id) REFERENCES dbo.employees (id)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_work_team_members_team'
      AND object_id = OBJECT_ID('dbo.work_team_members')
)
BEGIN
    CREATE INDEX IX_work_team_members_team
        ON dbo.work_team_members (work_team_id)
        INCLUDE (employee_id, created_at);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_work_team_members_employee'
      AND object_id = OBJECT_ID('dbo.work_team_members')
)
BEGIN
    CREATE INDEX IX_work_team_members_employee
        ON dbo.work_team_members (employee_id)
        INCLUDE (work_team_id);
END;
GO
