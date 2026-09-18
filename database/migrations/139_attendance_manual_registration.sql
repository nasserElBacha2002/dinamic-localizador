-- 139: Manual attendance registration metadata (backwards-compatible).
-- Adds per-side registration source and who/when an internal user registered the event.

IF OBJECT_ID(N'dbo.attendance_records', N'U') IS NULL
BEGIN
    THROW 50139, 'Precondition failed: attendance_records missing', 1;
END;
GO

IF COL_LENGTH(N'dbo.attendance_records', N'arrival_source') IS NULL
BEGIN
    ALTER TABLE dbo.attendance_records
      ADD arrival_source NVARCHAR(20) NULL;
END;
GO

IF COL_LENGTH(N'dbo.attendance_records', N'checkout_source') IS NULL
BEGIN
    ALTER TABLE dbo.attendance_records
      ADD checkout_source NVARCHAR(20) NULL;
END;
GO

IF COL_LENGTH(N'dbo.attendance_records', N'arrival_registered_by') IS NULL
BEGIN
    ALTER TABLE dbo.attendance_records
      ADD arrival_registered_by UNIQUEIDENTIFIER NULL;
END;
GO

IF COL_LENGTH(N'dbo.attendance_records', N'arrival_registered_at') IS NULL
BEGIN
    ALTER TABLE dbo.attendance_records
      ADD arrival_registered_at DATETIME2 NULL;
END;
GO

IF COL_LENGTH(N'dbo.attendance_records', N'checkout_registered_by') IS NULL
BEGIN
    ALTER TABLE dbo.attendance_records
      ADD checkout_registered_by UNIQUEIDENTIFIER NULL;
END;
GO

IF COL_LENGTH(N'dbo.attendance_records', N'checkout_registered_at') IS NULL
BEGIN
    ALTER TABLE dbo.attendance_records
      ADD checkout_registered_at DATETIME2 NULL;
END;
GO

-- Backfill: treat historical WhatsApp SIDs as WHATSAPP; leave null when side not recorded.
UPDATE dbo.attendance_records
SET arrival_source = N'WHATSAPP'
WHERE received_at IS NOT NULL
  AND arrival_source IS NULL;
GO

UPDATE dbo.attendance_records
SET checkout_source = N'WHATSAPP'
WHERE checkout_at IS NOT NULL
  AND checkout_source IS NULL;
GO

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

ALTER TABLE dbo.attendance_records
    ADD CONSTRAINT CK_attendance_records_arrival_or_checkout
    CHECK (
        (
            -- WhatsApp / geo arrival
            received_at IS NOT NULL
            AND received_latitude IS NOT NULL
            AND received_longitude IS NOT NULL
            AND distance_meters IS NOT NULL
            AND punctuality_status <> N'NOT_RECORDED'
            AND location_status <> N'NOT_RECORDED'
        )
        OR (
            -- Manual arrival without geolocation
            received_at IS NOT NULL
            AND received_latitude IS NULL
            AND received_longitude IS NULL
            AND distance_meters IS NULL
            AND punctuality_status <> N'NOT_RECORDED'
            AND location_status = N'NOT_RECORDED'
            AND arrival_source = N'MANUAL'
        )
        OR (
            -- Exit-only (no arrival)
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

IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = N'CK_attendance_records_arrival_source'
      AND parent_object_id = OBJECT_ID(N'dbo.attendance_records')
)
BEGIN
    ALTER TABLE dbo.attendance_records
      ADD CONSTRAINT CK_attendance_records_arrival_source
      CHECK (
        arrival_source IS NULL
        OR arrival_source IN (N'WHATSAPP', N'MANUAL', N'IMPORT', N'SYSTEM')
      );
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = N'CK_attendance_records_checkout_source'
      AND parent_object_id = OBJECT_ID(N'dbo.attendance_records')
)
BEGIN
    ALTER TABLE dbo.attendance_records
      ADD CONSTRAINT CK_attendance_records_checkout_source
      CHECK (
        checkout_source IS NULL
        OR checkout_source IN (N'WHATSAPP', N'MANUAL', N'IMPORT', N'SYSTEM')
      );
END;
GO
