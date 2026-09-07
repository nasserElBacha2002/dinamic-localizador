/*
  111_operation_tolerance_overrides.sql

  Add explicit provenance for operation arrival tolerances.

  The existing early_tolerance_minutes / late_tolerance_minutes columns remain
  non-null effective-value snapshots for rolling-deployment compatibility.
  Source columns are authoritative for provenance:
    COMPANY_DEFAULT = inherit the current company default
    CUSTOM          = explicit operation value (including zero)

  Existing rows and writes from older rolling-deployment instances default to
  CUSTOM. Their effective behavior is preserved without inferring provenance
  from values.
*/

IF COL_LENGTH('dbo.scheduled_operations', 'early_tolerance_source') IS NULL
BEGIN
    ALTER TABLE dbo.scheduled_operations
        ADD early_tolerance_source NVARCHAR(20) NOT NULL
            CONSTRAINT DF_scheduled_operations_early_tolerance_source
            DEFAULT N'CUSTOM';
END;
GO

IF COL_LENGTH('dbo.scheduled_operations', 'late_tolerance_source') IS NULL
BEGIN
    ALTER TABLE dbo.scheduled_operations
        ADD late_tolerance_source NVARCHAR(20) NOT NULL
            CONSTRAINT DF_scheduled_operations_late_tolerance_source
            DEFAULT N'CUSTOM';
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.default_constraints dc
    INNER JOIN sys.columns c
        ON c.object_id = dc.parent_object_id
       AND c.column_id = dc.parent_column_id
    WHERE dc.parent_object_id = OBJECT_ID(N'dbo.scheduled_operations')
      AND c.name = N'early_tolerance_source'
)
BEGIN
    ALTER TABLE dbo.scheduled_operations
        ADD CONSTRAINT DF_scheduled_operations_early_tolerance_source
        DEFAULT N'CUSTOM' FOR early_tolerance_source;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.default_constraints dc
    INNER JOIN sys.columns c
        ON c.object_id = dc.parent_object_id
       AND c.column_id = dc.parent_column_id
    WHERE dc.parent_object_id = OBJECT_ID(N'dbo.scheduled_operations')
      AND c.name = N'late_tolerance_source'
)
BEGIN
    ALTER TABLE dbo.scheduled_operations
        ADD CONSTRAINT DF_scheduled_operations_late_tolerance_source
        DEFAULT N'CUSTOM' FOR late_tolerance_source;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = N'CK_scheduled_operations_early_tolerance_source'
      AND parent_object_id = OBJECT_ID(N'dbo.scheduled_operations')
)
BEGIN
    ALTER TABLE dbo.scheduled_operations
        ADD CONSTRAINT CK_scheduled_operations_early_tolerance_source
        CHECK (early_tolerance_source IN (N'COMPANY_DEFAULT', N'CUSTOM'));
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = N'CK_scheduled_operations_late_tolerance_source'
      AND parent_object_id = OBJECT_ID(N'dbo.scheduled_operations')
)
BEGIN
    ALTER TABLE dbo.scheduled_operations
        ADD CONSTRAINT CK_scheduled_operations_late_tolerance_source
        CHECK (late_tolerance_source IN (N'COMPANY_DEFAULT', N'CUSTOM'));
END;
GO
