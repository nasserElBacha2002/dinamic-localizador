USE dinamic_attendance;
GO

IF EXISTS (
    SELECT 1 FROM dbo.user_company_memberships WHERE role = N'OPERATIONAL_MANAGER'
) OR EXISTS (
    SELECT 1 FROM dbo.user_invitations WHERE role = N'OPERATIONAL_MANAGER'
)
BEGIN
    THROW 50001, N'Rollback 158 bloqueado: existen datos con rol OPERATIONAL_MANAGER.', 1;
END;
GO

IF COL_LENGTH(N'dbo.user_invitations', N'linked_employee_id') IS NOT NULL
BEGIN
    IF EXISTS (
        SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_user_invitations_linked_employee'
    )
    BEGIN
        ALTER TABLE dbo.user_invitations DROP CONSTRAINT FK_user_invitations_linked_employee;
    END;
    ALTER TABLE dbo.user_invitations DROP COLUMN linked_employee_id;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_user_invitations_role'
      AND parent_object_id = OBJECT_ID(N'dbo.user_invitations')
)
BEGIN
    ALTER TABLE dbo.user_invitations DROP CONSTRAINT CK_user_invitations_role;
    ALTER TABLE dbo.user_invitations
        ADD CONSTRAINT CK_user_invitations_role CHECK (
            role IN ('OWNER', 'ADMIN', 'HR', 'SUPERVISOR', 'OPERATOR', 'READ_ONLY')
        );
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_user_company_memberships_role'
      AND parent_object_id = OBJECT_ID(N'dbo.user_company_memberships')
)
BEGIN
    ALTER TABLE dbo.user_company_memberships DROP CONSTRAINT CK_user_company_memberships_role;
    ALTER TABLE dbo.user_company_memberships
        ADD CONSTRAINT CK_user_company_memberships_role CHECK (
            role IN ('OWNER', 'ADMIN', 'HR', 'SUPERVISOR', 'OPERATOR', 'READ_ONLY')
        );
END;
GO
