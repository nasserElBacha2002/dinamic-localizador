-- Checkout / departure fields for attendance_records

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('attendance_records') AND name = 'checkout_at'
)
BEGIN
    ALTER TABLE attendance_records ADD checkout_at DATETIME2 NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('attendance_records') AND name = 'checkout_latitude'
)
BEGIN
    ALTER TABLE attendance_records ADD checkout_latitude DECIMAL(10, 7) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('attendance_records') AND name = 'checkout_longitude'
)
BEGIN
    ALTER TABLE attendance_records ADD checkout_longitude DECIMAL(10, 7) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('attendance_records') AND name = 'checkout_distance_meters'
)
BEGIN
    ALTER TABLE attendance_records ADD checkout_distance_meters DECIMAL(10, 2) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('attendance_records') AND name = 'checkout_status'
)
BEGIN
    ALTER TABLE attendance_records ADD checkout_status NVARCHAR(40) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('attendance_records') AND name = 'checkout_review_reason'
)
BEGIN
    ALTER TABLE attendance_records ADD checkout_review_reason NVARCHAR(500) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('attendance_records') AND name = 'early_departure_minutes'
)
BEGIN
    ALTER TABLE attendance_records ADD early_departure_minutes INT NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('attendance_records') AND name = 'extra_worked_minutes'
)
BEGIN
    ALTER TABLE attendance_records ADD extra_worked_minutes INT NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('attendance_records') AND name = 'checkout_message_sid'
)
BEGIN
    ALTER TABLE attendance_records ADD checkout_message_sid NVARCHAR(100) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_attendance_records_checkout_status'
      AND parent_object_id = OBJECT_ID('attendance_records')
)
BEGIN
    ALTER TABLE attendance_records
        ADD CONSTRAINT CK_attendance_records_checkout_status
        CHECK (
            checkout_status IS NULL
            OR checkout_status IN (
                'CHECKOUT_VALID',
                'CHECKOUT_EARLY_WITHIN_TOLERANCE',
                'CHECKOUT_EARLY_REVIEW',
                'CHECKOUT_LATE_EXTRA_TIME',
                'CHECKOUT_LOCATION_REVIEW',
                'CHECKOUT_REJECTED'
            )
        );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UQ_attendance_records_checkout_message_sid'
      AND object_id = OBJECT_ID('attendance_records')
)
BEGIN
    CREATE UNIQUE INDEX UQ_attendance_records_checkout_message_sid
        ON attendance_records (checkout_message_sid)
        WHERE checkout_message_sid IS NOT NULL;
END;
GO

-- Extend bot session states for checkout flow

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_bot_sessions_state'
      AND parent_object_id = OBJECT_ID('bot_sessions')
)
BEGIN
    ALTER TABLE bot_sessions DROP CONSTRAINT CK_bot_sessions_state;
END;
GO

ALTER TABLE bot_sessions
    ADD CONSTRAINT CK_bot_sessions_state
    CHECK (state IN (
        'WAITING_LOCATION',
        'WAITING_INVENTORY_SELECTION',
        'WAITING_CHECKOUT_LOCATION',
        'WAITING_CHECKOUT_INVENTORY_SELECTION',
        'COMPLETED',
        'CANCELLED',
        'EXPIRED'
    ));
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UX_bot_sessions_active_employee'
      AND object_id = OBJECT_ID('bot_sessions')
)
BEGIN
    DROP INDEX UX_bot_sessions_active_employee ON bot_sessions;
END;
GO

CREATE UNIQUE INDEX UX_bot_sessions_active_employee
    ON bot_sessions (employee_id)
    WHERE state IN (
        'WAITING_LOCATION',
        'WAITING_INVENTORY_SELECTION',
        'WAITING_CHECKOUT_LOCATION',
        'WAITING_CHECKOUT_INVENTORY_SELECTION'
    );
GO
