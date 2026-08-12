/*
  Migration: 092_phase3_scheduled_operations_active_unique.sql
  Purpose:
    - Enforce at most one non-cancelled scheduled_operation per
      (company_id, service_id, scheduled_start) when scheduled_start IS NOT NULL.
    - Backs import/create check-then-act with a DB unique invariant (Phase 3).
  Preconditions:
    - No duplicate groups for non-null scheduled_start among non-cancelled rows.
      (NULL scheduled_start duplicates are excluded from this index; remediate separately.)
  Rollback: database/migrations/rollback/092_phase3_scheduled_operations_active_unique_rollback.sql
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.scheduled_operations', N'U') IS NULL
BEGIN
    THROW 50092, 'Precondition failed: scheduled_operations missing', 1;
END;
GO

IF EXISTS (
    SELECT 1
    FROM (
        SELECT company_id, service_id, scheduled_start, COUNT(*) AS c
        FROM dbo.scheduled_operations
        WHERE status <> N'CANCELLED'
          AND scheduled_start IS NOT NULL
        GROUP BY company_id, service_id, scheduled_start
        HAVING COUNT(*) > 1
    ) d
)
BEGIN
    THROW 50092,
      'Cannot create UQ_scheduled_operations_active_service_start: duplicate non-cancelled (company_id, service_id, scheduled_start) rows exist. Remediate before applying.',
      1;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'UQ_scheduled_operations_active_service_start'
      AND object_id = OBJECT_ID(N'dbo.scheduled_operations')
)
BEGIN
    CREATE UNIQUE INDEX UQ_scheduled_operations_active_service_start
        ON dbo.scheduled_operations (company_id, service_id, scheduled_start)
        WHERE status <> N'CANCELLED'
          AND scheduled_start IS NOT NULL;
END;
GO
