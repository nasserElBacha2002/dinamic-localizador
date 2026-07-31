/*
  Migration: 069_absence_phase5_operational_integration.sql
  Purpose (Phase 5):
    - company_settings.absence_operational_integration_enabled (DEFAULT 0)
    - absence_requests.operational_impact_version
    - absence_operational_effects (idempotent applied effects)
    - absence_operational_conflicts (assignment/attendance conflicts; no silent unassign)
  Rollback: database/migrations/rollback/069_absence_phase5_operational_integration_rollback.sql
*/

USE dinamic_attendance;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.company_settings')
      AND name = 'absence_operational_integration_enabled'
)
BEGIN
    ALTER TABLE dbo.company_settings
        ADD absence_operational_integration_enabled BIT NOT NULL
            CONSTRAINT DF_cs_absence_operational_integration DEFAULT 0;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.absence_requests')
      AND name = 'operational_impact_version'
)
BEGIN
    ALTER TABLE dbo.absence_requests
        ADD operational_impact_version INT NOT NULL
            CONSTRAINT DF_ar_operational_impact_version DEFAULT 1;
END;
GO

IF OBJECT_ID('dbo.absence_operational_effects', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.absence_operational_effects (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_aoe_id DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        absence_request_id UNIQUEIDENTIFIER NOT NULL,
        absence_version INT NOT NULL,
        effect_type NVARCHAR(40) NOT NULL,
        target_entity_type NVARCHAR(40) NOT NULL,
        target_entity_id UNIQUEIDENTIFIER NOT NULL,
        previous_state_json NVARCHAR(MAX) NULL,
        applied_state_json NVARCHAR(MAX) NULL,
        status NVARCHAR(30) NOT NULL CONSTRAINT DF_aoe_status DEFAULT N'APPLIED',
        idempotency_key NVARCHAR(200) NOT NULL,
        applied_at DATETIME2 NOT NULL CONSTRAINT DF_aoe_applied DEFAULT SYSUTCDATETIME(),
        reverted_at DATETIME2 NULL,
        last_error NVARCHAR(1000) NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_aoe_created DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL CONSTRAINT DF_aoe_updated DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_absence_operational_effects PRIMARY KEY (id),
        CONSTRAINT FK_aoe_company FOREIGN KEY (company_id) REFERENCES dbo.companies(id),
        CONSTRAINT FK_aoe_request FOREIGN KEY (absence_request_id) REFERENCES dbo.absence_requests(id),
        CONSTRAINT CK_aoe_effect_type CHECK (effect_type IN (
            N'WORKDAY_JUSTIFIED',
            N'EMPLOYEE_UNAVAILABLE',
            N'OPERATION_WARNING',
            N'ASSIGNMENT_CONFLICT',
            N'ATTENDANCE_CONFLICT'
        )),
        CONSTRAINT CK_aoe_status CHECK (status IN (
            N'PENDING', N'APPLIED', N'FAILED', N'REVERTED', N'SUPERSEDED'
        )),
        CONSTRAINT UQ_aoe_idempotency UNIQUE (company_id, idempotency_key)
    );

    CREATE INDEX IX_aoe_request
        ON dbo.absence_operational_effects (company_id, absence_request_id, status);

    CREATE INDEX IX_aoe_target
        ON dbo.absence_operational_effects (company_id, target_entity_type, target_entity_id);
END;
GO

IF OBJECT_ID('dbo.absence_operational_conflicts', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.absence_operational_conflicts (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_aoc_id DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        absence_request_id UNIQUEIDENTIFIER NOT NULL,
        absence_version INT NOT NULL,
        conflict_type NVARCHAR(60) NOT NULL,
        severity NVARCHAR(20) NOT NULL CONSTRAINT DF_aoc_severity DEFAULT N'WARNING',
        status NVARCHAR(20) NOT NULL CONSTRAINT DF_aoc_status DEFAULT N'OPEN',
        operation_id UNIQUEIDENTIFIER NULL,
        service_id UNIQUEIDENTIFIER NULL,
        employee_id UNIQUEIDENTIFIER NOT NULL,
        assignment_id UNIQUEIDENTIFIER NULL,
        employee_workday_id UNIQUEIDENTIFIER NULL,
        replacement_employee_id UNIQUEIDENTIFIER NULL,
        resolution_code NVARCHAR(40) NULL,
        resolution_reason NVARCHAR(1000) NULL,
        resolved_by_user_id UNIQUEIDENTIFIER NULL,
        resolved_at DATETIME2 NULL,
        idempotency_key NVARCHAR(200) NOT NULL,
        range_start_at DATETIME2 NULL,
        range_end_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_aoc_created DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL CONSTRAINT DF_aoc_updated DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_absence_operational_conflicts PRIMARY KEY (id),
        CONSTRAINT FK_aoc_company FOREIGN KEY (company_id) REFERENCES dbo.companies(id),
        CONSTRAINT FK_aoc_request FOREIGN KEY (absence_request_id) REFERENCES dbo.absence_requests(id),
        CONSTRAINT FK_aoc_employee FOREIGN KEY (employee_id) REFERENCES dbo.employees(id),
        CONSTRAINT CK_aoc_type CHECK (conflict_type IN (
            N'ASSIGNMENT_DURING_ABSENCE',
            N'ATTENDANCE_RECORDED_DURING_APPROVED_ABSENCE',
            N'RESPONSIBLE_UNAVAILABLE',
            N'OPERATION_AFFECTED'
        )),
        CONSTRAINT CK_aoc_severity CHECK (severity IN (N'INFO', N'WARNING', N'CRITICAL')),
        CONSTRAINT CK_aoc_status CHECK (status IN (N'OPEN', N'RESOLVED', N'DISMISSED')),
        CONSTRAINT UQ_aoc_idempotency UNIQUE (company_id, idempotency_key)
    );

    CREATE INDEX IX_aoc_request_status
        ON dbo.absence_operational_conflicts (company_id, absence_request_id, status);

    CREATE INDEX IX_aoc_operation_status
        ON dbo.absence_operational_conflicts (company_id, operation_id, status)
        WHERE operation_id IS NOT NULL;

    CREATE INDEX IX_aoc_employee_status
        ON dbo.absence_operational_conflicts (company_id, employee_id, status);
END;
GO
