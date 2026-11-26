/*
  Rollback: 175_commercial_seat_quota_rollback.sql
*/

USE dinamic_attendance;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_employees_company_active_quota'
      AND object_id = OBJECT_ID(N'dbo.employees')
)
BEGIN
    DROP INDEX IX_employees_company_active_quota ON dbo.employees;
END;
GO

IF OBJECT_ID(N'dbo.commercial_seat_quota_events', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.commercial_seat_quota_events;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_company_settings_commercial_seat_quota_mode'
      AND parent_object_id = OBJECT_ID(N'dbo.company_settings')
)
BEGIN
    ALTER TABLE dbo.company_settings DROP CONSTRAINT CK_company_settings_commercial_seat_quota_mode;
END;
GO

IF COL_LENGTH(N'dbo.company_settings', N'commercial_seat_quota_mode') IS NOT NULL
BEGIN
    ALTER TABLE dbo.company_settings DROP COLUMN commercial_seat_quota_mode;
END;
GO