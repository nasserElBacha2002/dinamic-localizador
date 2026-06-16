USE dinamic_attendance;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'employees')
BEGIN
    CREATE TABLE employees (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_employees PRIMARY KEY DEFAULT NEWID(),
        name NVARCHAR(150) NOT NULL,
        document_number NVARCHAR(50) NULL,
        phone_number NVARCHAR(30) NOT NULL,
        active BIT NOT NULL CONSTRAINT DF_employees_active DEFAULT 1,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_employees_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL CONSTRAINT DF_employees_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_employees_phone_number UNIQUE (phone_number)
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_employees_phone_number' AND object_id = OBJECT_ID('employees'))
BEGIN
    CREATE INDEX IX_employees_phone_number ON employees (phone_number);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_employees_active' AND object_id = OBJECT_ID('employees'))
BEGIN
    CREATE INDEX IX_employees_active ON employees (active);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'stores')
BEGIN
    CREATE TABLE stores (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_stores PRIMARY KEY DEFAULT NEWID(),
        name NVARCHAR(150) NOT NULL,
        address NVARCHAR(300) NULL,
        latitude DECIMAL(10, 7) NOT NULL,
        longitude DECIMAL(10, 7) NOT NULL,
        allowed_radius_meters INT NOT NULL CONSTRAINT DF_stores_allowed_radius_meters DEFAULT 150,
        active BIT NOT NULL CONSTRAINT DF_stores_active DEFAULT 1,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_stores_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL CONSTRAINT DF_stores_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_stores_latitude CHECK (latitude BETWEEN -90 AND 90),
        CONSTRAINT CK_stores_longitude CHECK (longitude BETWEEN -180 AND 180),
        CONSTRAINT CK_stores_allowed_radius_meters CHECK (allowed_radius_meters > 0)
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_stores_name' AND object_id = OBJECT_ID('stores'))
BEGIN
    CREATE INDEX IX_stores_name ON stores (name);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_stores_active' AND object_id = OBJECT_ID('stores'))
BEGIN
    CREATE INDEX IX_stores_active ON stores (active);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'inventories')
BEGIN
    CREATE TABLE inventories (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_inventories PRIMARY KEY DEFAULT NEWID(),
        store_id UNIQUEIDENTIFIER NOT NULL,
        scheduled_start DATETIME2 NOT NULL,
        scheduled_end DATETIME2 NULL,
        early_tolerance_minutes INT NOT NULL CONSTRAINT DF_inventories_early_tolerance_minutes DEFAULT 60,
        late_tolerance_minutes INT NOT NULL CONSTRAINT DF_inventories_late_tolerance_minutes DEFAULT 90,
        status NVARCHAR(30) NOT NULL CONSTRAINT DF_inventories_status DEFAULT 'SCHEDULED',
        notes NVARCHAR(1000) NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_inventories_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL CONSTRAINT DF_inventories_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_inventories_store_id FOREIGN KEY (store_id) REFERENCES stores (id),
        CONSTRAINT CK_inventories_status CHECK (status IN ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
        CONSTRAINT CK_inventories_early_tolerance_minutes CHECK (early_tolerance_minutes >= 0),
        CONSTRAINT CK_inventories_late_tolerance_minutes CHECK (late_tolerance_minutes >= 0),
        CONSTRAINT CK_inventories_scheduled_end CHECK (
            scheduled_end IS NULL OR scheduled_end > scheduled_start
        )
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_inventories_store_id' AND object_id = OBJECT_ID('inventories'))
BEGIN
    CREATE INDEX IX_inventories_store_id ON inventories (store_id);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_inventories_scheduled_start' AND object_id = OBJECT_ID('inventories'))
BEGIN
    CREATE INDEX IX_inventories_scheduled_start ON inventories (scheduled_start);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_inventories_status' AND object_id = OBJECT_ID('inventories'))
BEGIN
    CREATE INDEX IX_inventories_status ON inventories (status);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'inventory_employees')
BEGIN
    CREATE TABLE inventory_employees (
        inventory_id UNIQUEIDENTIFIER NOT NULL,
        employee_id UNIQUEIDENTIFIER NOT NULL,
        assigned_at DATETIME2 NOT NULL CONSTRAINT DF_inventory_employees_assigned_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_inventory_employees PRIMARY KEY (inventory_id, employee_id),
        CONSTRAINT FK_inventory_employees_inventory_id FOREIGN KEY (inventory_id) REFERENCES inventories (id),
        CONSTRAINT FK_inventory_employees_employee_id FOREIGN KEY (employee_id) REFERENCES employees (id)
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_inventory_employees_employee_id' AND object_id = OBJECT_ID('inventory_employees'))
BEGIN
    CREATE INDEX IX_inventory_employees_employee_id ON inventory_employees (employee_id);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'attendance_records')
BEGIN
    CREATE TABLE attendance_records (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_attendance_records PRIMARY KEY DEFAULT NEWID(),
        inventory_id UNIQUEIDENTIFIER NOT NULL,
        employee_id UNIQUEIDENTIFIER NOT NULL,
        received_latitude DECIMAL(10, 7) NOT NULL,
        received_longitude DECIMAL(10, 7) NOT NULL,
        distance_meters DECIMAL(10, 2) NOT NULL,
        validation_status NVARCHAR(30) NOT NULL,
        location_status NVARCHAR(30) NOT NULL,
        punctuality_status NVARCHAR(30) NOT NULL,
        source_message_sid NVARCHAR(100) NULL,
        validation_reason NVARCHAR(500) NULL,
        received_at DATETIME2 NOT NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_attendance_records_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_attendance_records_inventory_id FOREIGN KEY (inventory_id) REFERENCES inventories (id),
        CONSTRAINT FK_attendance_records_employee_id FOREIGN KEY (employee_id) REFERENCES employees (id),
        CONSTRAINT CK_attendance_records_latitude CHECK (received_latitude BETWEEN -90 AND 90),
        CONSTRAINT CK_attendance_records_longitude CHECK (received_longitude BETWEEN -180 AND 180),
        CONSTRAINT CK_attendance_records_distance_meters CHECK (distance_meters >= 0),
        CONSTRAINT CK_attendance_records_validation_status CHECK (
            validation_status IN ('VALID', 'PENDING_REVIEW', 'REJECTED')
        ),
        CONSTRAINT CK_attendance_records_location_status CHECK (
            location_status IN ('INSIDE_GEOFENCE', 'OUTSIDE_GEOFENCE', 'INVALID_LOCATION')
        ),
        CONSTRAINT CK_attendance_records_punctuality_status CHECK (
            punctuality_status IN ('EARLY', 'ON_TIME', 'LATE', 'OUTSIDE_TIME_WINDOW')
        )
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_attendance_records_source_message_sid' AND object_id = OBJECT_ID('attendance_records'))
BEGIN
    CREATE UNIQUE INDEX UQ_attendance_records_source_message_sid
        ON attendance_records (source_message_sid)
        WHERE source_message_sid IS NOT NULL;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_attendance_records_inventory_employee_active' AND object_id = OBJECT_ID('attendance_records'))
BEGIN
    CREATE UNIQUE INDEX UX_attendance_records_inventory_employee_active
        ON attendance_records (inventory_id, employee_id)
        WHERE validation_status IN ('VALID', 'PENDING_REVIEW');
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_attendance_records_inventory_id' AND object_id = OBJECT_ID('attendance_records'))
BEGIN
    CREATE INDEX IX_attendance_records_inventory_id ON attendance_records (inventory_id);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_attendance_records_employee_id' AND object_id = OBJECT_ID('attendance_records'))
BEGIN
    CREATE INDEX IX_attendance_records_employee_id ON attendance_records (employee_id);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_attendance_records_received_at' AND object_id = OBJECT_ID('attendance_records'))
BEGIN
    CREATE INDEX IX_attendance_records_received_at ON attendance_records (received_at);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_attendance_records_validation_status' AND object_id = OBJECT_ID('attendance_records'))
BEGIN
    CREATE INDEX IX_attendance_records_validation_status ON attendance_records (validation_status);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'audit_logs')
BEGIN
    CREATE TABLE audit_logs (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_audit_logs PRIMARY KEY DEFAULT NEWID(),
        entity_type NVARCHAR(50) NOT NULL,
        entity_id UNIQUEIDENTIFIER NOT NULL,
        action NVARCHAR(50) NOT NULL,
        previous_data NVARCHAR(MAX) NULL,
        new_data NVARCHAR(MAX) NULL,
        reason NVARCHAR(500) NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_audit_logs_created_at DEFAULT SYSUTCDATETIME()
    );
END;
GO
