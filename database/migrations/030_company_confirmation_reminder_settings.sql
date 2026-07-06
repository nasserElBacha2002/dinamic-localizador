-- Company settings: attendance confirmation reminder configuration

USE dinamic_attendance;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('company_settings') AND name = 'confirmation_reminder_enabled'
)
BEGIN
    ALTER TABLE company_settings
        ADD confirmation_reminder_enabled BIT NOT NULL
            CONSTRAINT DF_company_settings_confirmation_reminder_enabled DEFAULT 1;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('company_settings') AND name = 'confirmation_reminder_hours_before'
)
BEGIN
    ALTER TABLE company_settings
        ADD confirmation_reminder_hours_before INT NOT NULL
            CONSTRAINT DF_company_settings_confirmation_reminder_hours_before DEFAULT 24;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_company_settings_confirmation_reminder_hours_before'
)
BEGIN
    ALTER TABLE company_settings
        ADD CONSTRAINT CK_company_settings_confirmation_reminder_hours_before
        CHECK (confirmation_reminder_hours_before > 0 AND confirmation_reminder_hours_before <= 168);
END;
GO

UPDATE company_settings
SET confirmation_reminder_enabled = 1
WHERE confirmation_reminder_enabled IS NULL;
GO

UPDATE company_settings
SET confirmation_reminder_hours_before = 24
WHERE confirmation_reminder_hours_before IS NULL OR confirmation_reminder_hours_before <= 0;
GO
