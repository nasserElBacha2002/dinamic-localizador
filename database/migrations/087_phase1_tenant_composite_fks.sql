/*
  Migration: 087_phase1_tenant_composite_fks.sql
  Purpose (Phase 1 — tenant isolation):
    - Parent UNIQUE (company_id, id) where missing for composite FK targets
    - Replace critical single-column FKs with composite (company_id, foreign_id)
    - EXPAND work_team_members.company_id (nullable + backfill) for rolling-deploy safety
      Contract (NOT NULL + member composites) is migration 088 (separate release after backend writes company_id).
  Strategy:
    - Prefight THROW 50087 on any cross-tenant mismatch (no heuristic heal)
    - Schema-drift preflight: expected legacy FKs / types before mutating
    - Prefer (company_id, id) key order (workday / 039 style)
    - Drop legacy single-column FK then add composite (preserve NO ACTION)
    - Do NOT touch payroll composites (082–084) or workday composites (039)
    - Do NOT harden observability nullable company_id (H9 deferred)
  Atomicity: migration runner applies this file in a single SQL transaction (see run-migrations.ts).
  Rollback: database/migrations/rollback/087_phase1_tenant_composite_fks_rollback.sql
*/

USE dinamic_attendance;
GO

/* =============================================================================
   Section 0 — Schema-drift preflight (expected pre-087 shape for critical objects)
   ============================================================================= */

IF OBJECT_ID(N'dbo.attendance_records', N'U') IS NULL
    OR OBJECT_ID(N'dbo.employees', N'U') IS NULL
    OR OBJECT_ID(N'dbo.work_team_members', N'U') IS NULL
BEGIN
    THROW 50087, 'SCHEMA_DRIFT: required Phase 1 tables missing (attendance_records/employees/work_team_members).', 1;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.attendance_records')
      AND name = N'company_id'
      AND system_type_id = TYPE_ID(N'uniqueidentifier')
)
BEGIN
    THROW 50087, 'SCHEMA_DRIFT: attendance_records.company_id missing or unexpected type.', 1;
END;
GO

-- If composites already present (resume after partial older runner), allow continue via IF NOT EXISTS below.
-- If neither legacy nor composite employee FK exists, block.
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_attendance_records_employee_id')
   AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_attendance_records_employee_company')
BEGIN
    THROW 50087, 'SCHEMA_DRIFT: expected FK_attendance_records_employee_id (or already-migrated employee_company).', 1;
END;
GO

IF COL_LENGTH(N'dbo.work_team_members', N'company_id') IS NULL
   AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_work_team_members_team')
BEGIN
    THROW 50087, 'SCHEMA_DRIFT: work_team_members missing legacy FK_work_team_members_team before expand.', 1;
END;
GO

/* =============================================================================
   Section A — Existing-data preflight (block migration on cross-tenant rows)
   ============================================================================= */

DECLARE @bad INT;

SELECT @bad = COUNT(*)
FROM dbo.attendance_records ar
INNER JOIN dbo.employees e ON e.id = ar.employee_id
WHERE ar.company_id <> e.company_id;
IF @bad > 0
BEGIN
    THROW 50087, 'Preflight failed: attendance_records ↔ employees cross-tenant rows exist. Heal before 087.', 1;
END;

SELECT @bad = COUNT(*)
FROM dbo.attendance_records ar
INNER JOIN dbo.scheduled_operations so ON so.id = ar.operation_id
WHERE ar.company_id <> so.company_id;
IF @bad > 0
BEGIN
    THROW 50087, 'Preflight failed: attendance_records ↔ scheduled_operations cross-tenant rows exist. Heal before 087.', 1;
END;

SELECT @bad = COUNT(*)
FROM dbo.attendance_reviews r
INNER JOIN dbo.attendance_records ar ON ar.id = r.attendance_id
WHERE r.company_id <> ar.company_id;
IF @bad > 0
BEGIN
    THROW 50087, 'Preflight failed: attendance_reviews ↔ attendance_records cross-tenant rows exist. Heal before 087.', 1;
END;

SELECT @bad = COUNT(*)
FROM dbo.scheduled_operations so
INNER JOIN dbo.operational_locations ol ON ol.id = so.service_id
WHERE so.company_id <> ol.company_id;
IF @bad > 0
BEGIN
    THROW 50087, 'Preflight failed: scheduled_operations ↔ operational_locations cross-tenant rows exist. Heal before 087.', 1;
END;

SELECT @bad = COUNT(*)
FROM dbo.operation_assignments oa
INNER JOIN dbo.employees e ON e.id = oa.employee_id
WHERE oa.company_id <> e.company_id;
IF @bad > 0
BEGIN
    THROW 50087, 'Preflight failed: operation_assignments ↔ employees cross-tenant rows exist. Heal before 087.', 1;
END;

SELECT @bad = COUNT(*)
FROM dbo.operation_assignments oa
INNER JOIN dbo.scheduled_operations so ON so.id = oa.operation_id
WHERE oa.company_id <> so.company_id;
IF @bad > 0
BEGIN
    THROW 50087, 'Preflight failed: operation_assignments ↔ scheduled_operations cross-tenant rows exist. Heal before 087.', 1;
END;

SELECT @bad = COUNT(*)
FROM dbo.absence_requests ar
INNER JOIN dbo.employees e ON e.id = ar.employee_id
WHERE ar.company_id <> e.company_id;
IF @bad > 0
BEGIN
    THROW 50087, 'Preflight failed: absence_requests ↔ employees cross-tenant rows exist. Heal before 087.', 1;
END;

SELECT @bad = COUNT(*)
FROM dbo.absence_requests ar
INNER JOIN dbo.absence_types atype ON atype.id = ar.absence_type_id
WHERE ar.company_id <> atype.company_id;
IF @bad > 0
BEGIN
    THROW 50087, 'Preflight failed: absence_requests ↔ absence_types cross-tenant rows exist. Heal before 087.', 1;
END;

SELECT @bad = COUNT(*)
FROM dbo.absence_requests ar
INNER JOIN dbo.company_work_calendars cwc ON cwc.id = ar.calendar_id
WHERE ar.calendar_id IS NOT NULL AND ar.company_id <> cwc.company_id;
IF @bad > 0
BEGIN
    THROW 50087, 'Preflight failed: absence_requests ↔ company_work_calendars cross-tenant rows exist. Heal before 087.', 1;
END;

SELECT @bad = COUNT(*)
FROM dbo.absence_request_attachments ara
INNER JOIN dbo.absence_requests ar ON ar.id = ara.absence_request_id
WHERE ara.absence_request_id IS NOT NULL AND ara.company_id <> ar.company_id;
IF @bad > 0
BEGIN
    THROW 50087, 'Preflight failed: absence_request_attachments ↔ absence_requests cross-tenant rows exist. Heal before 087.', 1;
END;

SELECT @bad = COUNT(*)
FROM dbo.absence_request_drafts d
INNER JOIN dbo.employees e ON e.id = d.employee_id
WHERE d.company_id <> e.company_id;
IF @bad > 0
BEGIN
    THROW 50087, 'Preflight failed: absence_request_drafts ↔ employees cross-tenant rows exist. Heal before 087.', 1;
END;

SELECT @bad = COUNT(*)
FROM dbo.absence_request_drafts d
INNER JOIN dbo.absence_types atype ON atype.id = d.absence_type_id
WHERE d.company_id <> atype.company_id;
IF @bad > 0
BEGIN
    THROW 50087, 'Preflight failed: absence_request_drafts ↔ absence_types cross-tenant rows exist. Heal before 087.', 1;
END;

SELECT @bad = COUNT(*)
FROM dbo.employee_absence_balances b
INNER JOIN dbo.employees e ON e.id = b.employee_id
WHERE b.company_id <> e.company_id;
IF @bad > 0
BEGIN
    THROW 50087, 'Preflight failed: employee_absence_balances ↔ employees cross-tenant rows exist. Heal before 087.', 1;
END;

SELECT @bad = COUNT(*)
FROM dbo.employee_absence_balances b
INNER JOIN dbo.absence_types atype ON atype.id = b.absence_type_id
WHERE b.company_id <> atype.company_id;
IF @bad > 0
BEGIN
    THROW 50087, 'Preflight failed: employee_absence_balances ↔ absence_types cross-tenant rows exist. Heal before 087.', 1;
END;

SELECT @bad = COUNT(*)
FROM dbo.employee_absence_balance_movements m
INNER JOIN dbo.employees e ON e.id = m.employee_id
WHERE m.company_id <> e.company_id;
IF @bad > 0
BEGIN
    THROW 50087, 'Preflight failed: employee_absence_balance_movements ↔ employees cross-tenant rows exist. Heal before 087.', 1;
END;

SELECT @bad = COUNT(*)
FROM dbo.employee_absence_balance_movements m
INNER JOIN dbo.employee_absence_balances b ON b.id = m.balance_id
WHERE m.company_id <> b.company_id;
IF @bad > 0
BEGIN
    THROW 50087, 'Preflight failed: employee_absence_balance_movements ↔ balances cross-tenant rows exist. Heal before 087.', 1;
END;

SELECT @bad = COUNT(*)
FROM dbo.employee_absence_balance_movements m
INNER JOIN dbo.absence_requests ar ON ar.id = m.absence_request_id
WHERE m.absence_request_id IS NOT NULL AND m.company_id <> ar.company_id;
IF @bad > 0
BEGIN
    THROW 50087, 'Preflight failed: ledger ↔ absence_requests cross-tenant rows exist. Heal before 087.', 1;
END;

SELECT @bad = COUNT(*)
FROM dbo.bot_sessions bs
INNER JOIN dbo.employees e ON e.id = bs.employee_id
WHERE bs.company_id <> e.company_id;
IF @bad > 0
BEGIN
    THROW 50087, 'Preflight failed: bot_sessions ↔ employees cross-tenant rows exist. Heal before 087.', 1;
END;

SELECT @bad = COUNT(*)
FROM dbo.bot_sessions bs
INNER JOIN dbo.scheduled_operations so ON so.id = bs.operation_id
WHERE bs.operation_id IS NOT NULL AND bs.company_id <> so.company_id;
IF @bad > 0
BEGIN
    THROW 50087, 'Preflight failed: bot_sessions ↔ scheduled_operations cross-tenant rows exist. Heal before 087.', 1;
END;

SELECT @bad = COUNT(*)
FROM dbo.whatsapp_attendance_notifications n
INNER JOIN dbo.employees e ON e.id = n.employee_id
WHERE n.company_id <> e.company_id;
IF @bad > 0
BEGIN
    THROW 50087, 'Preflight failed: whatsapp_attendance_notifications ↔ employees cross-tenant rows exist. Heal before 087.', 1;
END;

SELECT @bad = COUNT(*)
FROM dbo.whatsapp_attendance_notifications n
INNER JOIN dbo.scheduled_operations so ON so.id = n.operation_id
WHERE n.company_id <> so.company_id;
IF @bad > 0
BEGIN
    THROW 50087, 'Preflight failed: whatsapp_attendance_notifications ↔ scheduled_operations cross-tenant rows exist. Heal before 087.', 1;
END;

SELECT @bad = COUNT(*)
FROM dbo.work_team_members wtm
INNER JOIN dbo.work_teams wt ON wt.id = wtm.work_team_id
INNER JOIN dbo.employees e ON e.id = wtm.employee_id
WHERE wt.company_id <> e.company_id;
IF @bad > 0
BEGIN
    THROW 50087, 'Preflight failed: work_team_members team/employee company mismatch. Heal before 087.', 1;
END;

SELECT @bad = COUNT(*)
FROM dbo.employee_workdays ew
INNER JOIN dbo.absence_requests ar ON ar.id = ew.absence_request_id
WHERE ew.absence_request_id IS NOT NULL AND ew.company_id <> ar.company_id;
IF @bad > 0
BEGIN
    THROW 50087, 'Preflight failed: employee_workdays ↔ absence_requests cross-tenant rows exist. Heal before 087.', 1;
END;
GO

/* =============================================================================
   Section B — Parent UNIQUE (company_id, id) prerequisites
   ============================================================================= */

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_attendance_records_company_id'
      AND object_id = OBJECT_ID(N'dbo.attendance_records')
)
BEGIN
    CREATE UNIQUE INDEX UQ_attendance_records_company_id
        ON dbo.attendance_records (company_id, id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_absence_types_company_id'
      AND object_id = OBJECT_ID(N'dbo.absence_types')
)
BEGIN
    CREATE UNIQUE INDEX UQ_absence_types_company_id
        ON dbo.absence_types (company_id, id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_absence_requests_company_id'
      AND object_id = OBJECT_ID(N'dbo.absence_requests')
)
BEGIN
    CREATE UNIQUE INDEX UQ_absence_requests_company_id
        ON dbo.absence_requests (company_id, id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_operational_locations_company_id'
      AND object_id = OBJECT_ID(N'dbo.operational_locations')
)
BEGIN
    CREATE UNIQUE INDEX UQ_operational_locations_company_id
        ON dbo.operational_locations (company_id, id);
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

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_employee_absence_balances_company_id'
      AND object_id = OBJECT_ID(N'dbo.employee_absence_balances')
)
BEGIN
    CREATE UNIQUE INDEX UQ_employee_absence_balances_company_id
        ON dbo.employee_absence_balances (company_id, id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_absence_request_drafts_company_id'
      AND object_id = OBJECT_ID(N'dbo.absence_request_drafts')
)
BEGIN
    CREATE UNIQUE INDEX UQ_absence_request_drafts_company_id
        ON dbo.absence_request_drafts (company_id, id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_company_work_calendars_company_id'
      AND object_id = OBJECT_ID(N'dbo.company_work_calendars')
)
BEGIN
    CREATE UNIQUE INDEX UQ_company_work_calendars_company_id
        ON dbo.company_work_calendars (company_id, id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_operation_assignments_company_id'
      AND object_id = OBJECT_ID(N'dbo.operation_assignments')
)
BEGIN
    CREATE UNIQUE INDEX UQ_operation_assignments_company_id
        ON dbo.operation_assignments (company_id, id);
END;
GO

/* =============================================================================
   Section C — work_team_members EXPAND only (rolling-deploy safe)
   Leaves company_id NULLABLE so old backend INSERT without company_id still works
   until 088 contract runs after the new backend is deployed.
   ============================================================================= */

IF COL_LENGTH(N'dbo.work_team_members', N'company_id') IS NULL
BEGIN
    ALTER TABLE dbo.work_team_members
        ADD company_id UNIQUEIDENTIFIER NULL;
END;
GO

UPDATE wtm
SET company_id = wt.company_id
FROM dbo.work_team_members wtm
INNER JOIN dbo.work_teams wt ON wt.id = wtm.work_team_id
WHERE wtm.company_id IS NULL;
GO

-- Do NOT ALTER to NOT NULL here (contract = 088).
-- Optional FK to companies is deferred to 088 with NOT NULL to avoid mixed states.

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

/* =============================================================================
   Section D — Helper: drop single FK then add composite (company_id, fk)
   ============================================================================= */

-- attendance_records → employees
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_attendance_records_employee_id')
    ALTER TABLE dbo.attendance_records DROP CONSTRAINT FK_attendance_records_employee_id;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_attendance_records_employee_company')
BEGIN
    ALTER TABLE dbo.attendance_records
        ADD CONSTRAINT FK_attendance_records_employee_company
        FOREIGN KEY (company_id, employee_id)
        REFERENCES dbo.employees (company_id, id);
END;
GO

-- attendance_records → scheduled_operations
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_attendance_records_operation_id')
    ALTER TABLE dbo.attendance_records DROP CONSTRAINT FK_attendance_records_operation_id;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_attendance_records_operation_company')
BEGIN
    ALTER TABLE dbo.attendance_records
        ADD CONSTRAINT FK_attendance_records_operation_company
        FOREIGN KEY (company_id, operation_id)
        REFERENCES dbo.scheduled_operations (company_id, id);
END;
GO

-- attendance_reviews → attendance_records
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_attendance_reviews_attendance')
    ALTER TABLE dbo.attendance_reviews DROP CONSTRAINT FK_attendance_reviews_attendance;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_attendance_reviews_attendance_company')
BEGIN
    ALTER TABLE dbo.attendance_reviews
        ADD CONSTRAINT FK_attendance_reviews_attendance_company
        FOREIGN KEY (company_id, attendance_id)
        REFERENCES dbo.attendance_records (company_id, id);
END;
GO

-- scheduled_operations → operational_locations
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_scheduled_operations_service_id')
    ALTER TABLE dbo.scheduled_operations DROP CONSTRAINT FK_scheduled_operations_service_id;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_scheduled_operations_service_company')
BEGIN
    ALTER TABLE dbo.scheduled_operations
        ADD CONSTRAINT FK_scheduled_operations_service_company
        FOREIGN KEY (company_id, service_id)
        REFERENCES dbo.operational_locations (company_id, id);
END;
GO

-- operation_assignments → employees
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_inventory_employees_employee_id')
    ALTER TABLE dbo.operation_assignments DROP CONSTRAINT FK_inventory_employees_employee_id;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_operation_assignments_employee_company')
BEGIN
    ALTER TABLE dbo.operation_assignments
        ADD CONSTRAINT FK_operation_assignments_employee_company
        FOREIGN KEY (company_id, employee_id)
        REFERENCES dbo.employees (company_id, id);
END;
GO

-- operation_assignments → scheduled_operations
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_operation_assignments_operation_id')
    ALTER TABLE dbo.operation_assignments DROP CONSTRAINT FK_operation_assignments_operation_id;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_operation_assignments_operation_company')
BEGIN
    ALTER TABLE dbo.operation_assignments
        ADD CONSTRAINT FK_operation_assignments_operation_company
        FOREIGN KEY (company_id, operation_id)
        REFERENCES dbo.scheduled_operations (company_id, id);
END;
GO

-- operation_assignments → work_teams (nullable source)
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_operation_assignments_source_work_team')
    ALTER TABLE dbo.operation_assignments DROP CONSTRAINT FK_operation_assignments_source_work_team;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_operation_assignments_source_work_team_company')
BEGIN
    ALTER TABLE dbo.operation_assignments
        ADD CONSTRAINT FK_operation_assignments_source_work_team_company
        FOREIGN KEY (company_id, source_work_team_id)
        REFERENCES dbo.work_teams (company_id, id);
END;
GO

-- absence_requests → employees
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_absence_requests_employee')
    ALTER TABLE dbo.absence_requests DROP CONSTRAINT FK_absence_requests_employee;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_absence_requests_employee_company')
BEGIN
    ALTER TABLE dbo.absence_requests
        ADD CONSTRAINT FK_absence_requests_employee_company
        FOREIGN KEY (company_id, employee_id)
        REFERENCES dbo.employees (company_id, id);
END;
GO

-- absence_requests → absence_types
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_absence_requests_absence_type')
    ALTER TABLE dbo.absence_requests DROP CONSTRAINT FK_absence_requests_absence_type;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_absence_requests_absence_type_company')
BEGIN
    ALTER TABLE dbo.absence_requests
        ADD CONSTRAINT FK_absence_requests_absence_type_company
        FOREIGN KEY (company_id, absence_type_id)
        REFERENCES dbo.absence_types (company_id, id);
END;
GO

-- absence_requests → company_work_calendars (nullable)
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_absence_requests_calendar')
    ALTER TABLE dbo.absence_requests DROP CONSTRAINT FK_absence_requests_calendar;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_absence_requests_calendar_company')
BEGIN
    ALTER TABLE dbo.absence_requests
        ADD CONSTRAINT FK_absence_requests_calendar_company
        FOREIGN KEY (company_id, calendar_id)
        REFERENCES dbo.company_work_calendars (company_id, id);
END;
GO

-- absence_request_attachments → absence_requests (nullable request)
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ara_request')
    ALTER TABLE dbo.absence_request_attachments DROP CONSTRAINT FK_ara_request;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ara_request_company')
BEGIN
    ALTER TABLE dbo.absence_request_attachments
        ADD CONSTRAINT FK_ara_request_company
        FOREIGN KEY (company_id, absence_request_id)
        REFERENCES dbo.absence_requests (company_id, id);
END;
GO

-- absence_request_attachments → drafts (nullable)
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ara_draft')
    ALTER TABLE dbo.absence_request_attachments DROP CONSTRAINT FK_ara_draft;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ara_draft_company')
BEGIN
    ALTER TABLE dbo.absence_request_attachments
        ADD CONSTRAINT FK_ara_draft_company
        FOREIGN KEY (company_id, draft_id)
        REFERENCES dbo.absence_request_drafts (company_id, id);
END;
GO

-- absence_request_drafts → employees / types
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ard_employee')
    ALTER TABLE dbo.absence_request_drafts DROP CONSTRAINT FK_ard_employee;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ard_employee_company')
BEGIN
    ALTER TABLE dbo.absence_request_drafts
        ADD CONSTRAINT FK_ard_employee_company
        FOREIGN KEY (company_id, employee_id)
        REFERENCES dbo.employees (company_id, id);
END;
GO

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ard_type')
    ALTER TABLE dbo.absence_request_drafts DROP CONSTRAINT FK_ard_type;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ard_type_company')
BEGIN
    ALTER TABLE dbo.absence_request_drafts
        ADD CONSTRAINT FK_ard_type_company
        FOREIGN KEY (company_id, absence_type_id)
        REFERENCES dbo.absence_types (company_id, id);
END;
GO

-- balances
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_employee_absence_balances_employee')
    ALTER TABLE dbo.employee_absence_balances DROP CONSTRAINT FK_employee_absence_balances_employee;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_employee_absence_balances_employee_company')
BEGIN
    ALTER TABLE dbo.employee_absence_balances
        ADD CONSTRAINT FK_employee_absence_balances_employee_company
        FOREIGN KEY (company_id, employee_id)
        REFERENCES dbo.employees (company_id, id);
END;
GO

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_employee_absence_balances_absence_type')
    ALTER TABLE dbo.employee_absence_balances DROP CONSTRAINT FK_employee_absence_balances_absence_type;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_employee_absence_balances_absence_type_company')
BEGIN
    ALTER TABLE dbo.employee_absence_balances
        ADD CONSTRAINT FK_employee_absence_balances_absence_type_company
        FOREIGN KEY (company_id, absence_type_id)
        REFERENCES dbo.absence_types (company_id, id);
END;
GO

-- ledger movements
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_eabm_employee')
    ALTER TABLE dbo.employee_absence_balance_movements DROP CONSTRAINT FK_eabm_employee;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_eabm_employee_company')
BEGIN
    ALTER TABLE dbo.employee_absence_balance_movements
        ADD CONSTRAINT FK_eabm_employee_company
        FOREIGN KEY (company_id, employee_id)
        REFERENCES dbo.employees (company_id, id);
END;
GO

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_eabm_absence_type')
    ALTER TABLE dbo.employee_absence_balance_movements DROP CONSTRAINT FK_eabm_absence_type;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_eabm_absence_type_company')
BEGIN
    ALTER TABLE dbo.employee_absence_balance_movements
        ADD CONSTRAINT FK_eabm_absence_type_company
        FOREIGN KEY (company_id, absence_type_id)
        REFERENCES dbo.absence_types (company_id, id);
END;
GO

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_eabm_balance')
    ALTER TABLE dbo.employee_absence_balance_movements DROP CONSTRAINT FK_eabm_balance;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_eabm_balance_company')
BEGIN
    ALTER TABLE dbo.employee_absence_balance_movements
        ADD CONSTRAINT FK_eabm_balance_company
        FOREIGN KEY (company_id, balance_id)
        REFERENCES dbo.employee_absence_balances (company_id, id);
END;
GO

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_eabm_request')
    ALTER TABLE dbo.employee_absence_balance_movements DROP CONSTRAINT FK_eabm_request;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_eabm_request_company')
BEGIN
    ALTER TABLE dbo.employee_absence_balance_movements
        ADD CONSTRAINT FK_eabm_request_company
        FOREIGN KEY (company_id, absence_request_id)
        REFERENCES dbo.absence_requests (company_id, id);
END;
GO

-- bot_sessions
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_bot_sessions_employee')
    ALTER TABLE dbo.bot_sessions DROP CONSTRAINT FK_bot_sessions_employee;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_bot_sessions_employee_company')
BEGIN
    ALTER TABLE dbo.bot_sessions
        ADD CONSTRAINT FK_bot_sessions_employee_company
        FOREIGN KEY (company_id, employee_id)
        REFERENCES dbo.employees (company_id, id);
END;
GO

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_bot_sessions_operation')
    ALTER TABLE dbo.bot_sessions DROP CONSTRAINT FK_bot_sessions_operation;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_bot_sessions_operation_company')
BEGIN
    ALTER TABLE dbo.bot_sessions
        ADD CONSTRAINT FK_bot_sessions_operation_company
        FOREIGN KEY (company_id, operation_id)
        REFERENCES dbo.scheduled_operations (company_id, id);
END;
GO

-- whatsapp_attendance_notifications
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_whatsapp_attendance_notifications_employee')
    ALTER TABLE dbo.whatsapp_attendance_notifications DROP CONSTRAINT FK_whatsapp_attendance_notifications_employee;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_whatsapp_attendance_notifications_employee_company')
BEGIN
    ALTER TABLE dbo.whatsapp_attendance_notifications
        ADD CONSTRAINT FK_whatsapp_attendance_notifications_employee_company
        FOREIGN KEY (company_id, employee_id)
        REFERENCES dbo.employees (company_id, id);
END;
GO

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_whatsapp_attendance_notifications_operation')
    ALTER TABLE dbo.whatsapp_attendance_notifications DROP CONSTRAINT FK_whatsapp_attendance_notifications_operation;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_whatsapp_attendance_notifications_operation_company')
BEGIN
    ALTER TABLE dbo.whatsapp_attendance_notifications
        ADD CONSTRAINT FK_whatsapp_attendance_notifications_operation_company
        FOREIGN KEY (company_id, operation_id)
        REFERENCES dbo.scheduled_operations (company_id, id);
END;
GO

-- employee_workdays → absence_requests (nullable)
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_employee_workdays_absence_request')
    ALTER TABLE dbo.employee_workdays DROP CONSTRAINT FK_employee_workdays_absence_request;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_employee_workdays_absence_request_company')
BEGIN
    ALTER TABLE dbo.employee_workdays
        ADD CONSTRAINT FK_employee_workdays_absence_request_company
        FOREIGN KEY (company_id, absence_request_id)
        REFERENCES dbo.absence_requests (company_id, id);
END;
GO

-- work_team_members composites moved to 088 (contract after backend writes company_id).
GO
