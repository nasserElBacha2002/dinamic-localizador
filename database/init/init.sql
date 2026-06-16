IF DB_ID(N'dinamic_attendance') IS NULL
BEGIN
    CREATE DATABASE dinamic_attendance;
END;
GO

USE dinamic_attendance;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'system_migrations')
BEGIN
    CREATE TABLE system_migrations (
        id INT IDENTITY(1,1) PRIMARY KEY,
        migration_name NVARCHAR(255) NOT NULL UNIQUE,
        executed_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM system_migrations WHERE migration_name = '001_initial_schema.sql')
BEGIN
    INSERT INTO system_migrations (migration_name)
    VALUES ('001_initial_schema.sql');
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'system_settings')
BEGIN
    CREATE TABLE system_settings (
        setting_key NVARCHAR(100) PRIMARY KEY,
        setting_value NVARCHAR(500) NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END;
GO
