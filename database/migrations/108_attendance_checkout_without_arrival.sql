/*
  108_attendance_checkout_without_arrival.sql

  Allow attendance records that represent checkout without a prior check-in:
    - Arrival fields (received_at, coordinates, distance) become nullable.
    - punctuality_status / location_status gain NOT_RECORDED for explicit semantics.
  Existing rows are unchanged (all historical arrivals remain non-null).
*/

-- ---------------------------------------------------------------------------
-- Nullable arrival fields
-- ---------------------------------------------------------------------------
IF COL_LENGTH('dbo.attendance_records', 'received_at') IS NOT NULL
   AND EXISTS (
     SELECT 1
     FROM sys.columns
     WHERE object_id = OBJECT_ID(N'dbo.attendance_records')
       AND name = N'received_at'
       AND is_nullable = 0
   )
BEGIN
    ALTER TABLE dbo.attendance_records ALTER COLUMN received_at DATETIME2 NULL;
END;
GO

IF COL_LENGTH('dbo.attendance_records', 'received_latitude') IS NOT NULL
   AND EXISTS (
     SELECT 1
     FROM sys.columns
     WHERE object_id = OBJECT_ID(N'dbo.attendance_records')
       AND name = N'received_latitude'
       AND is_nullable = 0
   )
BEGIN
    ALTER TABLE dbo.attendance_records ALTER COLUMN received_latitude DECIMAL(10, 7) NULL;
END;
GO

IF COL_LENGTH('dbo.attendance_records', 'received_longitude') IS NOT NULL
   AND EXISTS (
     SELECT 1
     FROM sys.columns
     WHERE object_id = OBJECT_ID(N'dbo.attendance_records')
       AND name = N'received_longitude'
       AND is_nullable = 0
   )
BEGIN
    ALTER TABLE dbo.attendance_records ALTER COLUMN received_longitude DECIMAL(10, 7) NULL;
END;
GO

IF COL_LENGTH('dbo.attendance_records', 'distance_meters') IS NOT NULL
   AND EXISTS (
     SELECT 1
     FROM sys.columns
     WHERE object_id = OBJECT_ID(N'dbo.attendance_records')
       AND name = N'distance_meters'
       AND is_nullable = 0
   )
BEGIN
    ALTER TABLE dbo.attendance_records ALTER COLUMN distance_meters DECIMAL(10, 2) NULL;
END;
GO

-- ---------------------------------------------------------------------------
-- CHECK constraints: allow NOT_RECORDED; keep geo bounds when coords present
-- ---------------------------------------------------------------------------
IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_attendance_records_latitude'
      AND parent_object_id = OBJECT_ID(N'dbo.attendance_records')
)
BEGIN
    ALTER TABLE dbo.attendance_records DROP CONSTRAINT CK_attendance_records_latitude;
END;
GO

ALTER TABLE dbo.attendance_records
    ADD CONSTRAINT CK_attendance_records_latitude
    CHECK (
        received_latitude IS NULL
        OR received_latitude BETWEEN -90 AND 90
    );
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_attendance_records_longitude'
      AND parent_object_id = OBJECT_ID(N'dbo.attendance_records')
)
BEGIN
    ALTER TABLE dbo.attendance_records DROP CONSTRAINT CK_attendance_records_longitude;
END;
GO

ALTER TABLE dbo.attendance_records
    ADD CONSTRAINT CK_attendance_records_longitude
    CHECK (
        received_longitude IS NULL
        OR received_longitude BETWEEN -180 AND 180
    );
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_attendance_records_distance_meters'
      AND parent_object_id = OBJECT_ID(N'dbo.attendance_records')
)
BEGIN
    ALTER TABLE dbo.attendance_records DROP CONSTRAINT CK_attendance_records_distance_meters;
END;
GO

ALTER TABLE dbo.attendance_records
    ADD CONSTRAINT CK_attendance_records_distance_meters
    CHECK (
        distance_meters IS NULL
        OR distance_meters >= 0
    );
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_attendance_records_location_status'
      AND parent_object_id = OBJECT_ID(N'dbo.attendance_records')
)
BEGIN
    ALTER TABLE dbo.attendance_records DROP CONSTRAINT CK_attendance_records_location_status;
END;
GO

ALTER TABLE dbo.attendance_records
    ADD CONSTRAINT CK_attendance_records_location_status
    CHECK (
        location_status IN (
            N'INSIDE_GEOFENCE',
            N'OUTSIDE_GEOFENCE',
            N'INVALID_LOCATION',
            N'NOT_RECORDED'
        )
    );
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_attendance_records_punctuality_status'
      AND parent_object_id = OBJECT_ID(N'dbo.attendance_records')
)
BEGIN
    ALTER TABLE dbo.attendance_records DROP CONSTRAINT CK_attendance_records_punctuality_status;
END;
GO

ALTER TABLE dbo.attendance_records
    ADD CONSTRAINT CK_attendance_records_punctuality_status
    CHECK (
        punctuality_status IN (
            N'EARLY',
            N'ON_TIME',
            N'LATE',
            N'OUTSIDE_TIME_WINDOW',
            N'NOT_RECORDED'
        )
    );
GO

-- Exit-only rows must have checkout_at; arrival-only or full rows keep prior shape.
IF EXISTS (
    SELECT 1 FROM sys.check_constraints
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
