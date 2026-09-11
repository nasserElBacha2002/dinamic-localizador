/*
  Migration: 121_system_runtime_logs.sql

  Bounded technical runtime logs for Platform Admin Observability.
  No FKs to operational entities (correlation IDs only).
  Idempotent. No historical backfill.
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.system_runtime_logs', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.system_runtime_logs (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_system_runtime_logs PRIMARY KEY
            CONSTRAINT DF_system_runtime_logs_id DEFAULT NEWID(),
        schema_version INT NOT NULL
            CONSTRAINT DF_system_runtime_logs_schema_version DEFAULT 1,
        occurred_at DATETIME2 NOT NULL,
        level NVARCHAR(10) NOT NULL,
        service NVARCHAR(80) NOT NULL,
        service_instance_id NVARCHAR(80) NULL,
        environment NVARCHAR(40) NOT NULL,
        module NVARCHAR(80) NOT NULL,
        event NVARCHAR(120) NOT NULL,
        message NVARCHAR(1000) NOT NULL,
        error_code NVARCHAR(80) NULL,
        request_id NVARCHAR(64) NULL,
        correlation_id NVARCHAR(64) NULL,
        company_id UNIQUEIDENTIFIER NULL,
        operation_id UNIQUEIDENTIFIER NULL,
        employee_id UNIQUEIDENTIFIER NULL,
        conversation_id UNIQUEIDENTIFIER NULL,
        job_execution_id NVARCHAR(64) NULL,
        metadata_json NVARCHAR(MAX) NULL,
        error_name NVARCHAR(200) NULL,
        error_message NVARCHAR(1000) NULL,
        error_stack NVARCHAR(MAX) NULL,
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_system_runtime_logs_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_system_runtime_logs_level
            CHECK (level IN (N'error', N'warn', N'info')),
        CONSTRAINT CK_system_runtime_logs_schema_version
            CHECK (schema_version >= 1)
    );
END;
GO

IF OBJECT_ID(N'dbo.system_runtime_logs', N'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_srl_occurred_at'
          AND object_id = OBJECT_ID(N'dbo.system_runtime_logs')
   )
BEGIN
    CREATE INDEX IX_srl_occurred_at
        ON dbo.system_runtime_logs (occurred_at DESC)
        INCLUDE (level, module, event, company_id, request_id);
END;
GO

IF OBJECT_ID(N'dbo.system_runtime_logs', N'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_srl_level_occurred'
          AND object_id = OBJECT_ID(N'dbo.system_runtime_logs')
   )
BEGIN
    CREATE INDEX IX_srl_level_occurred
        ON dbo.system_runtime_logs (level, occurred_at DESC);
END;
GO

IF OBJECT_ID(N'dbo.system_runtime_logs', N'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_srl_module_occurred'
          AND object_id = OBJECT_ID(N'dbo.system_runtime_logs')
   )
BEGIN
    CREATE INDEX IX_srl_module_occurred
        ON dbo.system_runtime_logs (module, occurred_at DESC);
END;
GO

IF OBJECT_ID(N'dbo.system_runtime_logs', N'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_srl_company_occurred'
          AND object_id = OBJECT_ID(N'dbo.system_runtime_logs')
   )
BEGIN
    CREATE INDEX IX_srl_company_occurred
        ON dbo.system_runtime_logs (company_id, occurred_at DESC)
        WHERE company_id IS NOT NULL;
END;
GO

IF OBJECT_ID(N'dbo.system_runtime_logs', N'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_srl_request_id'
          AND object_id = OBJECT_ID(N'dbo.system_runtime_logs')
   )
BEGIN
    CREATE INDEX IX_srl_request_id
        ON dbo.system_runtime_logs (request_id)
        WHERE request_id IS NOT NULL;
END;
GO

IF OBJECT_ID(N'dbo.system_runtime_logs', N'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_srl_correlation_id'
          AND object_id = OBJECT_ID(N'dbo.system_runtime_logs')
   )
BEGIN
    CREATE INDEX IX_srl_correlation_id
        ON dbo.system_runtime_logs (correlation_id)
        WHERE correlation_id IS NOT NULL;
END;
GO

IF OBJECT_ID(N'dbo.system_runtime_logs', N'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_srl_job_execution_id'
          AND object_id = OBJECT_ID(N'dbo.system_runtime_logs')
   )
BEGIN
    CREATE INDEX IX_srl_job_execution_id
        ON dbo.system_runtime_logs (job_execution_id)
        WHERE job_execution_id IS NOT NULL;
END;
GO
