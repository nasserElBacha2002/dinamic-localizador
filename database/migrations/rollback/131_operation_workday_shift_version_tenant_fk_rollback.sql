/*
  Rollback: 131_operation_workday_shift_version_tenant_fk_rollback.sql

  Restores 129-era FK/CHECK. Safe when no MULTI workdays violate the looser CHECK
  (version may be null with shift present — Phase 1 leftover). Guards before DROP.
*/

USE dinamic_attendance;
GO

SET XACT_ABORT ON;
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

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_operation_workdays_shift_snapshot_pair'
      AND parent_object_id = OBJECT_ID(N'dbo.operation_workdays')
)
BEGIN
    ALTER TABLE dbo.operation_workdays DROP CONSTRAINT CK_operation_workdays_shift_snapshot_pair;
END;
GO

IF COL_LENGTH(N'dbo.operation_workdays', N'operation_shift_version_id') IS NOT NULL
BEGIN
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
                    AND shift_code_snapshot IS NOT NULL
                    AND LEN(LTRIM(RTRIM(shift_code_snapshot))) > 0
                    AND shift_name_snapshot IS NOT NULL
                    AND LEN(LTRIM(RTRIM(shift_name_snapshot))) > 0
                )
            );
END;
GO

IF COL_LENGTH(N'dbo.operation_workdays', N'operation_shift_version_id') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.foreign_keys
        WHERE name = N'FK_operation_workdays_shift_version_tenant'
          AND parent_object_id = OBJECT_ID(N'dbo.operation_workdays')
   )
BEGIN
    ALTER TABLE dbo.operation_workdays
        ADD CONSTRAINT FK_operation_workdays_shift_version_tenant
            FOREIGN KEY (company_id, operation_shift_version_id)
            REFERENCES dbo.operation_shift_versions (company_id, id);
END;
GO

IF OBJECT_ID(N'dbo.operation_shift_date_exceptions', N'U') IS NOT NULL
   AND COL_LENGTH(N'dbo.operation_shift_date_exceptions', N'updated_by_user_id') IS NOT NULL
BEGIN
    ALTER TABLE dbo.operation_shift_date_exceptions DROP COLUMN updated_by_user_id;
END;
GO
