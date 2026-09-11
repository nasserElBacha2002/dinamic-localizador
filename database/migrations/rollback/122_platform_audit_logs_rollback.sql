/*
  Rollback: 122_platform_audit_logs_rollback.sql
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.platform_audit_logs', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.platform_audit_logs;
END;
GO
