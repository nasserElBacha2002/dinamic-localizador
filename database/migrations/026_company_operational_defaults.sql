-- Company operational defaults: extend company_settings, absence/location type tables.
-- Rollback (manual): drop new tables; drop added company_settings columns.

USE dinamic_attendance;
GO

-- ---------------------------------------------------------------------------
-- company_settings: inventory/import operational defaults
-- ---------------------------------------------------------------------------
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('company_settings') AND name = 'default_early_arrival_tolerance_minutes'
)
BEGIN
    ALTER TABLE company_settings
        ADD default_early_arrival_tolerance_minutes INT NOT NULL
            CONSTRAINT DF_company_settings_default_early_arrival_tolerance_minutes DEFAULT 60;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('company_settings') AND name = 'default_late_arrival_tolerance_minutes'
)
BEGIN
    ALTER TABLE company_settings
        ADD default_late_arrival_tolerance_minutes INT NOT NULL
            CONSTRAINT DF_company_settings_default_late_arrival_tolerance_minutes DEFAULT 90;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('company_settings') AND name = 'default_operation_start_time'
)
BEGIN
    ALTER TABLE company_settings ADD default_operation_start_time TIME NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('company_settings') AND name = 'default_operation_end_time'
)
BEGIN
    ALTER TABLE company_settings ADD default_operation_end_time TIME NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('company_settings') AND name = 'geofence_review_margin_meters'
)
BEGIN
    ALTER TABLE company_settings ADD geofence_review_margin_meters INT NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_company_settings_default_early_arrival_tolerance_minutes'
)
BEGIN
    ALTER TABLE company_settings
        ADD CONSTRAINT CK_company_settings_default_early_arrival_tolerance_minutes
        CHECK (default_early_arrival_tolerance_minutes >= 0);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_company_settings_default_late_arrival_tolerance_minutes'
)
BEGIN
    ALTER TABLE company_settings
        ADD CONSTRAINT CK_company_settings_default_late_arrival_tolerance_minutes
        CHECK (default_late_arrival_tolerance_minutes >= 0);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_company_settings_geofence_review_margin_meters'
)
BEGIN
    ALTER TABLE company_settings
        ADD CONSTRAINT CK_company_settings_geofence_review_margin_meters
        CHECK (geofence_review_margin_meters IS NULL OR geofence_review_margin_meters >= 0);
END;
GO

-- Backfill existing companies with the current operational schedule defaults.
-- New rows can still rely on application defaults through the resolver if values are omitted.
UPDATE company_settings
SET default_operation_start_time = CAST(N'20:30:00' AS TIME)
WHERE default_operation_start_time IS NULL;
GO

UPDATE company_settings
SET default_operation_end_time = CAST(N'03:00:00' AS TIME)
WHERE default_operation_end_time IS NULL;
GO

-- ---------------------------------------------------------------------------
-- company_absence_settings
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'company_absence_settings')
BEGIN
    CREATE TABLE company_absence_settings (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_company_absence_settings PRIMARY KEY DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        absence_type_code NVARCHAR(50) NOT NULL,
        default_annual_days DECIMAL(5, 1) NOT NULL
            CONSTRAINT DF_company_absence_settings_default_annual_days DEFAULT 0,
        auto_assign_on_employee_create BIT NOT NULL
            CONSTRAINT DF_company_absence_settings_auto_assign DEFAULT 0,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_company_absence_settings_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL CONSTRAINT DF_company_absence_settings_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_company_absence_settings_company FOREIGN KEY (company_id) REFERENCES companies (id),
        CONSTRAINT UQ_company_absence_settings_company_code UNIQUE (company_id, absence_type_code),
        CONSTRAINT CK_company_absence_settings_default_annual_days CHECK (default_annual_days >= 0)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_company_absence_settings_company_id'
      AND object_id = OBJECT_ID('company_absence_settings')
)
BEGIN
    CREATE INDEX IX_company_absence_settings_company_id
        ON company_absence_settings (company_id);
END;
GO

-- ---------------------------------------------------------------------------
-- company_location_types
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'company_location_types')
BEGIN
    CREATE TABLE company_location_types (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_company_location_types PRIMARY KEY DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        code NVARCHAR(80) NOT NULL,
        name NVARCHAR(200) NOT NULL,
        is_active BIT NOT NULL CONSTRAINT DF_company_location_types_is_active DEFAULT 1,
        sort_order INT NOT NULL CONSTRAINT DF_company_location_types_sort_order DEFAULT 0,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_company_location_types_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL CONSTRAINT DF_company_location_types_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_company_location_types_company FOREIGN KEY (company_id) REFERENCES companies (id),
        CONSTRAINT UQ_company_location_types_company_code UNIQUE (company_id, code)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_company_location_types_company_active'
      AND object_id = OBJECT_ID('company_location_types')
)
BEGIN
    CREATE INDEX IX_company_location_types_company_active
        ON company_location_types (company_id, is_active, sort_order);
END;
GO

-- Seed legacy store formats per company (idempotent)
INSERT INTO company_location_types (company_id, code, name, sort_order)
SELECT c.id, seed.code, seed.name, seed.sort_order
FROM companies c
CROSS JOIN (
    VALUES
        (N'Express', N'Express', 1),
        (N'Express Interior MZA', N'Express Interior MZA', 2),
        (N'Express Interior SALTA', N'Express Interior SALTA', 3),
        (N'EXPRESS PLUS INTERIOR', N'EXPRESS PLUS INTERIOR', 4),
        (N'Market Bs As', N'Market Bs As', 5)
) AS seed(code, name, sort_order)
WHERE NOT EXISTS (
    SELECT 1
    FROM company_location_types lt
    WHERE lt.company_id = c.id AND lt.code = seed.code
);
GO
