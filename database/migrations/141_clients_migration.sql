IF OBJECT_ID('dbo.clients', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.clients (
        id UNIQUEIDENTIFIER NOT NULL,

        company_id UNIQUEIDENTIFIER NOT NULL,

        name NVARCHAR(255) NOT NULL,
        normalized_name NVARCHAR(255) NOT NULL,

        is_active BIT NOT NULL
            CONSTRAINT DF_clients_is_active DEFAULT 1,

        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_clients_created_at DEFAULT SYSUTCDATETIME(),

        updated_at DATETIME2 NOT NULL
            CONSTRAINT DF_clients_updated_at DEFAULT SYSUTCDATETIME(),

        created_by UNIQUEIDENTIFIER NULL,
        updated_by UNIQUEIDENTIFIER NULL,

        CONSTRAINT PK_clients
            PRIMARY KEY (id),

        CONSTRAINT FK_clients_company
            FOREIGN KEY (company_id)
            REFERENCES dbo.companies (id),

        CONSTRAINT UQ_clients_company_id
            UNIQUE (company_id, id),

        CONSTRAINT UQ_clients_company_normalized_name
            UNIQUE (company_id, normalized_name)
    );

    CREATE INDEX IX_clients_company_active
        ON dbo.clients (company_id, is_active);

    CREATE INDEX IX_clients_company_name
        ON dbo.clients (company_id, name);
END;