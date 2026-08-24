/*
  Migration: 100_company_alert_recipients_and_settings.sql
  Purpose:
    - Explicit WhatsApp admin alert recipients per company (no auto-subscribe by role).
    - Company-level adminAlertsEnabled feature flag (default off for existing tenants).
  Rollback: database/migrations/rollback/100_company_alert_recipients_and_settings_rollback.sql
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.companies', N'U') IS NULL
BEGIN
    THROW 50100, 'Precondition failed: companies missing', 1;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.company_settings')
      AND name = N'admin_alerts_enabled'
)
BEGIN
    ALTER TABLE dbo.company_settings
        ADD admin_alerts_enabled BIT NOT NULL
            CONSTRAINT DF_company_settings_admin_alerts_enabled DEFAULT 0;
END;
GO

IF OBJECT_ID(N'dbo.company_alert_recipients', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.company_alert_recipients (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_company_alert_recipients PRIMARY KEY
            DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        user_id UNIQUEIDENTIFIER NULL,
        phone_number NVARCHAR(20) NOT NULL,
        display_name NVARCHAR(200) NULL,
        is_enabled BIT NOT NULL
            CONSTRAINT DF_car_is_enabled DEFAULT 1,
        receive_operational_alerts BIT NOT NULL
            CONSTRAINT DF_car_receive_operational DEFAULT 1,
        receive_request_alerts BIT NOT NULL
            CONSTRAINT DF_car_receive_request DEFAULT 0,
        receive_security_alerts BIT NOT NULL
            CONSTRAINT DF_car_receive_security DEFAULT 1,
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_car_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL
            CONSTRAINT DF_car_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_car_company
            FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
        CONSTRAINT FK_car_user
            FOREIGN KEY (user_id) REFERENCES dbo.users (id)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_car_company_phone'
      AND object_id = OBJECT_ID(N'dbo.company_alert_recipients')
)
BEGIN
    CREATE UNIQUE INDEX UQ_car_company_phone
        ON dbo.company_alert_recipients (company_id, phone_number);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_car_company_enabled'
      AND object_id = OBJECT_ID(N'dbo.company_alert_recipients')
)
BEGIN
    CREATE INDEX IX_car_company_enabled
        ON dbo.company_alert_recipients (company_id, is_enabled);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_car_id_company'
      AND object_id = OBJECT_ID(N'dbo.company_alert_recipients')
)
BEGIN
    CREATE UNIQUE INDEX UQ_car_id_company
        ON dbo.company_alert_recipients (id, company_id);
END;
GO
