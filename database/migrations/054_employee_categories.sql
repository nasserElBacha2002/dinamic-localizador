-- Employee (collaborator) categories: shared system defaults + company-scoped customs.
-- Rollback (manual):
--   DROP TRIGGER TR_employees_category_company_scope;
--   drop FK/indexes/column on employees;
--   then drop employee_categories.
--
-- Invariants:
--   - system categories: company_id NULL, is_system = 1 (exactly five seeded)
--   - custom categories: company_id NOT NULL, is_system = 0
--   - employees.category_id may only reference global or same-company categories (trigger)

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.employee_categories', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.employee_categories (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_employee_categories PRIMARY KEY DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NULL,
        name NVARCHAR(120) NOT NULL,
        normalized_name NVARCHAR(120) NOT NULL,
        is_system BIT NOT NULL
            CONSTRAINT DF_employee_categories_is_system DEFAULT 0,
        is_active BIT NOT NULL
            CONSTRAINT DF_employee_categories_is_active DEFAULT 1,
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_employee_categories_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL
            CONSTRAINT DF_employee_categories_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_employee_categories_company
            FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
        CONSTRAINT CK_employee_categories_system_scope CHECK (
            (is_system = 1 AND company_id IS NULL)
            OR (is_system = 0 AND company_id IS NOT NULL)
        )
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_employee_categories_system_normalized_name'
      AND object_id = OBJECT_ID(N'dbo.employee_categories')
)
BEGIN
    CREATE UNIQUE INDEX UQ_employee_categories_system_normalized_name
        ON dbo.employee_categories (normalized_name)
        WHERE company_id IS NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_employee_categories_company_normalized_name'
      AND object_id = OBJECT_ID(N'dbo.employee_categories')
)
BEGIN
    CREATE UNIQUE INDEX UQ_employee_categories_company_normalized_name
        ON dbo.employee_categories (company_id, normalized_name)
        WHERE company_id IS NOT NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_employee_categories_company_active'
      AND object_id = OBJECT_ID(N'dbo.employee_categories')
)
BEGIN
    CREATE INDEX IX_employee_categories_company_active
        ON dbo.employee_categories (company_id, is_active)
        INCLUDE (name, is_system, normalized_name);
END;
GO

-- Idempotent seed of shared system categories (visible to all companies).
MERGE dbo.employee_categories AS target
USING (
    SELECT v.name, LOWER(LTRIM(RTRIM(v.name))) AS normalized_name
    FROM (VALUES
        (N'Encargado'),
        (N'Contador'),
        (N'Auxiliar'),
        (N'Supervisor'),
        (N'Operario')
    ) AS v(name)
) AS source
ON target.company_id IS NULL
   AND target.normalized_name = source.normalized_name
WHEN NOT MATCHED THEN
    INSERT (company_id, name, normalized_name, is_system, is_active)
    VALUES (NULL, source.name, source.normalized_name, 1, 1);
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.employees')
      AND name = N'category_id'
)
BEGIN
    ALTER TABLE dbo.employees
        ADD category_id UNIQUEIDENTIFIER NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_employees_employee_category'
      AND parent_object_id = OBJECT_ID(N'dbo.employees')
)
BEGIN
    ALTER TABLE dbo.employees
        ADD CONSTRAINT FK_employees_employee_category
        FOREIGN KEY (category_id) REFERENCES dbo.employee_categories (id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_employees_company_category'
      AND object_id = OBJECT_ID(N'dbo.employees')
)
BEGIN
    CREATE INDEX IX_employees_company_category
        ON dbo.employees (company_id, category_id)
        INCLUDE (name, active, employee_type);
END;
GO

IF OBJECT_ID(N'dbo.TR_employees_category_company_scope', N'TR') IS NULL
BEGIN
    EXEC(N'
    CREATE TRIGGER dbo.TR_employees_category_company_scope
    ON dbo.employees
    AFTER INSERT, UPDATE
    AS
    BEGIN
        SET NOCOUNT ON;

        IF NOT EXISTS (SELECT 1 FROM inserted)
        BEGIN
            RETURN;
        END;

        IF EXISTS (
            SELECT 1
            FROM inserted i
            WHERE i.category_id IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1
                  FROM dbo.employee_categories ec
                  WHERE ec.id = i.category_id
                    AND (ec.company_id IS NULL OR ec.company_id = i.company_id)
              )
        )
        BEGIN
            THROW 50051, ''EMPLOYEE_CATEGORY_CROSS_COMPANY: category_id must be global or belong to the employee company.'', 1;
        END;
    END;
    ');
END;
GO
