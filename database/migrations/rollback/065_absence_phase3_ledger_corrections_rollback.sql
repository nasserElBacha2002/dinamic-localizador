/*
  Rollback for 065_absence_phase3_ledger_corrections.sql
*/

USE dinamic_attendance;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_absence_balance_movements_request_reservation'
      AND object_id = OBJECT_ID('dbo.employee_absence_balance_movements')
)
    DROP INDEX IX_absence_balance_movements_request_reservation ON dbo.employee_absence_balance_movements;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UX_absence_balance_movements_reversed'
      AND object_id = OBJECT_ID('dbo.employee_absence_balance_movements')
)
    DROP INDEX UX_absence_balance_movements_reversed ON dbo.employee_absence_balance_movements;
GO

IF EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = 'FK_absence_balance_movements_reversed'
)
    ALTER TABLE dbo.employee_absence_balance_movements DROP CONSTRAINT FK_absence_balance_movements_reversed;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.employee_absence_balance_movements')
      AND name = 'reversed_movement_id'
)
    ALTER TABLE dbo.employee_absence_balance_movements DROP COLUMN reversed_movement_id;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_absence_requests_reservation_version'
      AND parent_object_id = OBJECT_ID('dbo.absence_requests')
)
    ALTER TABLE dbo.absence_requests DROP CONSTRAINT CK_absence_requests_reservation_version;
GO

IF EXISTS (
    SELECT 1 FROM sys.default_constraints
    WHERE name = 'DF_absence_requests_reservation_version'
      AND parent_object_id = OBJECT_ID('dbo.absence_requests')
)
    ALTER TABLE dbo.absence_requests DROP CONSTRAINT DF_absence_requests_reservation_version;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.absence_requests') AND name = 'year_allocations_json'
)
    ALTER TABLE dbo.absence_requests DROP COLUMN year_allocations_json;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.absence_requests') AND name = 'reservation_version'
)
    ALTER TABLE dbo.absence_requests DROP COLUMN reservation_version;
GO
