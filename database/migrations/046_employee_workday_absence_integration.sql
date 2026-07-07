-- Phase 5: absence / vacation integration with employee_workdays.

USE dinamic_attendance;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = 'FK_employee_workdays_absence_request'
      AND parent_object_id = OBJECT_ID('dbo.employee_workdays')
)
BEGIN
    ALTER TABLE dbo.employee_workdays
        ADD CONSTRAINT FK_employee_workdays_absence_request
        FOREIGN KEY (absence_request_id)
        REFERENCES dbo.absence_requests(id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_employee_workdays_absence_request_id'
      AND object_id = OBJECT_ID('dbo.employee_workdays')
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_employee_workdays_absence_request_id
        ON dbo.employee_workdays (company_id, absence_request_id)
        WHERE absence_request_id IS NOT NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_employee_workdays_employee_workday_lookup'
      AND object_id = OBJECT_ID('dbo.employee_workdays')
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_employee_workdays_employee_workday_lookup
        ON dbo.employee_workdays (company_id, employee_id, operation_workday_id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_absence_requests_approved_employee_dates'
      AND object_id = OBJECT_ID('dbo.absence_requests')
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_absence_requests_approved_employee_dates
        ON dbo.absence_requests (company_id, employee_id, start_date, end_date)
        INCLUDE (status, start_period, end_period, reviewed_at, created_at)
        WHERE status = N'APPROVED';
END;
GO
