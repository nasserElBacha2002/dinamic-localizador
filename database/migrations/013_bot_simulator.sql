-- Bot simulator support: mark simulated attendance records and persist simulation sessions

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('attendance_records') AND name = 'is_simulation'
)
BEGIN
    ALTER TABLE attendance_records
        ADD is_simulation BIT NOT NULL
            CONSTRAINT DF_attendance_records_is_simulation DEFAULT 0;
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('attendance_records') AND name = 'simulation_session_id'
)
BEGIN
    ALTER TABLE attendance_records
        ADD simulation_session_id UNIQUEIDENTIFIER NULL;
END;

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'bot_simulation_sessions')
BEGIN
    CREATE TABLE bot_simulation_sessions (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_bot_simulation_sessions PRIMARY KEY DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NULL,
        employee_id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT FK_bot_simulation_sessions_employee
                REFERENCES employees(id),
        inventory_id UNIQUEIDENTIFIER NULL
            CONSTRAINT FK_bot_simulation_sessions_inventory
                REFERENCES inventories(id),
        store_id UNIQUEIDENTIFIER NULL
            CONSTRAINT FK_bot_simulation_sessions_store
                REFERENCES stores(id),
        phone_number NVARCHAR(30) NOT NULL,
        simulated_now DATETIME2 NOT NULL,
        mode NVARCHAR(20) NOT NULL
            CONSTRAINT CK_bot_simulation_sessions_mode
                CHECK (mode IN ('dry-run', 'persistent')),
        messages_json NVARCHAR(MAX) NOT NULL
            CONSTRAINT DF_bot_simulation_sessions_messages_json DEFAULT '[]',
        technical_details_json NVARCHAR(MAX) NOT NULL
            CONSTRAINT DF_bot_simulation_sessions_technical_details_json DEFAULT '{}',
        created_by UNIQUEIDENTIFIER NULL
            CONSTRAINT FK_bot_simulation_sessions_created_by
                REFERENCES users(id),
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_bot_simulation_sessions_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL
            CONSTRAINT DF_bot_simulation_sessions_updated_at DEFAULT SYSUTCDATETIME()
    );

    CREATE INDEX IX_bot_simulation_sessions_employee
        ON bot_simulation_sessions (employee_id, created_at DESC);
END;
