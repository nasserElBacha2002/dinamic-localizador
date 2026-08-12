/*
  Migration: 093_phase3_scheduled_operations_active_unique_onetime.sql
  Purpose:
    Ensure UQ_scheduled_operations_active_service_start uses the ONE_TIME filter.
    Upgrades DBs that applied an earlier Phase 3 draft of 092 without operation_kind
    in the filter definition.

  Idempotent: no-op when the index already exists with ONE_TIME in filter_definition;
  creates the index when missing; recreates when filter is wider/wrong.

  Rollback: database/migrations/rollback/093_phase3_scheduled_operations_active_unique_onetime_rollback.sql
           (restores the pre-093 wider filter only if needed for emergency; prefer 092 rollback)
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.scheduled_operations', N'U') IS NULL
BEGIN
    THROW 50093, 'Precondition failed: scheduled_operations missing', 1;
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
    THROW 50093,
      'Cannot ensure UQ_scheduled_operations_active_service_start: duplicate active ONE_TIME keys exist. Remediate before applying.',
      1;
END;
GO

DECLARE @filter NVARCHAR(MAX) = (
    SELECT i.filter_definition
    FROM sys.indexes i
    WHERE i.name = N'UQ_scheduled_operations_active_service_start'
      AND i.object_id = OBJECT_ID(N'dbo.scheduled_operations')
);

IF @filter IS NOT NULL AND @filter LIKE N'%ONE_TIME%'
BEGIN
    PRINT N'093: UQ_scheduled_operations_active_service_start already ONE_TIME-scoped; skipping.';
END
ELSE
BEGIN
    IF @filter IS NOT NULL
    BEGIN
        DROP INDEX UQ_scheduled_operations_active_service_start ON dbo.scheduled_operations;
    END;

    CREATE UNIQUE INDEX UQ_scheduled_operations_active_service_start
        ON dbo.scheduled_operations (company_id, service_id, scheduled_start)
        WHERE status <> N'CANCELLED'
          AND operation_kind = N'ONE_TIME'
          AND scheduled_start IS NOT NULL;
END;
GO
