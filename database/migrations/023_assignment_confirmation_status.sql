-- Assignment confirmation / unavailability for WhatsApp employee portal (Task 5)

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('operation_assignments') AND name = 'confirmation_status'
)
BEGIN
    ALTER TABLE operation_assignments
        ADD confirmation_status NVARCHAR(20) NOT NULL
            CONSTRAINT DF_operation_assignments_confirmation_status DEFAULT 'PENDING';
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_operation_assignments_confirmation_status'
      AND parent_object_id = OBJECT_ID('operation_assignments')
)
BEGIN
    ALTER TABLE operation_assignments
        ADD CONSTRAINT CK_operation_assignments_confirmation_status
        CHECK (confirmation_status IN ('PENDING', 'CONFIRMED', 'UNAVAILABLE'));
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('operation_assignments') AND name = 'confirmed_at'
)
BEGIN
    ALTER TABLE operation_assignments ADD confirmed_at DATETIME2 NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('operation_assignments') AND name = 'unavailable_at'
)
BEGIN
    ALTER TABLE operation_assignments ADD unavailable_at DATETIME2 NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('operation_assignments') AND name = 'response_note'
)
BEGIN
    ALTER TABLE operation_assignments ADD response_note NVARCHAR(500) NULL;
END;
GO
