-- WhatsApp functional observability: conversations, flow traces, provider events.
-- Extends whatsapp_messages and whatsapp_attendance_notifications with correlation columns.

USE dinamic_attendance;
GO

-- ---------------------------------------------------------------------------
-- whatsapp_conversations
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'whatsapp_conversations')
BEGIN
    CREATE TABLE dbo.whatsapp_conversations (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_whatsapp_conversations PRIMARY KEY DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NULL,
        employee_id UNIQUEIDENTIFIER NULL,
        phone_hash NVARCHAR(64) NOT NULL,
        phone_masked NVARCHAR(40) NOT NULL,
        phone_normalized NVARCHAR(30) NOT NULL,
        started_at DATETIME2 NOT NULL CONSTRAINT DF_wc_started_at DEFAULT SYSUTCDATETIME(),
        last_activity_at DATETIME2 NOT NULL CONSTRAINT DF_wc_last_activity_at DEFAULT SYSUTCDATETIME(),
        status NVARCHAR(20) NOT NULL CONSTRAINT DF_wc_status DEFAULT N'ACTIVE',
        last_flow_type NVARCHAR(60) NULL,
        last_result_code NVARCHAR(80) NULL,
        message_count INT NOT NULL CONSTRAINT DF_wc_message_count DEFAULT 0,
        error_count INT NOT NULL CONSTRAINT DF_wc_error_count DEFAULT 0,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_wc_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL CONSTRAINT DF_wc_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_wc_company FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
        CONSTRAINT FK_wc_employee FOREIGN KEY (employee_id) REFERENCES dbo.employees (id),
        CONSTRAINT CK_wc_status CHECK (status IN (N'ACTIVE', N'COMPLETED', N'WARNING', N'ERROR'))
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_wc_company_last_activity' AND object_id = OBJECT_ID('dbo.whatsapp_conversations')
)
BEGIN
    CREATE INDEX IX_wc_company_last_activity
        ON dbo.whatsapp_conversations (company_id, last_activity_at DESC);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_wc_employee_last_activity' AND object_id = OBJECT_ID('dbo.whatsapp_conversations')
)
BEGIN
    CREATE INDEX IX_wc_employee_last_activity
        ON dbo.whatsapp_conversations (employee_id, last_activity_at DESC);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_wc_phone_hash_company' AND object_id = OBJECT_ID('dbo.whatsapp_conversations')
)
BEGIN
    CREATE INDEX IX_wc_phone_hash_company
        ON dbo.whatsapp_conversations (phone_hash, company_id, last_activity_at DESC);
END;
GO

-- ---------------------------------------------------------------------------
-- Extend whatsapp_messages
-- ---------------------------------------------------------------------------
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.whatsapp_messages') AND name = 'conversation_id'
)
BEGIN
    ALTER TABLE dbo.whatsapp_messages ADD conversation_id UNIQUEIDENTIFIER NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.whatsapp_messages') AND name = 'correlation_id'
)
BEGIN
    ALTER TABLE dbo.whatsapp_messages ADD correlation_id UNIQUEIDENTIFIER NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.whatsapp_messages') AND name = 'causation_id'
)
BEGIN
    ALTER TABLE dbo.whatsapp_messages ADD causation_id UNIQUEIDENTIFIER NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.whatsapp_messages') AND name = 'provider'
)
BEGIN
    ALTER TABLE dbo.whatsapp_messages ADD provider NVARCHAR(20) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.whatsapp_messages') AND name = 'provider_message_sid'
)
BEGIN
    ALTER TABLE dbo.whatsapp_messages ADD provider_message_sid NVARCHAR(100) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.whatsapp_messages') AND name = 'template_sid'
)
BEGIN
    ALTER TABLE dbo.whatsapp_messages ADD template_sid NVARCHAR(64) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.whatsapp_messages') AND name = 'template_name'
)
BEGIN
    ALTER TABLE dbo.whatsapp_messages ADD template_name NVARCHAR(80) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.whatsapp_messages') AND name = 'template_variables_json'
)
BEGIN
    ALTER TABLE dbo.whatsapp_messages ADD template_variables_json NVARCHAR(2000) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.whatsapp_messages') AND name = 'provider_status'
)
BEGIN
    ALTER TABLE dbo.whatsapp_messages ADD provider_status NVARCHAR(40) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.whatsapp_messages') AND name = 'provider_error_code'
)
BEGIN
    ALTER TABLE dbo.whatsapp_messages ADD provider_error_code NVARCHAR(40) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.whatsapp_messages') AND name = 'provider_error_message'
)
BEGIN
    ALTER TABLE dbo.whatsapp_messages ADD provider_error_message NVARCHAR(1000) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.whatsapp_messages') AND name = 'sent_at'
)
BEGIN
    ALTER TABLE dbo.whatsapp_messages ADD sent_at DATETIME2 NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.whatsapp_messages') AND name = 'delivered_at'
)
BEGIN
    ALTER TABLE dbo.whatsapp_messages ADD delivered_at DATETIME2 NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.whatsapp_messages') AND name = 'read_at'
)
BEGIN
    ALTER TABLE dbo.whatsapp_messages ADD read_at DATETIME2 NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.whatsapp_messages') AND name = 'failed_at'
)
BEGIN
    ALTER TABLE dbo.whatsapp_messages ADD failed_at DATETIME2 NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.whatsapp_messages') AND name = 'updated_at'
)
BEGIN
    ALTER TABLE dbo.whatsapp_messages ADD updated_at DATETIME2 NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.whatsapp_messages') AND name = 'notification_id'
)
BEGIN
    ALTER TABLE dbo.whatsapp_messages ADD notification_id UNIQUEIDENTIFIER NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_whatsapp_messages_conversation'
)
BEGIN
    ALTER TABLE dbo.whatsapp_messages
        ADD CONSTRAINT FK_whatsapp_messages_conversation
        FOREIGN KEY (conversation_id) REFERENCES dbo.whatsapp_conversations (id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_wm_conversation_created' AND object_id = OBJECT_ID('dbo.whatsapp_messages')
)
BEGIN
    CREATE INDEX IX_wm_conversation_created
        ON dbo.whatsapp_messages (conversation_id, created_at);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_wm_correlation_id' AND object_id = OBJECT_ID('dbo.whatsapp_messages')
)
BEGIN
    CREATE INDEX IX_wm_correlation_id
        ON dbo.whatsapp_messages (correlation_id)
        WHERE correlation_id IS NOT NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_wm_provider_message_sid' AND object_id = OBJECT_ID('dbo.whatsapp_messages')
)
BEGIN
    CREATE INDEX IX_wm_provider_message_sid
        ON dbo.whatsapp_messages (provider_message_sid)
        WHERE provider_message_sid IS NOT NULL;
END;
GO

-- ---------------------------------------------------------------------------
-- Extend whatsapp_attendance_notifications
-- ---------------------------------------------------------------------------
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.whatsapp_attendance_notifications') AND name = 'conversation_id'
)
BEGIN
    ALTER TABLE dbo.whatsapp_attendance_notifications ADD conversation_id UNIQUEIDENTIFIER NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.whatsapp_attendance_notifications') AND name = 'correlation_id'
)
BEGIN
    ALTER TABLE dbo.whatsapp_attendance_notifications ADD correlation_id UNIQUEIDENTIFIER NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.whatsapp_attendance_notifications') AND name = 'outbound_message_id'
)
BEGIN
    ALTER TABLE dbo.whatsapp_attendance_notifications ADD outbound_message_id UNIQUEIDENTIFIER NULL;
END;
GO

-- ---------------------------------------------------------------------------
-- whatsapp_flow_executions
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'whatsapp_flow_executions')
BEGIN
    CREATE TABLE dbo.whatsapp_flow_executions (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_whatsapp_flow_executions PRIMARY KEY DEFAULT NEWID(),
        conversation_id UNIQUEIDENTIFIER NULL,
        source_message_id UNIQUEIDENTIFIER NULL,
        correlation_id UNIQUEIDENTIFIER NOT NULL,
        causation_id UNIQUEIDENTIFIER NULL,
        session_id UNIQUEIDENTIFIER NULL,
        notification_id UNIQUEIDENTIFIER NULL,
        company_id UNIQUEIDENTIFIER NULL,
        employee_id UNIQUEIDENTIFIER NULL,
        operation_id UNIQUEIDENTIFIER NULL,
        workday_id UNIQUEIDENTIFIER NULL,
        attendance_id UNIQUEIDENTIFIER NULL,
        flow_type NVARCHAR(60) NOT NULL,
        flow_version NVARCHAR(20) NOT NULL CONSTRAINT DF_wfe_flow_version DEFAULT N'1',
        status NVARCHAR(30) NOT NULL CONSTRAINT DF_wfe_status DEFAULT N'STARTED',
        result_code NVARCHAR(80) NULL,
        started_at DATETIME2 NOT NULL CONSTRAINT DF_wfe_started_at DEFAULT SYSUTCDATETIME(),
        finished_at DATETIME2 NULL,
        duration_ms INT NULL,
        error_code NVARCHAR(80) NULL,
        error_message NVARCHAR(1000) NULL,
        metadata_json NVARCHAR(MAX) NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_wfe_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_wfe_conversation FOREIGN KEY (conversation_id) REFERENCES dbo.whatsapp_conversations (id),
        CONSTRAINT FK_wfe_company FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
        CONSTRAINT CK_wfe_status CHECK (status IN (
            N'STARTED', N'COMPLETED', N'FAILED', N'PARTIALLY_RECORDED'
        ))
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_wfe_conversation_started' AND object_id = OBJECT_ID('dbo.whatsapp_flow_executions')
)
BEGIN
    CREATE INDEX IX_wfe_conversation_started
        ON dbo.whatsapp_flow_executions (conversation_id, started_at DESC);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_wfe_company_started' AND object_id = OBJECT_ID('dbo.whatsapp_flow_executions')
)
BEGIN
    CREATE INDEX IX_wfe_company_started
        ON dbo.whatsapp_flow_executions (company_id, started_at DESC);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_wfe_result_started' AND object_id = OBJECT_ID('dbo.whatsapp_flow_executions')
)
BEGIN
    CREATE INDEX IX_wfe_result_started
        ON dbo.whatsapp_flow_executions (result_code, started_at DESC)
        WHERE result_code IS NOT NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_wfe_correlation' AND object_id = OBJECT_ID('dbo.whatsapp_flow_executions')
)
BEGIN
    CREATE INDEX IX_wfe_correlation
        ON dbo.whatsapp_flow_executions (correlation_id);
END;
GO

-- ---------------------------------------------------------------------------
-- whatsapp_flow_steps
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'whatsapp_flow_steps')
BEGIN
    CREATE TABLE dbo.whatsapp_flow_steps (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_whatsapp_flow_steps PRIMARY KEY DEFAULT NEWID(),
        flow_execution_id UNIQUEIDENTIFIER NOT NULL,
        sequence INT NOT NULL,
        step_type NVARCHAR(60) NOT NULL,
        step_name NVARCHAR(120) NOT NULL,
        status NVARCHAR(20) NOT NULL,
        reason_code NVARCHAR(80) NULL,
        input_summary_json NVARCHAR(MAX) NULL,
        output_summary_json NVARCHAR(MAX) NULL,
        duration_ms INT NULL,
        error_code NVARCHAR(80) NULL,
        error_message NVARCHAR(1000) NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_wfs_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_wfs_execution FOREIGN KEY (flow_execution_id) REFERENCES dbo.whatsapp_flow_executions (id),
        CONSTRAINT CK_wfs_status CHECK (status IN (
            N'SUCCESS', N'SKIPPED', N'REJECTED', N'WARNING', N'FAILED'
        ))
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_wfs_execution_sequence' AND object_id = OBJECT_ID('dbo.whatsapp_flow_steps')
)
BEGIN
    CREATE INDEX IX_wfs_execution_sequence
        ON dbo.whatsapp_flow_steps (flow_execution_id, sequence);
END;
GO

-- ---------------------------------------------------------------------------
-- whatsapp_flow_candidates
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'whatsapp_flow_candidates')
BEGIN
    CREATE TABLE dbo.whatsapp_flow_candidates (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_whatsapp_flow_candidates PRIMARY KEY DEFAULT NEWID(),
        flow_execution_id UNIQUEIDENTIFIER NOT NULL,
        candidate_type NVARCHAR(60) NOT NULL,
        entity_id UNIQUEIDENTIFIER NULL,
        company_id UNIQUEIDENTIFIER NULL,
        accepted BIT NOT NULL CONSTRAINT DF_wfc_accepted DEFAULT 0,
        reason_code NVARCHAR(80) NULL,
        reason_detail NVARCHAR(500) NULL,
        candidate_snapshot_json NVARCHAR(MAX) NULL,
        sequence INT NOT NULL CONSTRAINT DF_wfc_sequence DEFAULT 0,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_wfc_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_wfc_execution FOREIGN KEY (flow_execution_id) REFERENCES dbo.whatsapp_flow_executions (id)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_wfc_execution_sequence' AND object_id = OBJECT_ID('dbo.whatsapp_flow_candidates')
)
BEGIN
    CREATE INDEX IX_wfc_execution_sequence
        ON dbo.whatsapp_flow_candidates (flow_execution_id, sequence);
END;
GO

-- ---------------------------------------------------------------------------
-- whatsapp_provider_events (append-only Twilio status history)
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'whatsapp_provider_events')
BEGIN
    CREATE TABLE dbo.whatsapp_provider_events (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_whatsapp_provider_events PRIMARY KEY DEFAULT NEWID(),
        message_id UNIQUEIDENTIFIER NULL,
        provider NVARCHAR(20) NOT NULL CONSTRAINT DF_wpe_provider DEFAULT N'TWILIO',
        provider_message_sid NVARCHAR(100) NOT NULL,
        event_type NVARCHAR(40) NOT NULL,
        provider_status NVARCHAR(40) NOT NULL,
        provider_event_key NVARCHAR(200) NOT NULL,
        error_code NVARCHAR(40) NULL,
        error_message NVARCHAR(1000) NULL,
        payload_json_sanitized NVARCHAR(MAX) NULL,
        provider_created_at DATETIME2 NULL,
        received_at DATETIME2 NOT NULL CONSTRAINT DF_wpe_received_at DEFAULT SYSUTCDATETIME(),
        created_at DATETIME2 NOT NULL CONSTRAINT DF_wpe_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_wpe_message FOREIGN KEY (message_id) REFERENCES dbo.whatsapp_messages (id),
        CONSTRAINT UQ_wpe_provider_event_key UNIQUE (provider, provider_event_key)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_wpe_sid_received' AND object_id = OBJECT_ID('dbo.whatsapp_provider_events')
)
BEGIN
    CREATE INDEX IX_wpe_sid_received
        ON dbo.whatsapp_provider_events (provider_message_sid, received_at);
END;
GO
