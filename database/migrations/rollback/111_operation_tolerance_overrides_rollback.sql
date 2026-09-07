IF EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = N'CK_scheduled_operations_early_tolerance_source'
      AND parent_object_id = OBJECT_ID(N'dbo.scheduled_operations')
)
BEGIN
    ALTER TABLE dbo.scheduled_operations
        DROP CONSTRAINT CK_scheduled_operations_early_tolerance_source;
END;
GO

IF EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = N'CK_scheduled_operations_late_tolerance_source'
      AND parent_object_id = OBJECT_ID(N'dbo.scheduled_operations')
)
BEGIN
    ALTER TABLE dbo.scheduled_operations
        DROP CONSTRAINT CK_scheduled_operations_late_tolerance_source;
END;
GO

IF EXISTS (
    SELECT 1
    FROM sys.default_constraints
    WHERE name = N'DF_scheduled_operations_early_tolerance_source'
      AND parent_object_id = OBJECT_ID(N'dbo.scheduled_operations')
)
BEGIN
    ALTER TABLE dbo.scheduled_operations
        DROP CONSTRAINT DF_scheduled_operations_early_tolerance_source;
END;
GO

IF EXISTS (
    SELECT 1
    FROM sys.default_constraints
    WHERE name = N'DF_scheduled_operations_late_tolerance_source'
      AND parent_object_id = OBJECT_ID(N'dbo.scheduled_operations')
)
BEGIN
    ALTER TABLE dbo.scheduled_operations
        DROP CONSTRAINT DF_scheduled_operations_late_tolerance_source;
END;
GO

IF COL_LENGTH('dbo.scheduled_operations', 'early_tolerance_source') IS NOT NULL
BEGIN
    ALTER TABLE dbo.scheduled_operations DROP COLUMN early_tolerance_source;
END;
GO

IF COL_LENGTH('dbo.scheduled_operations', 'late_tolerance_source') IS NOT NULL
BEGIN
    ALTER TABLE dbo.scheduled_operations DROP COLUMN late_tolerance_source;
END;
GO
