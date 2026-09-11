/*
  Migration: 122_platform_audit_logs.sql

  Platform-scoped audit trail (no company_id). Used for Platform Admin actions
  such as viewing system runtime log detail/context when the log has no company.
  Separate from tenant audit_logs and from system_runtime_logs.
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.platform_audit_logs', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.platform_audit_logs (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_platform_audit_logs PRIMARY KEY
            CONSTRAINT DF_platform_audit_logs_id DEFAULT NEWID(),
        user_id UNIQUEIDENTIFIER NOT NULL,
        action NVARCHAR(80) NOT NULL,
        entity_type NVARCHAR(80) NOT NULL,
        entity_id UNIQUEIDENTIFIER NOT NULL,
        result NVARCHAR(40) NOT NULL
            CONSTRAINT DF_platform_audit_logs_result DEFAULT N'SUCCESS',
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_platform_audit_logs_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_platform_audit_logs_result
            CHECK (result IN (N'SUCCESS', N'DENIED', N'ERROR'))
    );
END;
GO

IF OBJECT_ID(N'dbo.platform_audit_logs', N'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_platform_audit_logs_created_at'
          AND object_id = OBJECT_ID(N'dbo.platform_audit_logs')
   )
BEGIN
    CREATE INDEX IX_platform_audit_logs_created_at
        ON dbo.platform_audit_logs (created_at DESC)
        INCLUDE (user_id, action, entity_type);
END;
GO

IF OBJECT_ID(N'dbo.platform_audit_logs', N'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_platform_audit_logs_entity'
          AND object_id = OBJECT_ID(N'dbo.platform_audit_logs')
   )
BEGIN
    CREATE INDEX IX_platform_audit_logs_entity
        ON dbo.platform_audit_logs (entity_type, entity_id, created_at DESC);
END;
GO
