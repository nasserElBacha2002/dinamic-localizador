/*
  Rollback: 085_user_company_membership_default_unique_rollback.sql
*/

USE dinamic_attendance;
GO

IF EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'UQ_user_company_memberships_user_default'
      AND object_id = OBJECT_ID(N'dbo.user_company_memberships')
)
BEGIN
    DROP INDEX UQ_user_company_memberships_user_default
        ON dbo.user_company_memberships;
END;
GO
