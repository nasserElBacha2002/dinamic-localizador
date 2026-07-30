/*
  Rollback for 064_absence_phase3_balance_ledger.sql
  Order: movements table → balance constraints/columns → feature flag
*/

USE dinamic_attendance;
GO

IF OBJECT_ID('dbo.employee_absence_balance_movements', 'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.employee_absence_balance_movements;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_employee_absence_balances_projection_invariant'
      AND parent_object_id = OBJECT_ID('dbo.employee_absence_balances')
)
    ALTER TABLE dbo.employee_absence_balances DROP CONSTRAINT CK_employee_absence_balances_projection_invariant;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_employee_absence_balances_version'
      AND parent_object_id = OBJECT_ID('dbo.employee_absence_balances')
)
    ALTER TABLE dbo.employee_absence_balances DROP CONSTRAINT CK_employee_absence_balances_version;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_employee_absence_balances_available_nonneg'
      AND parent_object_id = OBJECT_ID('dbo.employee_absence_balances')
)
    ALTER TABLE dbo.employee_absence_balances DROP CONSTRAINT CK_employee_absence_balances_available_nonneg;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_employee_absence_balances_consumed_nonneg'
      AND parent_object_id = OBJECT_ID('dbo.employee_absence_balances')
)
    ALTER TABLE dbo.employee_absence_balances DROP CONSTRAINT CK_employee_absence_balances_consumed_nonneg;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_employee_absence_balances_reserved_nonneg'
      AND parent_object_id = OBJECT_ID('dbo.employee_absence_balances')
)
    ALTER TABLE dbo.employee_absence_balances DROP CONSTRAINT CK_employee_absence_balances_reserved_nonneg;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_employee_absence_balances_granted_nonneg'
      AND parent_object_id = OBJECT_ID('dbo.employee_absence_balances')
)
    ALTER TABLE dbo.employee_absence_balances DROP CONSTRAINT CK_employee_absence_balances_granted_nonneg;
GO

DECLARE @df SYSNAME;
DECLARE cur CURSOR LOCAL FAST_FORWARD FOR
    SELECT dc.name
    FROM sys.default_constraints dc
    INNER JOIN sys.columns c ON c.default_object_id = dc.object_id
    WHERE dc.parent_object_id = OBJECT_ID('dbo.employee_absence_balances')
      AND c.name IN ('granted_days', 'reserved_days', 'consumed_days', 'available_days', 'version');
OPEN cur;
FETCH NEXT FROM cur INTO @df;
WHILE @@FETCH_STATUS = 0
BEGIN
    EXEC(N'ALTER TABLE dbo.employee_absence_balances DROP CONSTRAINT [' + @df + N']');
    FETCH NEXT FROM cur INTO @df;
END;
CLOSE cur;
DEALLOCATE cur;
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.employee_absence_balances') AND name = 'version')
    ALTER TABLE dbo.employee_absence_balances DROP COLUMN version;
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.employee_absence_balances') AND name = 'available_days')
    ALTER TABLE dbo.employee_absence_balances DROP COLUMN available_days;
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.employee_absence_balances') AND name = 'consumed_days')
    ALTER TABLE dbo.employee_absence_balances DROP COLUMN consumed_days;
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.employee_absence_balances') AND name = 'reserved_days')
    ALTER TABLE dbo.employee_absence_balances DROP COLUMN reserved_days;
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.employee_absence_balances') AND name = 'granted_days')
    ALTER TABLE dbo.employee_absence_balances DROP COLUMN granted_days;
GO

IF EXISTS (
    SELECT 1 FROM sys.default_constraints
    WHERE name = 'DF_company_settings_absence_balance_ledger_enabled'
      AND parent_object_id = OBJECT_ID('dbo.company_settings')
)
    ALTER TABLE dbo.company_settings DROP CONSTRAINT DF_company_settings_absence_balance_ledger_enabled;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.company_settings') AND name = 'absence_balance_ledger_enabled'
)
    ALTER TABLE dbo.company_settings DROP COLUMN absence_balance_ledger_enabled;
GO
