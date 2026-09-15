/*
  Migration: 131_operation_workday_shift_version_tenant_fk.sql

  Phase 2 hardenings:
  - Composite FK: operation_workdays (company_id, operation_shift_id, operation_shift_version_id)
    → operation_shift_versions (company_id, operation_shift_id, id)
  - Tighten CHECK so MULTI rows require both shift + version; SINGLE both null
  - Add updated_by_user_id on operation_shift_date_exceptions

  Rollback: rollback/131_operation_workday_shift_version_tenant_fk_rollback.sql
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.operation_shift_versions', N'U') IS NULL
BEGIN
    THROW 50131, 'Precondition failed: operation_shift_versions missing (run 129 first)', 1;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_operation_shift_versions_company_shift_id'
      AND object_id = OBJECT_ID(N'dbo.operation_shift_versions')
)
BEGIN
    CREATE UNIQUE INDEX UQ_operation_shift_versions_company_shift_id
        ON dbo.operation_shift_versions (company_id, operation_shift_id, id);
END;
GO

/* Backfill missing version ids before tightening CHECK/FK. */
IF COL_LENGTH(N'dbo.operation_workdays', N'operation_shift_version_id') IS NOT NULL
BEGIN
    UPDATE ow
    SET ow.operation_shift_version_id = v.id
    FROM dbo.operation_workdays ow
    CROSS APPLY (
        SELECT TOP 1 osv.id
        FROM dbo.operation_shift_versions osv
        WHERE osv.company_id = ow.company_id
          AND osv.operation_shift_id = ow.operation_shift_id
          AND osv.effective_from <= ow.work_date
          AND (osv.effective_until IS NULL OR osv.effective_until >= ow.work_date)
        ORDER BY osv.effective_from DESC
    ) v
    WHERE ow.operation_shift_id IS NOT NULL
      AND ow.operation_shift_version_id IS NULL;
END;
GO

/* Drop weaker version-only FK if present; replace with shift+version composite. */
IF EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_operation_workdays_shift_version_tenant'
      AND parent_object_id = OBJECT_ID(N'dbo.operation_workdays')
)
BEGIN
    ALTER TABLE dbo.operation_workdays DROP CONSTRAINT FK_operation_workdays_shift_version_tenant;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_operation_workdays_shift_version_shift_tenant'
      AND parent_object_id = OBJECT_ID(N'dbo.operation_workdays')
)
BEGIN
    ALTER TABLE dbo.operation_workdays DROP CONSTRAINT FK_operation_workdays_shift_version_shift_tenant;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_operation_workdays_shift_version_shift_tenant'
      AND parent_object_id = OBJECT_ID(N'dbo.operation_workdays')
)
BEGIN
    ALTER TABLE dbo.operation_workdays
        ADD CONSTRAINT FK_operation_workdays_shift_version_shift_tenant
            FOREIGN KEY (company_id, operation_shift_id, operation_shift_version_id)
            REFERENCES dbo.operation_shift_versions (company_id, operation_shift_id, id);
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_operation_workdays_shift_snapshot_pair'
      AND parent_object_id = OBJECT_ID(N'dbo.operation_workdays')
)
BEGIN
    ALTER TABLE dbo.operation_workdays DROP CONSTRAINT CK_operation_workdays_shift_snapshot_pair;
END;
GO

ALTER TABLE dbo.operation_workdays
    ADD CONSTRAINT CK_operation_workdays_shift_snapshot_pair
        CHECK (
            (
                operation_shift_id IS NULL
                AND operation_shift_version_id IS NULL
                AND shift_code_snapshot IS NULL
                AND shift_name_snapshot IS NULL
            )
            OR (
                operation_shift_id IS NOT NULL
                AND operation_shift_version_id IS NOT NULL
                AND shift_code_snapshot IS NOT NULL
                AND LEN(LTRIM(RTRIM(shift_code_snapshot))) > 0
                AND shift_name_snapshot IS NOT NULL
                AND LEN(LTRIM(RTRIM(shift_name_snapshot))) > 0
            )
        );
GO

IF OBJECT_ID(N'dbo.operation_shift_date_exceptions', N'U') IS NOT NULL
   AND COL_LENGTH(N'dbo.operation_shift_date_exceptions', N'updated_by_user_id') IS NULL
BEGIN
    ALTER TABLE dbo.operation_shift_date_exceptions
        ADD updated_by_user_id UNIQUEIDENTIFIER NULL;
END;
GO
