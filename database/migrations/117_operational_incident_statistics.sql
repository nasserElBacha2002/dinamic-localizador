/*
  Migration: 117_operational_incident_statistics.sql
  Purpose:
    - Explicit coverage events for replacement / coverage statistics
    - Explicit human business-change events for modified-operation statistics
    - Extend assignment_origin with COVERAGE for future manual coverages
    - Indexes for operational incident queries
    - Deterministic backfill of coverage events from ASSIGN_REPLACEMENT conflicts only
  Rollback: rollback/117_operational_incident_statistics_rollback.sql

  Historical reliability:
    - Coverage: reliable for RESOLVED ASSIGN_REPLACEMENT (backfilled) and future explicit events.
      Manual reassignments without COVERAGE origin are intentionally excluded.
    - Operation changes: reliable from deploy time via operation_change_events.
      Pre-deploy audit_logs are NOT backfilled (field-level diffs are incomplete).

  TZ note (clean installs):
    - Backfill operational_date uses CAST(... AS DATE) on UTC datetimes — incorrect near
      midnight for America/Argentina/Buenos_Aires. Migration 118 corrects existing rows
      using company timezone / operation_workdays.work_date. App inserts after 118 use
      getDateIsoInTimezone (see resolveOperationOperationalDate).
*/

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_operation_assignments_assignment_origin'
      AND parent_object_id = OBJECT_ID(N'dbo.operation_assignments')
)
BEGIN
    ALTER TABLE dbo.operation_assignments
        DROP CONSTRAINT CK_operation_assignments_assignment_origin;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_operation_assignments_assignment_origin'
      AND parent_object_id = OBJECT_ID(N'dbo.operation_assignments')
)
BEGIN
    ALTER TABLE dbo.operation_assignments
        ADD CONSTRAINT CK_operation_assignments_assignment_origin
        CHECK (assignment_origin IN (N'MANUAL', N'WORK_TEAM', N'SYSTEM', N'COVERAGE'));
END;
GO

IF OBJECT_ID(N'dbo.operation_coverage_events', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.operation_coverage_events (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_operation_coverage_events PRIMARY KEY
            DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        operation_id UNIQUEIDENTIFIER NOT NULL,
        operational_date DATE NOT NULL,
        source_type NVARCHAR(40) NOT NULL,
        source_conflict_id UNIQUEIDENTIFIER NULL,
        replaced_assignment_id UNIQUEIDENTIFIER NULL,
        replaced_employee_id UNIQUEIDENTIFIER NULL,
        replacement_assignment_id UNIQUEIDENTIFIER NULL,
        replacement_employee_id UNIQUEIDENTIFIER NOT NULL,
        work_team_id UNIQUEIDENTIFIER NULL,
        reason NVARCHAR(500) NULL,
        resolved_by_user_id UNIQUEIDENTIFIER NULL,
        occurred_at DATETIME2 NOT NULL
            CONSTRAINT DF_oce_occurred_at DEFAULT SYSUTCDATETIME(),
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_oce_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_oce_company FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
        CONSTRAINT FK_oce_operation FOREIGN KEY (operation_id) REFERENCES dbo.scheduled_operations (id),
        CONSTRAINT CK_oce_source_type CHECK (source_type IN (
            N'ABSENCE_ASSIGN_REPLACEMENT',
            N'MANUAL_COVERAGE'
        ))
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_oce_company_conflict'
      AND object_id = OBJECT_ID(N'dbo.operation_coverage_events')
)
BEGIN
    CREATE UNIQUE INDEX UQ_oce_company_conflict
        ON dbo.operation_coverage_events (company_id, source_conflict_id)
        WHERE source_conflict_id IS NOT NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_oce_company_operational_date'
      AND object_id = OBJECT_ID(N'dbo.operation_coverage_events')
)
BEGIN
    CREATE INDEX IX_oce_company_operational_date
        ON dbo.operation_coverage_events (company_id, operational_date)
        INCLUDE (operation_id, source_type, occurred_at);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_oce_company_operation'
      AND object_id = OBJECT_ID(N'dbo.operation_coverage_events')
)
BEGIN
    CREATE INDEX IX_oce_company_operation
        ON dbo.operation_coverage_events (company_id, operation_id, occurred_at);
END;
GO

IF OBJECT_ID(N'dbo.operation_change_events', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.operation_change_events (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_operation_change_events PRIMARY KEY
            DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        operation_id UNIQUEIDENTIFIER NOT NULL,
        operational_date DATE NOT NULL,
        change_action NVARCHAR(40) NOT NULL,
        changed_fields_json NVARCHAR(MAX) NOT NULL,
        actor_user_id UNIQUEIDENTIFIER NULL,
        source NVARCHAR(40) NOT NULL
            CONSTRAINT DF_oche_source DEFAULT N'HUMAN_API',
        reason NVARCHAR(500) NULL,
        occurred_at DATETIME2 NOT NULL
            CONSTRAINT DF_oche_occurred_at DEFAULT SYSUTCDATETIME(),
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_oche_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_oche_company FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
        CONSTRAINT FK_oche_operation FOREIGN KEY (operation_id) REFERENCES dbo.scheduled_operations (id),
        CONSTRAINT CK_oche_change_action CHECK (change_action IN (
            N'UPDATE',
            N'CANCEL',
            N'REACTIVATE',
            N'RESCHEDULE',
            N'ASSIGNMENT_CHANGE'
        )),
        CONSTRAINT CK_oche_source CHECK (source IN (
            N'HUMAN_API',
            N'SYSTEM_EXCLUDED'
        ))
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_oche_company_operational_date'
      AND object_id = OBJECT_ID(N'dbo.operation_change_events')
)
BEGIN
    CREATE INDEX IX_oche_company_operational_date
        ON dbo.operation_change_events (company_id, operational_date)
        INCLUDE (operation_id, change_action, source, occurred_at)
        WHERE source = N'HUMAN_API';
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_oche_company_operation'
      AND object_id = OBJECT_ID(N'dbo.operation_change_events')
)
BEGIN
    CREATE INDEX IX_oche_company_operation
        ON dbo.operation_change_events (company_id, operation_id, occurred_at);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_audit_logs_company_entity_action'
      AND object_id = OBJECT_ID(N'dbo.audit_logs')
)
BEGIN
    CREATE INDEX IX_audit_logs_company_entity_action
        ON dbo.audit_logs (company_id, entity_type, action, created_at)
        INCLUDE (entity_id, user_id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_aoc_company_resolution_coverage'
      AND object_id = OBJECT_ID(N'dbo.absence_operational_conflicts')
)
BEGIN
    CREATE INDEX IX_aoc_company_resolution_coverage
        ON dbo.absence_operational_conflicts (company_id, status, resolution_code)
        INCLUDE (operation_id, assignment_id, employee_id, replacement_employee_id, resolved_at);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_oa_company_confirmation_status'
      AND object_id = OBJECT_ID(N'dbo.operation_assignments')
)
BEGIN
    CREATE INDEX IX_oa_company_confirmation_status
        ON dbo.operation_assignments (company_id, confirmation_status, cancelled_at)
        INCLUDE (operation_id, employee_id);
END;
GO

-- Deterministic coverage backfill from explicit ASSIGN_REPLACEMENT resolutions only.
INSERT INTO dbo.operation_coverage_events (
    company_id,
    operation_id,
    operational_date,
    source_type,
    source_conflict_id,
    replaced_assignment_id,
    replaced_employee_id,
    replacement_assignment_id,
    replacement_employee_id,
    reason,
    resolved_by_user_id,
    occurred_at
)
SELECT
    c.company_id,
    c.operation_id,
    CAST(COALESCE(o.scheduled_start, c.resolved_at, c.created_at) AS DATE),
    N'ABSENCE_ASSIGN_REPLACEMENT',
    c.id,
    c.assignment_id,
    c.employee_id,
    NULL,
    c.replacement_employee_id,
    c.resolution_reason,
    c.resolved_by_user_id,
    COALESCE(c.resolved_at, c.created_at)
FROM dbo.absence_operational_conflicts c
INNER JOIN dbo.scheduled_operations o
    ON o.id = c.operation_id
   AND o.company_id = c.company_id
WHERE c.status = N'RESOLVED'
  AND c.resolution_code = N'ASSIGN_REPLACEMENT'
  AND c.operation_id IS NOT NULL
  AND c.replacement_employee_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM dbo.operation_coverage_events e
      WHERE e.company_id = c.company_id
        AND e.source_conflict_id = c.id
  );
GO
