-- Phase 1: Multi-company foundation (additive; no inventory/store renames).
-- Rollback notes (manual):
--   1. Drop FKs/indexes added here, drop company_id columns, drop new tables.
--   2. Re-create UQ_employees_phone_number if employees phone uniqueness was changed.
--   3. Re-run only after restoring a DB backup; do not run in production without a plan.

USE dinamic_attendance;
GO

-- ---------------------------------------------------------------------------
-- companies
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'companies')
BEGIN
    CREATE TABLE companies (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_companies PRIMARY KEY DEFAULT NEWID(),
        name NVARCHAR(200) NOT NULL,
        legal_name NVARCHAR(300) NULL,
        tax_id NVARCHAR(80) NULL,
        country NVARCHAR(80) NULL,
        default_timezone NVARCHAR(80) NOT NULL,
        status NVARCHAR(30) NOT NULL CONSTRAINT DF_companies_status DEFAULT 'ACTIVE',
        created_at DATETIME2 NOT NULL CONSTRAINT DF_companies_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL CONSTRAINT DF_companies_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_companies_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED'))
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM companies WHERE name = N'Dinamic Systems')
BEGIN
    INSERT INTO companies (name, default_timezone, status)
    VALUES (N'Dinamic Systems', N'America/Argentina/Buenos_Aires', N'ACTIVE');
END;
GO

-- ---------------------------------------------------------------------------
-- user_company_memberships
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'user_company_memberships')
BEGIN
    CREATE TABLE user_company_memberships (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_user_company_memberships PRIMARY KEY DEFAULT NEWID(),
        user_id UNIQUEIDENTIFIER NOT NULL,
        company_id UNIQUEIDENTIFIER NOT NULL,
        role NVARCHAR(30) NOT NULL,
        status NVARCHAR(30) NOT NULL CONSTRAINT DF_user_company_memberships_status DEFAULT 'ACTIVE',
        is_default BIT NOT NULL CONSTRAINT DF_user_company_memberships_is_default DEFAULT 0,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_user_company_memberships_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL CONSTRAINT DF_user_company_memberships_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_user_company_memberships_user FOREIGN KEY (user_id) REFERENCES users (id),
        CONSTRAINT FK_user_company_memberships_company FOREIGN KEY (company_id) REFERENCES companies (id),
        CONSTRAINT UQ_user_company_memberships_user_company UNIQUE (user_id, company_id),
        CONSTRAINT CK_user_company_memberships_role CHECK (
            role IN ('OWNER', 'ADMIN', 'HR', 'SUPERVISOR', 'OPERATOR', 'READ_ONLY')
        ),
        CONSTRAINT CK_user_company_memberships_status CHECK (status IN ('ACTIVE', 'INACTIVE'))
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_user_company_memberships_user_id'
      AND object_id = OBJECT_ID('user_company_memberships')
)
BEGIN
    CREATE INDEX IX_user_company_memberships_user_id
        ON user_company_memberships (user_id, company_id);
END;
GO

INSERT INTO user_company_memberships (user_id, company_id, role, status, is_default)
SELECT u.id, c.id,
    CASE WHEN u.role = 'ADMIN' THEN 'OWNER' ELSE 'READ_ONLY' END,
    'ACTIVE',
    1
FROM users u
CROSS JOIN companies c
WHERE c.name = N'Dinamic Systems'
  AND u.active = 1
  AND NOT EXISTS (
      SELECT 1 FROM user_company_memberships m
      WHERE m.user_id = u.id AND m.company_id = c.id
  );
GO

-- ---------------------------------------------------------------------------
-- company_settings
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'company_settings')
BEGIN
    CREATE TABLE company_settings (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_company_settings PRIMARY KEY DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        operation_timezone NVARCHAR(80) NOT NULL,
        default_radius_meters INT NOT NULL,
        late_grace_minutes INT NOT NULL,
        early_leave_tolerance_minutes INT NOT NULL,
        require_checkout_location BIT NOT NULL CONSTRAINT DF_company_settings_require_checkout_location DEFAULT 1,
        allow_manual_attendance_corrections BIT NOT NULL CONSTRAINT DF_company_settings_allow_manual_attendance_corrections DEFAULT 1,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_company_settings_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL CONSTRAINT DF_company_settings_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_company_settings_company FOREIGN KEY (company_id) REFERENCES companies (id),
        CONSTRAINT UQ_company_settings_company UNIQUE (company_id),
        CONSTRAINT CK_company_settings_default_radius_meters CHECK (default_radius_meters > 0),
        CONSTRAINT CK_company_settings_late_grace_minutes CHECK (late_grace_minutes >= 0),
        CONSTRAINT CK_company_settings_early_leave_tolerance_minutes CHECK (early_leave_tolerance_minutes >= 0)
    );
END;
GO

INSERT INTO company_settings (
    company_id,
    operation_timezone,
    default_radius_meters,
    late_grace_minutes,
    early_leave_tolerance_minutes,
    require_checkout_location,
    allow_manual_attendance_corrections
)
SELECT
    c.id,
    N'America/Argentina/Buenos_Aires',
    150,
    15,
    15,
    1,
    1
FROM companies c
WHERE c.name = N'Dinamic Systems'
  AND NOT EXISTS (SELECT 1 FROM company_settings s WHERE s.company_id = c.id);
GO

-- ---------------------------------------------------------------------------
-- employees.company_id + phone uniqueness per company
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('employees') AND name = 'company_id')
BEGIN
    ALTER TABLE employees ADD company_id UNIQUEIDENTIFIER NULL;
END;
GO

UPDATE e
SET e.company_id = c.id
FROM employees e
CROSS JOIN companies c
WHERE c.name = N'Dinamic Systems'
  AND e.company_id IS NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_employees_company')
BEGIN
    ALTER TABLE employees
        ADD CONSTRAINT FK_employees_company FOREIGN KEY (company_id) REFERENCES companies (id);
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('employees') AND name = 'company_id' AND is_nullable = 1
)
BEGIN
    ALTER TABLE employees ALTER COLUMN company_id UNIQUEIDENTIFIER NOT NULL;
END;
GO

IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'UQ_employees_phone_number')
BEGIN
    ALTER TABLE employees DROP CONSTRAINT UQ_employees_phone_number;
END;
GO

IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_employees_phone_number' AND object_id = OBJECT_ID('employees'))
BEGIN
    DROP INDEX UQ_employees_phone_number ON employees;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_employees_company_phone_number' AND object_id = OBJECT_ID('employees'))
BEGIN
    CREATE UNIQUE INDEX UQ_employees_company_phone_number ON employees (company_id, phone_number);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_employees_company_id' AND object_id = OBJECT_ID('employees'))
BEGIN
    CREATE INDEX IX_employees_company_id ON employees (company_id);
END;
GO

-- ---------------------------------------------------------------------------
-- stores
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('stores') AND name = 'company_id')
BEGIN
    ALTER TABLE stores ADD company_id UNIQUEIDENTIFIER NULL;
END;
GO

UPDATE s
SET s.company_id = c.id
FROM stores s
CROSS JOIN companies c
WHERE c.name = N'Dinamic Systems' AND s.company_id IS NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_stores_company')
BEGIN
    ALTER TABLE stores ADD CONSTRAINT FK_stores_company FOREIGN KEY (company_id) REFERENCES companies (id);
END;
GO

ALTER TABLE stores ALTER COLUMN company_id UNIQUEIDENTIFIER NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_stores_company_id' AND object_id = OBJECT_ID('stores'))
BEGIN
    CREATE INDEX IX_stores_company_id ON stores (company_id);
END;
GO

-- ---------------------------------------------------------------------------
-- inventories
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('inventories') AND name = 'company_id')
BEGIN
    ALTER TABLE inventories ADD company_id UNIQUEIDENTIFIER NULL;
END;
GO

UPDATE i
SET i.company_id = c.id
FROM inventories i
CROSS JOIN companies c
WHERE c.name = N'Dinamic Systems' AND i.company_id IS NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_inventories_company')
BEGIN
    ALTER TABLE inventories ADD CONSTRAINT FK_inventories_company FOREIGN KEY (company_id) REFERENCES companies (id);
END;
GO

ALTER TABLE inventories ALTER COLUMN company_id UNIQUEIDENTIFIER NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_inventories_company_store_start' AND object_id = OBJECT_ID('inventories'))
BEGIN
    CREATE INDEX IX_inventories_company_store_start
        ON inventories (company_id, store_id, scheduled_start);
END;
GO

-- ---------------------------------------------------------------------------
-- inventory_employees
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('inventory_employees') AND name = 'company_id')
BEGIN
    ALTER TABLE inventory_employees ADD company_id UNIQUEIDENTIFIER NULL;
END;
GO

UPDATE ie
SET ie.company_id = i.company_id
FROM inventory_employees ie
INNER JOIN inventories i ON i.id = ie.inventory_id
WHERE ie.company_id IS NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_inventory_employees_company')
BEGIN
    ALTER TABLE inventory_employees ADD CONSTRAINT FK_inventory_employees_company FOREIGN KEY (company_id) REFERENCES companies (id);
END;
GO

ALTER TABLE inventory_employees ALTER COLUMN company_id UNIQUEIDENTIFIER NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_inventory_employees_company_inventory_employee' AND object_id = OBJECT_ID('inventory_employees'))
BEGIN
    CREATE INDEX IX_inventory_employees_company_inventory_employee
        ON inventory_employees (company_id, inventory_id, employee_id);
END;
GO

-- ---------------------------------------------------------------------------
-- attendance_records
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('attendance_records') AND name = 'company_id')
BEGIN
    ALTER TABLE attendance_records ADD company_id UNIQUEIDENTIFIER NULL;
END;
GO

UPDATE ar
SET ar.company_id = i.company_id
FROM attendance_records ar
INNER JOIN inventories i ON i.id = ar.inventory_id
WHERE ar.company_id IS NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_attendance_records_company')
BEGIN
    ALTER TABLE attendance_records ADD CONSTRAINT FK_attendance_records_company FOREIGN KEY (company_id) REFERENCES companies (id);
END;
GO

ALTER TABLE attendance_records ALTER COLUMN company_id UNIQUEIDENTIFIER NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_attendance_records_company_employee_inventory_received' AND object_id = OBJECT_ID('attendance_records'))
BEGIN
    CREATE INDEX IX_attendance_records_company_employee_inventory_received
        ON attendance_records (company_id, employee_id, inventory_id, received_at);
END;
GO

-- ---------------------------------------------------------------------------
-- attendance_reviews
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('attendance_reviews') AND name = 'company_id')
BEGIN
    ALTER TABLE attendance_reviews ADD company_id UNIQUEIDENTIFIER NULL;
END;
GO

UPDATE rv
SET rv.company_id = ar.company_id
FROM attendance_reviews rv
INNER JOIN attendance_records ar ON ar.id = rv.attendance_id
WHERE rv.company_id IS NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_attendance_reviews_company')
BEGIN
    ALTER TABLE attendance_reviews ADD CONSTRAINT FK_attendance_reviews_company FOREIGN KEY (company_id) REFERENCES companies (id);
END;
GO

ALTER TABLE attendance_reviews ALTER COLUMN company_id UNIQUEIDENTIFIER NOT NULL;
GO

-- ---------------------------------------------------------------------------
-- whatsapp_attendance_notifications
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('whatsapp_attendance_notifications') AND name = 'company_id')
BEGIN
    ALTER TABLE whatsapp_attendance_notifications ADD company_id UNIQUEIDENTIFIER NULL;
END;
GO

UPDATE n
SET n.company_id = i.company_id
FROM whatsapp_attendance_notifications n
INNER JOIN inventories i ON i.id = n.inventory_id
WHERE n.company_id IS NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_whatsapp_attendance_notifications_company')
BEGIN
    ALTER TABLE whatsapp_attendance_notifications
        ADD CONSTRAINT FK_whatsapp_attendance_notifications_company FOREIGN KEY (company_id) REFERENCES companies (id);
END;
GO

ALTER TABLE whatsapp_attendance_notifications ALTER COLUMN company_id UNIQUEIDENTIFIER NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_whatsapp_attendance_notifications_company_inventory_employee_type' AND object_id = OBJECT_ID('whatsapp_attendance_notifications'))
BEGIN
    CREATE INDEX IX_whatsapp_attendance_notifications_company_inventory_employee_type
        ON whatsapp_attendance_notifications (company_id, inventory_id, employee_id, notification_type);
END;
GO

-- ---------------------------------------------------------------------------
-- bot_sessions
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('bot_sessions') AND name = 'company_id')
BEGIN
    ALTER TABLE bot_sessions ADD company_id UNIQUEIDENTIFIER NULL;
END;
GO

UPDATE bs
SET bs.company_id = e.company_id
FROM bot_sessions bs
INNER JOIN employees e ON e.id = bs.employee_id
WHERE bs.company_id IS NULL;
GO

UPDATE bs
SET bs.company_id = c.id
FROM bot_sessions bs
CROSS JOIN companies c
WHERE c.name = N'Dinamic Systems' AND bs.company_id IS NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_bot_sessions_company')
BEGIN
    ALTER TABLE bot_sessions ADD CONSTRAINT FK_bot_sessions_company FOREIGN KEY (company_id) REFERENCES companies (id);
END;
GO

ALTER TABLE bot_sessions ALTER COLUMN company_id UNIQUEIDENTIFIER NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_bot_sessions_company_employee_phone' AND object_id = OBJECT_ID('bot_sessions'))
BEGIN
    CREATE INDEX IX_bot_sessions_company_employee_phone
        ON bot_sessions (company_id, employee_id, phone_number);
END;
GO

-- ---------------------------------------------------------------------------
-- bot_simulation_sessions
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('bot_simulation_sessions') AND name = 'company_id')
BEGIN
    ALTER TABLE bot_simulation_sessions ADD company_id UNIQUEIDENTIFIER NULL;
END;
GO

UPDATE bss
SET bss.company_id = e.company_id
FROM bot_simulation_sessions bss
INNER JOIN employees e ON e.id = bss.employee_id
WHERE bss.company_id IS NULL;
GO

UPDATE bss
SET bss.company_id = c.id
FROM bot_simulation_sessions bss
CROSS JOIN companies c
WHERE c.name = N'Dinamic Systems' AND bss.company_id IS NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_bot_simulation_sessions_company')
BEGIN
    ALTER TABLE bot_simulation_sessions
        ADD CONSTRAINT FK_bot_simulation_sessions_company FOREIGN KEY (company_id) REFERENCES companies (id);
END;
GO

ALTER TABLE bot_simulation_sessions ALTER COLUMN company_id UNIQUEIDENTIFIER NOT NULL;
GO

-- ---------------------------------------------------------------------------
-- absence_types (company-scoped codes)
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('absence_types') AND name = 'company_id')
BEGIN
    ALTER TABLE absence_types ADD company_id UNIQUEIDENTIFIER NULL;
END;
GO

UPDATE t
SET t.company_id = c.id
FROM absence_types t
CROSS JOIN companies c
WHERE c.name = N'Dinamic Systems' AND t.company_id IS NULL;
GO

IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'UQ_absence_types_code')
BEGIN
    ALTER TABLE absence_types DROP CONSTRAINT UQ_absence_types_code;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_absence_types_company')
BEGIN
    ALTER TABLE absence_types ADD CONSTRAINT FK_absence_types_company FOREIGN KEY (company_id) REFERENCES companies (id);
END;
GO

ALTER TABLE absence_types ALTER COLUMN company_id UNIQUEIDENTIFIER NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_absence_types_company_code' AND object_id = OBJECT_ID('absence_types'))
BEGIN
    CREATE UNIQUE INDEX UQ_absence_types_company_code ON absence_types (company_id, code);
END;
GO

-- ---------------------------------------------------------------------------
-- absence_requests
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('absence_requests') AND name = 'company_id')
BEGIN
    ALTER TABLE absence_requests ADD company_id UNIQUEIDENTIFIER NULL;
END;
GO

UPDATE ar
SET ar.company_id = e.company_id
FROM absence_requests ar
INNER JOIN employees e ON e.id = ar.employee_id
WHERE ar.company_id IS NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_absence_requests_company')
BEGIN
    ALTER TABLE absence_requests ADD CONSTRAINT FK_absence_requests_company FOREIGN KEY (company_id) REFERENCES companies (id);
END;
GO

ALTER TABLE absence_requests ALTER COLUMN company_id UNIQUEIDENTIFIER NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_absence_requests_company_employee_status' AND object_id = OBJECT_ID('absence_requests'))
BEGIN
    CREATE INDEX IX_absence_requests_company_employee_status
        ON absence_requests (company_id, employee_id, status);
END;
GO

-- ---------------------------------------------------------------------------
-- absence_request_events
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('absence_request_events') AND name = 'company_id')
BEGIN
    ALTER TABLE absence_request_events ADD company_id UNIQUEIDENTIFIER NULL;
END;
GO

UPDATE ev
SET ev.company_id = r.company_id
FROM absence_request_events ev
INNER JOIN absence_requests r ON r.id = ev.absence_request_id
WHERE ev.company_id IS NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_absence_request_events_company')
BEGIN
    ALTER TABLE absence_request_events ADD CONSTRAINT FK_absence_request_events_company FOREIGN KEY (company_id) REFERENCES companies (id);
END;
GO

ALTER TABLE absence_request_events ALTER COLUMN company_id UNIQUEIDENTIFIER NOT NULL;
GO

-- ---------------------------------------------------------------------------
-- employee_absence_balances
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('employee_absence_balances') AND name = 'company_id')
BEGIN
    ALTER TABLE employee_absence_balances ADD company_id UNIQUEIDENTIFIER NULL;
END;
GO

UPDATE b
SET b.company_id = e.company_id
FROM employee_absence_balances b
INNER JOIN employees e ON e.id = b.employee_id
WHERE b.company_id IS NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_employee_absence_balances_company')
BEGIN
    ALTER TABLE employee_absence_balances ADD CONSTRAINT FK_employee_absence_balances_company FOREIGN KEY (company_id) REFERENCES companies (id);
END;
GO

ALTER TABLE employee_absence_balances ALTER COLUMN company_id UNIQUEIDENTIFIER NOT NULL;
GO

-- ---------------------------------------------------------------------------
-- whatsapp_messages
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('whatsapp_messages') AND name = 'company_id')
BEGIN
    ALTER TABLE whatsapp_messages ADD company_id UNIQUEIDENTIFIER NULL;
END;
GO

UPDATE wm
SET wm.company_id = e.company_id
FROM whatsapp_messages wm
INNER JOIN employees e ON e.id = wm.employee_id
WHERE wm.company_id IS NULL AND wm.employee_id IS NOT NULL;
GO

UPDATE wm
SET wm.company_id = c.id
FROM whatsapp_messages wm
CROSS JOIN companies c
WHERE c.name = N'Dinamic Systems' AND wm.company_id IS NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_whatsapp_messages_company')
BEGIN
    ALTER TABLE whatsapp_messages ADD CONSTRAINT FK_whatsapp_messages_company FOREIGN KEY (company_id) REFERENCES companies (id);
END;
GO

ALTER TABLE whatsapp_messages ALTER COLUMN company_id UNIQUEIDENTIFIER NOT NULL;
GO

-- ---------------------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('audit_logs') AND name = 'company_id')
BEGIN
    ALTER TABLE audit_logs ADD company_id UNIQUEIDENTIFIER NULL;
END;
GO

UPDATE a
SET a.company_id = c.id
FROM audit_logs a
CROSS JOIN companies c
WHERE c.name = N'Dinamic Systems' AND a.company_id IS NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_audit_logs_company')
BEGIN
    ALTER TABLE audit_logs ADD CONSTRAINT FK_audit_logs_company FOREIGN KEY (company_id) REFERENCES companies (id);
END;
GO

ALTER TABLE audit_logs ALTER COLUMN company_id UNIQUEIDENTIFIER NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_audit_logs_company_created_at' AND object_id = OBJECT_ID('audit_logs'))
BEGIN
    CREATE INDEX IX_audit_logs_company_created_at ON audit_logs (company_id, created_at);
END;
GO
