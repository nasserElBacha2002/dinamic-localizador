-- Minimal company_modules for Phase 1 navigation/feature flags.

USE dinamic_attendance;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'company_modules')
BEGIN
    CREATE TABLE company_modules (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_company_modules PRIMARY KEY DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        module_key NVARCHAR(80) NOT NULL,
        is_enabled BIT NOT NULL CONSTRAINT DF_company_modules_is_enabled DEFAULT 1,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_company_modules_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL CONSTRAINT DF_company_modules_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_company_modules_company FOREIGN KEY (company_id) REFERENCES companies (id),
        CONSTRAINT UQ_company_modules_company_module UNIQUE (company_id, module_key)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_company_modules_company_id'
      AND object_id = OBJECT_ID('company_modules')
)
BEGIN
    CREATE INDEX IX_company_modules_company_id ON company_modules (company_id);
END;
GO

DECLARE @dinamicId UNIQUEIDENTIFIER;
SELECT @dinamicId = id FROM companies WHERE name = N'Dinamic Systems';

IF @dinamicId IS NOT NULL
BEGIN
    INSERT INTO company_modules (company_id, module_key, is_enabled)
    SELECT @dinamicId, module_key, 1
    FROM (VALUES
        (N'attendance'),
        (N'inventory_operations'),
        (N'absences'),
        (N'reports'),
        (N'bot_simulator')
    ) AS modules(module_key)
    WHERE NOT EXISTS (
        SELECT 1
        FROM company_modules cm
        WHERE cm.company_id = @dinamicId
          AND cm.module_key = modules.module_key
    );
END;
GO
