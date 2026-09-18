-- Rollback 139: drop manual attendance metadata columns/constraints.

IF EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = N'CK_attendance_records_arrival_source'
      AND parent_object_id = OBJECT_ID(N'dbo.attendance_records')
)
BEGIN
    ALTER TABLE dbo.attendance_records DROP CONSTRAINT CK_attendance_records_arrival_source;
END;
GO

IF EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = N'CK_attendance_records_checkout_source'
      AND parent_object_id = OBJECT_ID(N'dbo.attendance_records')
)
BEGIN
    ALTER TABLE dbo.attendance_records DROP CONSTRAINT CK_attendance_records_checkout_source;
END;
GO

IF COL_LENGTH(N'dbo.attendance_records', N'checkout_registered_at') IS NOT NULL
BEGIN
    ALTER TABLE dbo.attendance_records DROP COLUMN checkout_registered_at;
END;
GO

IF COL_LENGTH(N'dbo.attendance_records', N'checkout_registered_by') IS NOT NULL
BEGIN
    ALTER TABLE dbo.attendance_records DROP COLUMN checkout_registered_by;
END;
GO

IF COL_LENGTH(N'dbo.attendance_records', N'arrival_registered_at') IS NOT NULL
BEGIN
    ALTER TABLE dbo.attendance_records DROP COLUMN arrival_registered_at;
END;
GO

IF COL_LENGTH(N'dbo.attendance_records', N'arrival_registered_by') IS NOT NULL
BEGIN
    ALTER TABLE dbo.attendance_records DROP COLUMN arrival_registered_by;
END;
GO

IF COL_LENGTH(N'dbo.attendance_records', N'checkout_source') IS NOT NULL
BEGIN
    ALTER TABLE dbo.attendance_records DROP COLUMN checkout_source;
END;
GO

IF COL_LENGTH(N'dbo.attendance_records', N'arrival_source') IS NOT NULL
BEGIN
    ALTER TABLE dbo.attendance_records DROP COLUMN arrival_source;
END;
GO
