USE dinamic_attendance;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'employee_absence_balances')
BEGIN
    CREATE TABLE employee_absence_balances (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_employee_absence_balances PRIMARY KEY DEFAULT NEWID(),
        employee_id UNIQUEIDENTIFIER NOT NULL,
        absence_type_id UNIQUEIDENTIFIER NOT NULL,
        year INT NOT NULL,
        total_days DECIMAL(5, 1) NOT NULL,
        notes NVARCHAR(500) NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_employee_absence_balances_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL CONSTRAINT DF_employee_absence_balances_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_employee_absence_balances_employee FOREIGN KEY (employee_id) REFERENCES employees (id),
        CONSTRAINT FK_employee_absence_balances_absence_type FOREIGN KEY (absence_type_id) REFERENCES absence_types (id),
        CONSTRAINT UQ_employee_absence_balances_employee_type_year UNIQUE (employee_id, absence_type_id, year),
        CONSTRAINT CK_employee_absence_balances_total_days CHECK (total_days >= 0),
        CONSTRAINT CK_employee_absence_balances_year CHECK (year BETWEEN 2000 AND 2100)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_employee_absence_balances_employee_year'
      AND object_id = OBJECT_ID('employee_absence_balances')
)
BEGIN
    CREATE INDEX IX_employee_absence_balances_employee_year
        ON employee_absence_balances (employee_id, year);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_employee_absence_balances_type_year'
      AND object_id = OBJECT_ID('employee_absence_balances')
)
BEGIN
    CREATE INDEX IX_employee_absence_balances_type_year
        ON employee_absence_balances (absence_type_id, year);
END;
GO

-- Phase 2: only VACATION deducts balance by default.
UPDATE absence_types
SET deducts_balance = 0, updated_at = SYSUTCDATETIME()
WHERE code = N'STUDY_DAY' AND deducts_balance = 1;
GO

UPDATE absence_types
SET deducts_balance = 1, updated_at = SYSUTCDATETIME()
WHERE code = N'VACATION' AND deducts_balance = 0;
GO
