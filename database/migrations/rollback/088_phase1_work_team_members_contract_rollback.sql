/*
  Rollback for 088_phase1_work_team_members_contract.sql
  Returns work_team_members to 087 expand state:
    - legacy single-column FKs
    - company_id NULLABLE (column retained)
  Does not drop company_id (owned by 087 expand).
*/

USE dinamic_attendance;
GO

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_work_team_members_team_company')
    ALTER TABLE dbo.work_team_members DROP CONSTRAINT FK_work_team_members_team_company;
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_work_team_members_employee_company')
    ALTER TABLE dbo.work_team_members DROP CONSTRAINT FK_work_team_members_employee_company;
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_work_team_members_company')
    ALTER TABLE dbo.work_team_members DROP CONSTRAINT FK_work_team_members_company;
GO

-- Index on company_id blocks ALTER COLUMN; drop/recreate around nullability change.
IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_work_team_members_company_team'
      AND object_id = OBJECT_ID(N'dbo.work_team_members')
)
    DROP INDEX IX_work_team_members_company_team ON dbo.work_team_members;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_work_team_members_team')
    ALTER TABLE dbo.work_team_members ADD CONSTRAINT FK_work_team_members_team
        FOREIGN KEY (work_team_id) REFERENCES dbo.work_teams (id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_work_team_members_employee')
    ALTER TABLE dbo.work_team_members ADD CONSTRAINT FK_work_team_members_employee
        FOREIGN KEY (employee_id) REFERENCES dbo.employees (id);
GO

IF EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.work_team_members')
      AND name = N'company_id'
      AND is_nullable = 0
)
BEGIN
    ALTER TABLE dbo.work_team_members
        ALTER COLUMN company_id UNIQUEIDENTIFIER NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_work_team_members_company_team'
      AND object_id = OBJECT_ID(N'dbo.work_team_members')
)
BEGIN
    CREATE INDEX IX_work_team_members_company_team
        ON dbo.work_team_members (company_id, work_team_id)
        INCLUDE (employee_id);
END;
GO
