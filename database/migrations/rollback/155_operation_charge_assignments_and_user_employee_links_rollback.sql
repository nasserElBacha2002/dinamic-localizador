USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.operation_charge_assignments', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.operation_charge_assignments;
END;
GO

IF OBJECT_ID(N'dbo.company_user_employee_links', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.company_user_employee_links;
END;
GO
