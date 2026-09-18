-- Rollback 139: restore pre-139 constraint and drop manual attendance metadata.

IF OBJECT_ID(N'dbo.attendance_records', N'U') IS NULL
BEGIN
    THROW 50139, 'Precondition failed: attendance_records missing', 1;
END;
GO

-- Drop source-column constraints first.
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

-- Drop post-139 arrival/checkout constraint, then restore migration-108 definition
-- BEFORE dropping arrival_source (the 139 MANUAL branch referenced that column).
IF EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = N'CK_attendance_records_arrival_or_checkout'
      AND parent_object_id = OBJECT_ID(N'dbo.attendance_records')
)
BEGIN
    ALTER TABLE dbo.attendance_records DROP CONSTRAINT CK_attendance_records_arrival_or_checkout;
END;
GO

-- Rows that only satisfy the MANUAL no-geo branch would violate the restored CK.
-- Convert them to exit-only or geo-incompatible shape: clear arrival when MANUAL without coords
-- so rollback can complete; operators must re-apply 139 if they need those rows.
UPDATE dbo.attendance_records
SET received_at = NULL,
    punctuality_status = N'NOT_RECORDED',
    location_status = N'NOT_RECORDED',
    validation_status = N'VALID',
    validation_reason = N'Cleared on rollback of migration 139 (manual arrival without geo)'
WHERE arrival_source = N'MANUAL'
  AND received_at IS NOT NULL
  AND received_latitude IS NULL
  AND received_longitude IS NULL
  AND distance_meters IS NULL
  AND checkout_at IS NOT NULL;
GO

-- Manual arrival-only rows (no checkout) cannot satisfy restored CK; reject rollback loudly.
IF EXISTS (
    SELECT 1
    FROM dbo.attendance_records
    WHERE arrival_source = N'MANUAL'
      AND received_at IS NOT NULL
      AND received_latitude IS NULL
      AND checkout_at IS NULL
)
BEGIN
    THROW 50139,
      'Rollback 139 blocked: manual arrival-only rows without geo exist. Re-apply migration 139 or convert those rows first.',
      1;
END;
GO

ALTER TABLE dbo.attendance_records
    ADD CONSTRAINT CK_attendance_records_arrival_or_checkout
    CHECK (
        (
            received_at IS NOT NULL
            AND received_latitude IS NOT NULL
            AND received_longitude IS NOT NULL
            AND distance_meters IS NOT NULL
            AND punctuality_status <> N'NOT_RECORDED'
            AND location_status <> N'NOT_RECORDED'
        )
        OR (
            received_at IS NULL
            AND received_latitude IS NULL
            AND received_longitude IS NULL
            AND distance_meters IS NULL
            AND punctuality_status = N'NOT_RECORDED'
            AND location_status = N'NOT_RECORDED'
            AND checkout_at IS NOT NULL
        )
    );
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
