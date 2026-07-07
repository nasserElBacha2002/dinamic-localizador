-- Phase 3 review fix: clarify operation_schedules.timezone authority.
-- COMPANY source: timezone is NULL (CompanyWorkSchedule owns timezone).
-- CUSTOM source: timezone is required.

USE dinamic_attendance;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_operation_schedules_timezone_source'
      AND parent_object_id = OBJECT_ID('dbo.operation_schedules')
)
BEGIN
    ALTER TABLE dbo.operation_schedules DROP CONSTRAINT CK_operation_schedules_timezone_source;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.operation_schedules')
      AND name = 'timezone'
      AND is_nullable = 0
)
BEGIN
    ALTER TABLE dbo.operation_schedules ALTER COLUMN timezone NVARCHAR(80) NULL;
END;
GO

UPDATE dbo.operation_schedules
SET timezone = NULL
WHERE schedule_source = N'COMPANY'
  AND timezone IS NOT NULL;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_operation_schedules_timezone_source'
      AND parent_object_id = OBJECT_ID('dbo.operation_schedules')
)
BEGIN
    ALTER TABLE dbo.operation_schedules
        ADD CONSTRAINT CK_operation_schedules_timezone_source
        CHECK (
            (schedule_source = N'COMPANY' AND timezone IS NULL)
            OR (schedule_source = N'CUSTOM' AND timezone IS NOT NULL)
        );
END;
GO

-- Validate recurring schedule consistency after migration.
IF EXISTS (
    SELECT 1
    FROM dbo.scheduled_operations o
    WHERE o.operation_kind = N'RECURRING'
      AND NOT EXISTS (
          SELECT 1
          FROM dbo.operation_schedules os
          WHERE os.operation_id = o.id
            AND os.company_id = o.company_id
      )
)
BEGIN
    THROW 51003, 'Migration 043: recurring operation without operation_schedules row', 1;
END;
GO

IF EXISTS (
    SELECT 1
    FROM dbo.operation_schedules os
    WHERE os.schedule_source = N'COMPANY'
      AND NOT EXISTS (
          SELECT 1
          FROM dbo.company_work_schedules cws
          WHERE cws.company_id = os.company_id
      )
)
BEGIN
    THROW 51004, 'Migration 043: COMPANY operation schedule without company_work_schedules', 1;
END;
GO

IF EXISTS (
    SELECT 1
    FROM dbo.operation_schedules os
    WHERE os.schedule_source = N'CUSTOM'
      AND (
          SELECT COUNT(*)
          FROM dbo.operation_schedule_days osd
          WHERE osd.operation_schedule_id = os.id
            AND osd.is_enabled = 1
      ) = 0
)
BEGIN
    THROW 51005, 'Migration 043: CUSTOM operation schedule without enabled weekdays', 1;
END;
GO
