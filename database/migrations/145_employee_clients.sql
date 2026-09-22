IF OBJECT_ID(N'dbo.employee_clients', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.employee_clients (
        company_id UNIQUEIDENTIFIER NOT NULL,
        employee_id UNIQUEIDENTIFIER NOT NULL,
        client_id UNIQUEIDENTIFIER NOT NULL,
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_employee_clients_created_at DEFAULT SYSUTCDATETIME(),
        created_by UNIQUEIDENTIFIER NULL,
        CONSTRAINT PK_employee_clients PRIMARY KEY (company_id, employee_id, client_id),
        CONSTRAINT FK_employee_clients_company FOREIGN KEY (company_id)
            REFERENCES dbo.companies (id),
        CONSTRAINT FK_employee_clients_employee FOREIGN KEY (company_id, employee_id)
            REFERENCES dbo.employees (company_id, id),
        CONSTRAINT FK_employee_clients_client FOREIGN KEY (company_id, client_id)
            REFERENCES dbo.clients (company_id, id),
        CONSTRAINT FK_employee_clients_created_by FOREIGN KEY (created_by)
            REFERENCES dbo.users (id)
    );
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_employee_clients_company_client_employee'
      AND object_id = OBJECT_ID(N'dbo.employee_clients')
)
BEGIN
    CREATE INDEX IX_employee_clients_company_client_employee
        ON dbo.employee_clients (company_id, client_id, employee_id);
END;
