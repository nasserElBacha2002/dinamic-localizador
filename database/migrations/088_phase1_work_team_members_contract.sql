/*
  Migration: 088_phase1_work_team_members_contract.sql
  Purpose (Phase 1 corrections — expand/contract):
    Contract work_team_members.company_id after backend writes include company_id.
    - Preflight: no NULL company_id rows
    - ALTER company_id NOT NULL
    - FK to companies
    - Replace legacy single-column member FKs with composite tenant FKs
  Deploy order (required by deploy-backend.sh which migrates while old backend runs):
    1) Apply 087 (expand: nullable company_id + other composites) + deploy backend that writes company_id
    2) Apply 088 (this file) in a later release once all writers send company_id
  Idempotent: safe if already contracted by an earlier local 087 that included contract.
  Rollback: database/migrations/rollback/088_phase1_work_team_members_contract_rollback.sql
*/

USE dinamic_attendance;
GO

IF COL_LENGTH(N'dbo.work_team_members', N'company_id') IS NULL
BEGIN
    THROW 50088, 'SCHEMA_DRIFT: work_team_members.company_id missing; apply 087 expand first.', 1;
END;
GO

-- Deterministic refill for any rows still NULL (same rule as 087 expand).
UPDATE wtm
SET company_id = wt.company_id
FROM dbo.work_team_members wtm
INNER JOIN dbo.work_teams wt ON wt.id = wtm.work_team_id
WHERE wtm.company_id IS NULL;
GO

DECLARE @nullMembers INT;
SELECT @nullMembers = COUNT(*) FROM dbo.work_team_members WHERE company_id IS NULL;
IF @nullMembers > 0
BEGIN
    THROW 50088, 'CONTRACT_BLOCKED: work_team_members.company_id still NULL after backfill. Deploy backend that writes company_id before 088.', 1;
END;
GO

DECLARE @mismatch INT;
SELECT @mismatch = COUNT(*)
FROM dbo.work_team_members wtm
INNER JOIN dbo.work_teams wt ON wt.id = wtm.work_team_id
INNER JOIN dbo.employees e ON e.id = wtm.employee_id
WHERE wtm.company_id <> wt.company_id
   OR wtm.company_id <> e.company_id;
IF @mismatch > 0
BEGIN
    THROW 50088, 'CONTRACT_BLOCKED: work_team_members cross-tenant rows exist. Heal before 088.', 1;
END;
GO

IF EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.work_team_members')
      AND name = N'company_id'
      AND is_nullable = 1
)
BEGIN
    -- Index on company_id blocks ALTER COLUMN nullability changes.
    IF EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_work_team_members_company_team'
          AND object_id = OBJECT_ID(N'dbo.work_team_members')
    )
        DROP INDEX IX_work_team_members_company_team ON dbo.work_team_members;

    ALTER TABLE dbo.work_team_members
        ALTER COLUMN company_id UNIQUEIDENTIFIER NOT NULL;

    IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_work_team_members_company_team'
          AND object_id = OBJECT_ID(N'dbo.work_team_members')
    )
    BEGIN
        CREATE INDEX IX_work_team_members_company_team
            ON dbo.work_team_members (company_id, work_team_id)
            INCLUDE (employee_id);
    END
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_work_team_members_company'
      AND parent_object_id = OBJECT_ID(N'dbo.work_team_members')
)
BEGIN
    ALTER TABLE dbo.work_team_members
        ADD CONSTRAINT FK_work_team_members_company
        FOREIGN KEY (company_id) REFERENCES dbo.companies (id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_work_teams_company_id'
      AND object_id = OBJECT_ID(N'dbo.work_teams')
)
BEGIN
    CREATE UNIQUE INDEX UQ_work_teams_company_id
        ON dbo.work_teams (company_id, id);
END;
GO

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_work_team_members_team')
    ALTER TABLE dbo.work_team_members DROP CONSTRAINT FK_work_team_members_team;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_work_team_members_team_company')
BEGIN
    ALTER TABLE dbo.work_team_members
        ADD CONSTRAINT FK_work_team_members_team_company
        FOREIGN KEY (company_id, work_team_id)
        REFERENCES dbo.work_teams (company_id, id);
END;
GO

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_work_team_members_employee')
    ALTER TABLE dbo.work_team_members DROP CONSTRAINT FK_work_team_members_employee;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_work_team_members_employee_company')
BEGIN
    ALTER TABLE dbo.work_team_members
        ADD CONSTRAINT FK_work_team_members_employee_company
        FOREIGN KEY (company_id, employee_id)
        REFERENCES dbo.employees (company_id, id);
END;
GO
