/*
  Migration: 096_scheduled_operations_onetime_lifecycle_index.sql
  Purpose:
    Cover the ONE_TIME clock reconciler (every ~60s):
      operation_kind = ONE_TIME
      status IN (SCHEDULED, IN_PROGRESS)
      scheduled_start IS NOT NULL
      ORDER BY COALESCE(scheduled_end, scheduled_start), id

    Existing indexes (company/service/start uniqueness and service_id) do not
    match this working set. A filtered index keeps COUNT + keyset scans on the
    open ONE_TIME subset instead of the full table (COMPLETED/CANCELLED/RECURRING).

    COALESCE(end, start) cannot live in the key; scheduled_end + scheduled_start + id
    still support the ORDER BY/keyset residual on a small filtered set.

  Idempotent: creates the index only when missing.
  Rollback: database/migrations/rollback/096_scheduled_operations_onetime_lifecycle_index_rollback.sql
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.scheduled_operations', N'U') IS NULL
BEGIN
    THROW 50096, 'Precondition failed: scheduled_operations missing', 1;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'IX_scheduled_operations_onetime_open_lifecycle'
      AND object_id = OBJECT_ID(N'dbo.scheduled_operations')
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_scheduled_operations_onetime_open_lifecycle
        ON dbo.scheduled_operations (scheduled_end, scheduled_start, id)
        INCLUDE (
            company_id,
            service_id,
            operation_kind,
            early_tolerance_minutes,
            late_tolerance_minutes,
            status,
            notes,
            created_at,
            updated_at
        )
        WHERE operation_kind = N'ONE_TIME'
          AND status IN (N'SCHEDULED', N'IN_PROGRESS')
          AND scheduled_start IS NOT NULL;
END;
GO
