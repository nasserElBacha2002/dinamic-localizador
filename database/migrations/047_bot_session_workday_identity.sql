-- Phase 6: bot session workday-centric attendance identity
IF COL_LENGTH('bot_sessions', 'employee_workday_id') IS NULL
BEGIN
  ALTER TABLE bot_sessions
    ADD employee_workday_id UNIQUEIDENTIFIER NULL;
END;
GO

IF COL_LENGTH('bot_sessions', 'attendance_record_id') IS NULL
BEGIN
  ALTER TABLE bot_sessions
    ADD attendance_record_id UNIQUEIDENTIFIER NULL;
END;
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_bot_sessions_employee_workday_id'
    AND object_id = OBJECT_ID('bot_sessions')
)
BEGIN
  CREATE INDEX IX_bot_sessions_employee_workday_id
    ON bot_sessions (employee_workday_id)
    WHERE employee_workday_id IS NOT NULL;
END;
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_bot_sessions_attendance_record_id'
    AND object_id = OBJECT_ID('bot_sessions')
)
BEGIN
  CREATE INDEX IX_bot_sessions_attendance_record_id
    ON bot_sessions (attendance_record_id)
    WHERE attendance_record_id IS NOT NULL;
END;
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_employee_workdays_company_employee'
    AND object_id = OBJECT_ID('employee_workdays')
)
BEGIN
  CREATE INDEX IX_employee_workdays_company_employee
    ON employee_workdays (company_id, employee_id)
    INCLUDE (operation_workday_id, expectation_status);
END;
GO
