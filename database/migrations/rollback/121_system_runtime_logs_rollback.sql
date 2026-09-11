/*
  Rollback: 121_system_runtime_logs_rollback.sql
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.system_runtime_logs', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.system_runtime_logs;
END;
GO
