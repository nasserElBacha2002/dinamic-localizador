/*
  155: Encargado operativo — fase 1 (persistencia).
  - operation_charge_assignments: usuario del panel responsable de una operación (vigencia).
  - company_user_employee_links: vínculo 1:1 usuario ↔ colaborador por empresa (fichaje WA independiente).
  Rollback: database/migrations/rollback/155_operation_charge_assignments_and_user_employee_links_rollback.sql
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.scheduled_operations', N'U') IS NULL
   OR OBJECT_ID(N'dbo.user_company_memberships', N'U') IS NULL
   OR OBJECT_ID(N'dbo.employees', N'U') IS NULL
BEGIN
    THROW 50155, 'Precondition failed: scheduled_operations, user_company_memberships and employees required', 1;
END;
GO

/* ---------------------------------------------------------------------------
   company_user_employee_links
   --------------------------------------------------------------------------- */
IF OBJECT_ID(N'dbo.company_user_employee_links', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.company_user_employee_links (
        company_id UNIQUEIDENTIFIER NOT NULL,
        user_id UNIQUEIDENTIFIER NOT NULL,
        employee_id UNIQUEIDENTIFIER NOT NULL,
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_company_user_employee_links_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL
            CONSTRAINT DF_company_user_employee_links_updated_at DEFAULT SYSUTCDATETIME(),
        created_by_user_id UNIQUEIDENTIFIER NULL,
        previous_employee_id UNIQUEIDENTIFIER NULL,
        last_replaced_at DATETIME2 NULL,
        last_replaced_by_user_id UNIQUEIDENTIFIER NULL,
        CONSTRAINT PK_company_user_employee_links PRIMARY KEY (company_id, user_id),
        CONSTRAINT UQ_company_user_employee_links_employee UNIQUE (company_id, employee_id),
        CONSTRAINT FK_company_user_employee_links_membership FOREIGN KEY (user_id, company_id)
            REFERENCES dbo.user_company_memberships (user_id, company_id),
        CONSTRAINT FK_company_user_employee_links_employee FOREIGN KEY (company_id, employee_id)
            REFERENCES dbo.employees (company_id, id),
        CONSTRAINT FK_company_user_employee_links_created_by FOREIGN KEY (created_by_user_id)
            REFERENCES dbo.users (id),
        CONSTRAINT FK_company_user_employee_links_previous_employee FOREIGN KEY (company_id, previous_employee_id)
            REFERENCES dbo.employees (company_id, id),
        CONSTRAINT FK_company_user_employee_links_last_replaced_by FOREIGN KEY (last_replaced_by_user_id)
            REFERENCES dbo.users (id)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_company_user_employee_links_company_employee'
      AND object_id = OBJECT_ID(N'dbo.company_user_employee_links')
)
BEGIN
    CREATE INDEX IX_company_user_employee_links_company_employee
        ON dbo.company_user_employee_links (company_id, employee_id);
END;
GO

/* ---------------------------------------------------------------------------
   operation_charge_assignments
   --------------------------------------------------------------------------- */
IF OBJECT_ID(N'dbo.operation_charge_assignments', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.operation_charge_assignments (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT DF_operation_charge_assignments_id DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        operation_id UNIQUEIDENTIFIER NOT NULL,
        user_id UNIQUEIDENTIFIER NOT NULL,
        employee_id UNIQUEIDENTIFIER NOT NULL,
        valid_from DATE NOT NULL,
        valid_until DATE NULL,
        cancelled_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_operation_charge_assignments_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL
            CONSTRAINT DF_operation_charge_assignments_updated_at DEFAULT SYSUTCDATETIME(),
        created_by_user_id UNIQUEIDENTIFIER NULL,
        ended_by_user_id UNIQUEIDENTIFIER NULL,
        cancelled_by_user_id UNIQUEIDENTIFIER NULL,
        CONSTRAINT PK_operation_charge_assignments PRIMARY KEY (id),
        CONSTRAINT FK_operation_charge_assignments_operation FOREIGN KEY (company_id, operation_id)
            REFERENCES dbo.scheduled_operations (company_id, id),
        CONSTRAINT FK_operation_charge_assignments_membership FOREIGN KEY (user_id, company_id)
            REFERENCES dbo.user_company_memberships (user_id, company_id),
        CONSTRAINT FK_operation_charge_assignments_employee FOREIGN KEY (company_id, employee_id)
            REFERENCES dbo.employees (company_id, id),
        CONSTRAINT FK_operation_charge_assignments_created_by FOREIGN KEY (created_by_user_id)
            REFERENCES dbo.users (id),
        CONSTRAINT FK_operation_charge_assignments_ended_by FOREIGN KEY (ended_by_user_id)
            REFERENCES dbo.users (id),
        CONSTRAINT FK_operation_charge_assignments_cancelled_by FOREIGN KEY (cancelled_by_user_id)
            REFERENCES dbo.users (id),
        CONSTRAINT CK_operation_charge_assignments_date_range CHECK (
            valid_until IS NULL OR valid_until >= valid_from
        ),
        CONSTRAINT CK_operation_charge_assignments_cancelled_consistency CHECK (
            cancelled_at IS NULL OR cancelled_by_user_id IS NOT NULL
        )
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_operation_charge_assignments_company_id'
      AND object_id = OBJECT_ID(N'dbo.operation_charge_assignments')
)
BEGIN
    CREATE UNIQUE INDEX UQ_operation_charge_assignments_company_id
        ON dbo.operation_charge_assignments (company_id, id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_operation_charge_assignments_operation_user'
      AND object_id = OBJECT_ID(N'dbo.operation_charge_assignments')
)
BEGIN
    CREATE INDEX IX_operation_charge_assignments_operation_user
        ON dbo.operation_charge_assignments (company_id, operation_id, user_id, valid_from)
        INCLUDE (valid_until, cancelled_at);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_operation_charge_assignments_user_active'
      AND object_id = OBJECT_ID(N'dbo.operation_charge_assignments')
)
BEGIN
    CREATE INDEX IX_operation_charge_assignments_user_active
        ON dbo.operation_charge_assignments (company_id, user_id, valid_from)
        INCLUDE (operation_id, valid_until, cancelled_at);
END;
GO
