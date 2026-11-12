/*
  158: Encargado operativo — rol OPERATIONAL_MANAGER + vínculo invitación ↔ colaborador.
*/

USE dinamic_attendance;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_user_company_memberships_role'
      AND parent_object_id = OBJECT_ID(N'dbo.user_company_memberships')
)
BEGIN
    ALTER TABLE dbo.user_company_memberships DROP CONSTRAINT CK_user_company_memberships_role;
END;
GO

ALTER TABLE dbo.user_company_memberships
    ADD CONSTRAINT CK_user_company_memberships_role CHECK (
        role IN (
            'OWNER', 'ADMIN', 'HR', 'SUPERVISOR',
            'OPERATIONAL_MANAGER', 'OPERATOR', 'READ_ONLY'
        )
    );
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_user_invitations_role'
      AND parent_object_id = OBJECT_ID(N'dbo.user_invitations')
)
BEGIN
    ALTER TABLE dbo.user_invitations DROP CONSTRAINT CK_user_invitations_role;
END;
GO

ALTER TABLE dbo.user_invitations
    ADD CONSTRAINT CK_user_invitations_role CHECK (
        role IN (
            'OWNER', 'ADMIN', 'HR', 'SUPERVISOR',
            'OPERATIONAL_MANAGER', 'OPERATOR', 'READ_ONLY'
        )
    );
GO

IF COL_LENGTH(N'dbo.user_invitations', N'linked_employee_id') IS NULL
BEGIN
    ALTER TABLE dbo.user_invitations
        ADD linked_employee_id UNIQUEIDENTIFIER NULL;

    IF NOT EXISTS (
        SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_user_invitations_linked_employee'
    )
    BEGIN
        ALTER TABLE dbo.user_invitations
            ADD CONSTRAINT FK_user_invitations_linked_employee
                FOREIGN KEY (company_id, linked_employee_id)
                REFERENCES dbo.employees (company_id, id);
    END;
END;
GO
