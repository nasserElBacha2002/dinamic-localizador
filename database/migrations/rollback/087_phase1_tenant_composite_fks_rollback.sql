/*
  Rollback for 087_phase1_tenant_composite_fks.sql
  Restores single-column FKs; drops composite uniques added by 087;
  drops work_team_members.company_id after restoring legacy member FKs.
  Does not delete or rewrite business data.

  Ownership (rollback safety):
    - Constraint/index names listed below are owned by Phase 1 (087/088).
    - Forward migration blocks on SCHEMA_DRIFT when neither legacy nor Phase 1
      composite FKs exist for critical relations — do not introduce same-named
      objects outside this migration family.
    - Prefer rolling back 088 before 087 when member composites are present.
    - Prefer re-applying from a known pre-087 backup in production over ad-hoc DROP.
*/

USE dinamic_attendance;
GO

/* --- Drop composite FKs and restore single-column (NO ACTION) --- */

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_attendance_records_employee_company')
    ALTER TABLE dbo.attendance_records DROP CONSTRAINT FK_attendance_records_employee_company;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_attendance_records_employee_id')
    ALTER TABLE dbo.attendance_records ADD CONSTRAINT FK_attendance_records_employee_id
        FOREIGN KEY (employee_id) REFERENCES dbo.employees (id);
GO

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_attendance_records_operation_company')
    ALTER TABLE dbo.attendance_records DROP CONSTRAINT FK_attendance_records_operation_company;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_attendance_records_operation_id')
    ALTER TABLE dbo.attendance_records ADD CONSTRAINT FK_attendance_records_operation_id
        FOREIGN KEY (operation_id) REFERENCES dbo.scheduled_operations (id);
GO

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_attendance_reviews_attendance_company')
    ALTER TABLE dbo.attendance_reviews DROP CONSTRAINT FK_attendance_reviews_attendance_company;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_attendance_reviews_attendance')
    ALTER TABLE dbo.attendance_reviews ADD CONSTRAINT FK_attendance_reviews_attendance
        FOREIGN KEY (attendance_id) REFERENCES dbo.attendance_records (id);
GO

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_scheduled_operations_service_company')
    ALTER TABLE dbo.scheduled_operations DROP CONSTRAINT FK_scheduled_operations_service_company;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_scheduled_operations_service_id')
    ALTER TABLE dbo.scheduled_operations ADD CONSTRAINT FK_scheduled_operations_service_id
        FOREIGN KEY (service_id) REFERENCES dbo.operational_locations (id);
GO

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_operation_assignments_employee_company')
    ALTER TABLE dbo.operation_assignments DROP CONSTRAINT FK_operation_assignments_employee_company;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_inventory_employees_employee_id')
    ALTER TABLE dbo.operation_assignments ADD CONSTRAINT FK_inventory_employees_employee_id
        FOREIGN KEY (employee_id) REFERENCES dbo.employees (id);
GO

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_operation_assignments_operation_company')
    ALTER TABLE dbo.operation_assignments DROP CONSTRAINT FK_operation_assignments_operation_company;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_operation_assignments_operation_id')
    ALTER TABLE dbo.operation_assignments ADD CONSTRAINT FK_operation_assignments_operation_id
        FOREIGN KEY (operation_id) REFERENCES dbo.scheduled_operations (id);
GO

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_operation_assignments_source_work_team_company')
    ALTER TABLE dbo.operation_assignments DROP CONSTRAINT FK_operation_assignments_source_work_team_company;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_operation_assignments_source_work_team')
    ALTER TABLE dbo.operation_assignments ADD CONSTRAINT FK_operation_assignments_source_work_team
        FOREIGN KEY (source_work_team_id) REFERENCES dbo.work_teams (id);
GO

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_absence_requests_employee_company')
    ALTER TABLE dbo.absence_requests DROP CONSTRAINT FK_absence_requests_employee_company;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_absence_requests_employee')
    ALTER TABLE dbo.absence_requests ADD CONSTRAINT FK_absence_requests_employee
        FOREIGN KEY (employee_id) REFERENCES dbo.employees (id);
GO

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_absence_requests_absence_type_company')
    ALTER TABLE dbo.absence_requests DROP CONSTRAINT FK_absence_requests_absence_type_company;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_absence_requests_absence_type')
    ALTER TABLE dbo.absence_requests ADD CONSTRAINT FK_absence_requests_absence_type
        FOREIGN KEY (absence_type_id) REFERENCES dbo.absence_types (id);
GO

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_absence_requests_calendar_company')
    ALTER TABLE dbo.absence_requests DROP CONSTRAINT FK_absence_requests_calendar_company;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_absence_requests_calendar')
    ALTER TABLE dbo.absence_requests ADD CONSTRAINT FK_absence_requests_calendar
        FOREIGN KEY (calendar_id) REFERENCES dbo.company_work_calendars (id);
GO

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ara_request_company')
    ALTER TABLE dbo.absence_request_attachments DROP CONSTRAINT FK_ara_request_company;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ara_request')
    ALTER TABLE dbo.absence_request_attachments ADD CONSTRAINT FK_ara_request
        FOREIGN KEY (absence_request_id) REFERENCES dbo.absence_requests (id);
GO

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ara_draft_company')
    ALTER TABLE dbo.absence_request_attachments DROP CONSTRAINT FK_ara_draft_company;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ara_draft')
    ALTER TABLE dbo.absence_request_attachments ADD CONSTRAINT FK_ara_draft
        FOREIGN KEY (draft_id) REFERENCES dbo.absence_request_drafts (id);
GO

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ard_employee_company')
    ALTER TABLE dbo.absence_request_drafts DROP CONSTRAINT FK_ard_employee_company;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ard_employee')
    ALTER TABLE dbo.absence_request_drafts ADD CONSTRAINT FK_ard_employee
        FOREIGN KEY (employee_id) REFERENCES dbo.employees (id);
GO

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ard_type_company')
    ALTER TABLE dbo.absence_request_drafts DROP CONSTRAINT FK_ard_type_company;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ard_type')
    ALTER TABLE dbo.absence_request_drafts ADD CONSTRAINT FK_ard_type
        FOREIGN KEY (absence_type_id) REFERENCES dbo.absence_types (id);
GO

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_employee_absence_balances_employee_company')
    ALTER TABLE dbo.employee_absence_balances DROP CONSTRAINT FK_employee_absence_balances_employee_company;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_employee_absence_balances_employee')
    ALTER TABLE dbo.employee_absence_balances ADD CONSTRAINT FK_employee_absence_balances_employee
        FOREIGN KEY (employee_id) REFERENCES dbo.employees (id);
GO

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_employee_absence_balances_absence_type_company')
    ALTER TABLE dbo.employee_absence_balances DROP CONSTRAINT FK_employee_absence_balances_absence_type_company;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_employee_absence_balances_absence_type')
    ALTER TABLE dbo.employee_absence_balances ADD CONSTRAINT FK_employee_absence_balances_absence_type
        FOREIGN KEY (absence_type_id) REFERENCES dbo.absence_types (id);
GO

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_eabm_employee_company')
    ALTER TABLE dbo.employee_absence_balance_movements DROP CONSTRAINT FK_eabm_employee_company;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_eabm_employee')
    ALTER TABLE dbo.employee_absence_balance_movements ADD CONSTRAINT FK_eabm_employee
        FOREIGN KEY (employee_id) REFERENCES dbo.employees (id);
GO

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_eabm_absence_type_company')
    ALTER TABLE dbo.employee_absence_balance_movements DROP CONSTRAINT FK_eabm_absence_type_company;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_eabm_absence_type')
    ALTER TABLE dbo.employee_absence_balance_movements ADD CONSTRAINT FK_eabm_absence_type
        FOREIGN KEY (absence_type_id) REFERENCES dbo.absence_types (id);
GO

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_eabm_balance_company')
    ALTER TABLE dbo.employee_absence_balance_movements DROP CONSTRAINT FK_eabm_balance_company;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_eabm_balance')
    ALTER TABLE dbo.employee_absence_balance_movements ADD CONSTRAINT FK_eabm_balance
        FOREIGN KEY (balance_id) REFERENCES dbo.employee_absence_balances (id);
GO

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_eabm_request_company')
    ALTER TABLE dbo.employee_absence_balance_movements DROP CONSTRAINT FK_eabm_request_company;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_eabm_request')
    ALTER TABLE dbo.employee_absence_balance_movements ADD CONSTRAINT FK_eabm_request
        FOREIGN KEY (absence_request_id) REFERENCES dbo.absence_requests (id);
GO

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_bot_sessions_employee_company')
    ALTER TABLE dbo.bot_sessions DROP CONSTRAINT FK_bot_sessions_employee_company;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_bot_sessions_employee')
    ALTER TABLE dbo.bot_sessions ADD CONSTRAINT FK_bot_sessions_employee
        FOREIGN KEY (employee_id) REFERENCES dbo.employees (id);
GO

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_bot_sessions_operation_company')
    ALTER TABLE dbo.bot_sessions DROP CONSTRAINT FK_bot_sessions_operation_company;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_bot_sessions_operation')
    ALTER TABLE dbo.bot_sessions ADD CONSTRAINT FK_bot_sessions_operation
        FOREIGN KEY (operation_id) REFERENCES dbo.scheduled_operations (id);
GO

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_whatsapp_attendance_notifications_employee_company')
    ALTER TABLE dbo.whatsapp_attendance_notifications DROP CONSTRAINT FK_whatsapp_attendance_notifications_employee_company;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_whatsapp_attendance_notifications_employee')
    ALTER TABLE dbo.whatsapp_attendance_notifications ADD CONSTRAINT FK_whatsapp_attendance_notifications_employee
        FOREIGN KEY (employee_id) REFERENCES dbo.employees (id);
GO

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_whatsapp_attendance_notifications_operation_company')
    ALTER TABLE dbo.whatsapp_attendance_notifications DROP CONSTRAINT FK_whatsapp_attendance_notifications_operation_company;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_whatsapp_attendance_notifications_operation')
    ALTER TABLE dbo.whatsapp_attendance_notifications ADD CONSTRAINT FK_whatsapp_attendance_notifications_operation
        FOREIGN KEY (operation_id) REFERENCES dbo.scheduled_operations (id);
GO

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_employee_workdays_absence_request_company')
    ALTER TABLE dbo.employee_workdays DROP CONSTRAINT FK_employee_workdays_absence_request_company;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_employee_workdays_absence_request')
    ALTER TABLE dbo.employee_workdays ADD CONSTRAINT FK_employee_workdays_absence_request
        FOREIGN KEY (absence_request_id) REFERENCES dbo.absence_requests (id);
GO

/* work_team_members expand rollback: drop index + company_id (composites belong to 088) */
IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_work_team_members_company_team'
      AND object_id = OBJECT_ID(N'dbo.work_team_members')
)
    DROP INDEX IX_work_team_members_company_team ON dbo.work_team_members;
GO

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_work_team_members_company')
    ALTER TABLE dbo.work_team_members DROP CONSTRAINT FK_work_team_members_company;
GO

-- If 088 already contracted on this DB, drop composites before dropping column.
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_work_team_members_team_company')
    ALTER TABLE dbo.work_team_members DROP CONSTRAINT FK_work_team_members_team_company;
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_work_team_members_employee_company')
    ALTER TABLE dbo.work_team_members DROP CONSTRAINT FK_work_team_members_employee_company;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_work_team_members_team')
    AND OBJECT_ID(N'dbo.work_team_members', N'U') IS NOT NULL
    ALTER TABLE dbo.work_team_members ADD CONSTRAINT FK_work_team_members_team
        FOREIGN KEY (work_team_id) REFERENCES dbo.work_teams (id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_work_team_members_employee')
    AND OBJECT_ID(N'dbo.work_team_members', N'U') IS NOT NULL
    ALTER TABLE dbo.work_team_members ADD CONSTRAINT FK_work_team_members_employee
        FOREIGN KEY (employee_id) REFERENCES dbo.employees (id);
GO

IF COL_LENGTH(N'dbo.work_team_members', N'company_id') IS NOT NULL
BEGIN
    ALTER TABLE dbo.work_team_members DROP COLUMN company_id;
END;
GO

/* Drop parent UQs added by 087 (only if no remaining dependents — already dropped composites above) */
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_attendance_records_company_id' AND object_id = OBJECT_ID(N'dbo.attendance_records'))
    DROP INDEX UQ_attendance_records_company_id ON dbo.attendance_records;
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_absence_types_company_id' AND object_id = OBJECT_ID(N'dbo.absence_types'))
    DROP INDEX UQ_absence_types_company_id ON dbo.absence_types;
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_absence_requests_company_id' AND object_id = OBJECT_ID(N'dbo.absence_requests'))
    DROP INDEX UQ_absence_requests_company_id ON dbo.absence_requests;
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_operational_locations_company_id' AND object_id = OBJECT_ID(N'dbo.operational_locations'))
    DROP INDEX UQ_operational_locations_company_id ON dbo.operational_locations;
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_work_teams_company_id' AND object_id = OBJECT_ID(N'dbo.work_teams'))
    DROP INDEX UQ_work_teams_company_id ON dbo.work_teams;
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_employee_absence_balances_company_id' AND object_id = OBJECT_ID(N'dbo.employee_absence_balances'))
    DROP INDEX UQ_employee_absence_balances_company_id ON dbo.employee_absence_balances;
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_absence_request_drafts_company_id' AND object_id = OBJECT_ID(N'dbo.absence_request_drafts'))
    DROP INDEX UQ_absence_request_drafts_company_id ON dbo.absence_request_drafts;
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_company_work_calendars_company_id' AND object_id = OBJECT_ID(N'dbo.company_work_calendars'))
    DROP INDEX UQ_company_work_calendars_company_id ON dbo.company_work_calendars;
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_operation_assignments_company_id' AND object_id = OBJECT_ID(N'dbo.operation_assignments'))
    DROP INDEX UQ_operation_assignments_company_id ON dbo.operation_assignments;
GO
