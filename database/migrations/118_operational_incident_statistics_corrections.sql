/*
  Migration: 118_operational_incident_statistics_corrections.sql
  Purpose:
    - Correct operational_date backfill for coverage events using company timezone
      (117 used CAST(... AS DATE) on UTC datetimes — wrong near midnight for BA).
      Prefer operation_workdays.work_date when present; else convert scheduled_start
      via AT TIME ZONE + fn_resolve_operation_timezone_for_sql (same policy as 039).
    - Unique index: one coverage event per replaced_assignment_id (company scoped)
    - Composite tenant FK (company_id, operation_id) for coverage + change events
  Rollback: rollback/118_operational_incident_statistics_corrections_rollback.sql
*/

/* ---------------------------------------------------------------------------
   1) Fix operational_date for existing coverage rows (TZ-aware)
   Prefer canonical work_date from operation_workdays; fall back to scheduled_start
   converted with company timezone (company_settings → companies.default → BA).
--------------------------------------------------------------------------- */
UPDATE oce
SET oce.operational_date = src.corrected_date
FROM dbo.operation_coverage_events oce
INNER JOIN (
    SELECT
        e.id,
        CAST(
            COALESCE(
                ow.work_date,
                CAST(
                    (o.scheduled_start AT TIME ZONE 'UTC') AT TIME ZONE
                    dbo.fn_resolve_operation_timezone_for_sql(
                        COALESCE(
                            NULLIF(cs.operation_timezone, N''),
                            NULLIF(c.default_timezone, N''),
                            N'America/Argentina/Buenos_Aires'
                        )
                    )
                    AS DATE
                ),
                e.operational_date
            ) AS DATE
        ) AS corrected_date
    FROM dbo.operation_coverage_events e
    INNER JOIN dbo.scheduled_operations o
        ON o.id = e.operation_id
       AND o.company_id = e.company_id
    INNER JOIN dbo.companies c ON c.id = e.company_id
    LEFT JOIN dbo.company_settings cs ON cs.company_id = e.company_id
    OUTER APPLY (
        SELECT TOP 1 ow2.work_date
        FROM dbo.operation_workdays ow2
        WHERE ow2.operation_id = e.operation_id
          AND ow2.company_id = e.company_id
          AND ow2.status <> N'CANCELLED'
        ORDER BY
            CASE WHEN ow2.work_date = e.operational_date THEN 0 ELSE 1 END,
            ABS(DATEDIFF(DAY, ow2.work_date, CAST(e.occurred_at AS DATE))),
            ow2.work_date
    ) ow
) src ON src.id = oce.id
WHERE oce.operational_date <> src.corrected_date;
GO

/* ---------------------------------------------------------------------------
   2) Deduplicate replaced_assignment_id before unique index
   Keep earliest occurred_at / created_at row per (company_id, replaced_assignment_id).
--------------------------------------------------------------------------- */
;WITH ranked AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY company_id, replaced_assignment_id
            ORDER BY occurred_at ASC, created_at ASC, id ASC
        ) AS rn
    FROM dbo.operation_coverage_events
    WHERE replaced_assignment_id IS NOT NULL
)
DELETE FROM ranked WHERE rn > 1;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_oce_company_replaced_assignment'
      AND object_id = OBJECT_ID(N'dbo.operation_coverage_events')
)
BEGIN
    CREATE UNIQUE INDEX UQ_oce_company_replaced_assignment
        ON dbo.operation_coverage_events (company_id, replaced_assignment_id)
        WHERE replaced_assignment_id IS NOT NULL;
END;
GO

/* ---------------------------------------------------------------------------
   3) Composite company-operation FKs (tenant integrity)
--------------------------------------------------------------------------- */
IF EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_oce_operation'
)
BEGIN
    ALTER TABLE dbo.operation_coverage_events DROP CONSTRAINT FK_oce_operation;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_oce_operation_company'
)
BEGIN
    ALTER TABLE dbo.operation_coverage_events
        ADD CONSTRAINT FK_oce_operation_company
        FOREIGN KEY (company_id, operation_id)
        REFERENCES dbo.scheduled_operations (company_id, id);
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_oche_operation'
)
BEGIN
    ALTER TABLE dbo.operation_change_events DROP CONSTRAINT FK_oche_operation;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_oche_operation_company'
)
BEGIN
    ALTER TABLE dbo.operation_change_events
        ADD CONSTRAINT FK_oche_operation_company
        FOREIGN KEY (company_id, operation_id)
        REFERENCES dbo.scheduled_operations (company_id, id);
END;
GO
