/*
  Migration: 065_absence_phase3_ledger_corrections.sql
  Purpose:
    - reservation_version + year_allocations_json on absence_requests
    - reversed_movement_id on ledger movements (one reversal per original)
    - Force absence_balance_ledger_enabled = 0 until explicit enable
    - Index for request-scoped reservation net queries
  Rollback: see database/migrations/rollback/065_absence_phase3_ledger_corrections_rollback.sql
*/

USE dinamic_attendance;
GO

-- Companies that got 064 with flag forced ON: disable until enable script.
UPDATE dbo.company_settings
SET absence_balance_ledger_enabled = 0
WHERE absence_balance_ledger_enabled = 1;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.absence_requests') AND name = 'reservation_version'
)
BEGIN
    ALTER TABLE dbo.absence_requests
        ADD reservation_version INT NOT NULL
            CONSTRAINT DF_absence_requests_reservation_version DEFAULT 1;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_absence_requests_reservation_version'
      AND parent_object_id = OBJECT_ID('dbo.absence_requests')
)
BEGIN
    ALTER TABLE dbo.absence_requests
        ADD CONSTRAINT CK_absence_requests_reservation_version CHECK (reservation_version >= 1);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.absence_requests') AND name = 'year_allocations_json'
)
BEGIN
    ALTER TABLE dbo.absence_requests
        ADD year_allocations_json NVARCHAR(MAX) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.employee_absence_balance_movements')
      AND name = 'reversed_movement_id'
)
BEGIN
    ALTER TABLE dbo.employee_absence_balance_movements
        ADD reversed_movement_id UNIQUEIDENTIFIER NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = 'FK_absence_balance_movements_reversed'
)
BEGIN
    ALTER TABLE dbo.employee_absence_balance_movements
        ADD CONSTRAINT FK_absence_balance_movements_reversed
            FOREIGN KEY (reversed_movement_id)
            REFERENCES dbo.employee_absence_balance_movements (id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UX_absence_balance_movements_reversed'
      AND object_id = OBJECT_ID('dbo.employee_absence_balance_movements')
)
BEGIN
    CREATE UNIQUE INDEX UX_absence_balance_movements_reversed
        ON dbo.employee_absence_balance_movements (company_id, reversed_movement_id)
        WHERE reversed_movement_id IS NOT NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_absence_balance_movements_request_reservation'
      AND object_id = OBJECT_ID('dbo.employee_absence_balance_movements')
)
BEGIN
    CREATE INDEX IX_absence_balance_movements_request_reservation
        ON dbo.employee_absence_balance_movements (
            company_id,
            absence_request_id,
            absence_type_id,
            period_year,
            movement_type
        )
        INCLUDE (quantity, direction);
END;
GO
