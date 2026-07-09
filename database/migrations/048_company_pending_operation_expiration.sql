-- Company settings: pending checkout eligibility window after operation workday end.
-- Rollback (manual): drop CK/DF and column pending_operation_expiration_hours.
-- Ordering: ADD COLUMN → NORMALIZE DATA → ADD CHECK (partial-apply safe).

USE dinamic_attendance;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('company_settings') AND name = 'pending_operation_expiration_hours'
)
BEGIN
    ALTER TABLE company_settings
        ADD pending_operation_expiration_hours INT NOT NULL
            CONSTRAINT DF_company_settings_pending_operation_expiration_hours DEFAULT 12;
END;
GO

UPDATE company_settings
SET pending_operation_expiration_hours = 12
WHERE pending_operation_expiration_hours IS NULL
   OR pending_operation_expiration_hours < 1
   OR pending_operation_expiration_hours > 168;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_company_settings_pending_operation_expiration_hours'
)
BEGIN
    ALTER TABLE company_settings
        ADD CONSTRAINT CK_company_settings_pending_operation_expiration_hours
        CHECK (
            pending_operation_expiration_hours >= 1
            AND pending_operation_expiration_hours <= 168
        );
END;
GO
