/*
  Migration: 092_phase3_scheduled_operations_active_unique.sql
  Purpose:
    - Enforce at most one non-cancelled ONE_TIME scheduled_operation per
      (company_id, service_id, scheduled_start).
    - Backs import/create check-then-act with a DB unique invariant (Phase 3).
    - RECURRING operations keep scheduled_start NULL (createRecurring) and are
      intentionally excluded from this index. NULL-start active rows are out of scope.

  Preconditions:
    - No duplicate groups for ONE_TIME non-cancelled rows with non-null scheduled_start.
      Do not auto-delete duplicates.

  Idempotency:
    - Drops the index if present (including a prior wider filter without operation_kind)
      then recreates with the ONE_TIME filter so upgrade from early Phase 3 drafts is safe.

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
          AND operation_kind = N'ONE_TIME'
          AND scheduled_start IS NOT NULL
        GROUP BY company_id, service_id, scheduled_start
        HAVING COUNT(*) > 1
    ) d
)
BEGIN
    THROW 50092,
      'Cannot create UQ_scheduled_operations_active_service_start: duplicate active ONE_TIME (company_id, service_id, scheduled_start) rows exist. Remediate before applying.',
      1;
END;
GO

IF EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'UQ_scheduled_operations_active_service_start'
      AND object_id = OBJECT_ID(N'dbo.scheduled_operations')
)
BEGIN
    DROP INDEX UQ_scheduled_operations_active_service_start ON dbo.scheduled_operations;
END;
GO

CREATE UNIQUE INDEX UQ_scheduled_operations_active_service_start
    ON dbo.scheduled_operations (company_id, service_id, scheduled_start)
    WHERE status <> N'CANCELLED'
      AND operation_kind = N'ONE_TIME'
      AND scheduled_start IS NOT NULL;
GO
