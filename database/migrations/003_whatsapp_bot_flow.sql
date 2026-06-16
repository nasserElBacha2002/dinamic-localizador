IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'whatsapp_messages')
BEGIN
    CREATE TABLE whatsapp_messages (
        id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
        message_sid NVARCHAR(100) NULL,
        direction NVARCHAR(20) NOT NULL,
        employee_id UNIQUEIDENTIFIER NULL,
        phone_from NVARCHAR(30) NOT NULL,
        phone_to NVARCHAR(30) NOT NULL,
        message_type NVARCHAR(30) NOT NULL,
        body NVARCHAR(MAX) NULL,
        latitude DECIMAL(10, 7) NULL,
        longitude DECIMAL(10, 7) NULL,
        status NVARCHAR(30) NULL,
        raw_payload NVARCHAR(MAX) NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_whatsapp_messages_employee
            FOREIGN KEY (employee_id) REFERENCES employees(id),
        CONSTRAINT CK_whatsapp_messages_direction
            CHECK (direction IN ('INBOUND', 'OUTBOUND')),
        CONSTRAINT CK_whatsapp_messages_message_type
            CHECK (message_type IN ('TEXT', 'LOCATION', 'UNKNOWN'))
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UQ_whatsapp_messages_message_sid'
      AND object_id = OBJECT_ID('whatsapp_messages')
)
BEGIN
    CREATE UNIQUE INDEX UQ_whatsapp_messages_message_sid
        ON whatsapp_messages (message_sid)
        WHERE message_sid IS NOT NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_whatsapp_messages_employee_id'
      AND object_id = OBJECT_ID('whatsapp_messages')
)
BEGIN
    CREATE INDEX IX_whatsapp_messages_employee_id
        ON whatsapp_messages (employee_id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_whatsapp_messages_phone_from'
      AND object_id = OBJECT_ID('whatsapp_messages')
)
BEGIN
    CREATE INDEX IX_whatsapp_messages_phone_from
        ON whatsapp_messages (phone_from);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_whatsapp_messages_created_at'
      AND object_id = OBJECT_ID('whatsapp_messages')
)
BEGIN
    CREATE INDEX IX_whatsapp_messages_created_at
        ON whatsapp_messages (created_at);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'bot_sessions')
BEGIN
    CREATE TABLE bot_sessions (
        id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
        employee_id UNIQUEIDENTIFIER NOT NULL,
        inventory_id UNIQUEIDENTIFIER NULL,
        phone_number NVARCHAR(30) NOT NULL,
        state NVARCHAR(40) NOT NULL,
        context_json NVARCHAR(MAX) NULL,
        expires_at DATETIME2 NOT NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_bot_sessions_employee
            FOREIGN KEY (employee_id) REFERENCES employees(id),
        CONSTRAINT FK_bot_sessions_inventory
            FOREIGN KEY (inventory_id) REFERENCES inventories(id),
        CONSTRAINT CK_bot_sessions_state
            CHECK (state IN (
                'WAITING_LOCATION',
                'WAITING_INVENTORY_SELECTION',
                'COMPLETED',
                'CANCELLED',
                'EXPIRED'
            ))
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_bot_sessions_employee_id'
      AND object_id = OBJECT_ID('bot_sessions')
)
BEGIN
    CREATE INDEX IX_bot_sessions_employee_id
        ON bot_sessions (employee_id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_bot_sessions_phone_number'
      AND object_id = OBJECT_ID('bot_sessions')
)
BEGIN
    CREATE INDEX IX_bot_sessions_phone_number
        ON bot_sessions (phone_number);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_bot_sessions_state'
      AND object_id = OBJECT_ID('bot_sessions')
)
BEGIN
    CREATE INDEX IX_bot_sessions_state
        ON bot_sessions (state);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_bot_sessions_expires_at'
      AND object_id = OBJECT_ID('bot_sessions')
)
BEGIN
    CREATE INDEX IX_bot_sessions_expires_at
        ON bot_sessions (expires_at);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UX_bot_sessions_active_employee'
      AND object_id = OBJECT_ID('bot_sessions')
)
BEGIN
    CREATE UNIQUE INDEX UX_bot_sessions_active_employee
        ON bot_sessions (employee_id)
        WHERE state IN ('WAITING_LOCATION', 'WAITING_INVENTORY_SELECTION');
END;
GO
