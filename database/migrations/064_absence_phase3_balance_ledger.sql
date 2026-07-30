/*
  Migration: 064_absence_phase3_balance_ledger.sql
  Purpose:
    - Projection columns on employee_absence_balances (granted/reserved/consumed/available/version)
    - Append-only ledger employee_absence_balance_movements
    - Feature flag absence_balance_ledger_enabled (default ON after backfill)
    - Backfill from total_days + approved/pending requests
  Rollback: see database/migrations/rollback/064_absence_phase3_balance_ledger_rollback.sql
*/

USE dinamic_attendance;
GO

-- ---------------------------------------------------------------------------
-- Feature flag
-- ---------------------------------------------------------------------------
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.company_settings')
      AND name = 'absence_balance_ledger_enabled'
)
BEGIN
    ALTER TABLE dbo.company_settings
        ADD absence_balance_ledger_enabled BIT NOT NULL
            CONSTRAINT DF_company_settings_absence_balance_ledger_enabled DEFAULT 0;
END;
GO

-- ---------------------------------------------------------------------------
-- Projection columns on employee_absence_balances
-- ---------------------------------------------------------------------------
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.employee_absence_balances') AND name = 'granted_days'
)
BEGIN
    ALTER TABLE dbo.employee_absence_balances
        ADD granted_days DECIMAL(7,1) NOT NULL
            CONSTRAINT DF_employee_absence_balances_granted_days DEFAULT 0;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.employee_absence_balances') AND name = 'reserved_days'
)
BEGIN
    ALTER TABLE dbo.employee_absence_balances
        ADD reserved_days DECIMAL(7,1) NOT NULL
            CONSTRAINT DF_employee_absence_balances_reserved_days DEFAULT 0;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.employee_absence_balances') AND name = 'consumed_days'
)
BEGIN
    ALTER TABLE dbo.employee_absence_balances
        ADD consumed_days DECIMAL(7,1) NOT NULL
            CONSTRAINT DF_employee_absence_balances_consumed_days DEFAULT 0;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.employee_absence_balances') AND name = 'available_days'
)
BEGIN
    ALTER TABLE dbo.employee_absence_balances
        ADD available_days DECIMAL(7,1) NOT NULL
            CONSTRAINT DF_employee_absence_balances_available_days DEFAULT 0;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.employee_absence_balances') AND name = 'version'
)
BEGIN
    ALTER TABLE dbo.employee_absence_balances
        ADD version INT NOT NULL
            CONSTRAINT DF_employee_absence_balances_version DEFAULT 1;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_employee_absence_balances_granted_nonneg'
      AND parent_object_id = OBJECT_ID('dbo.employee_absence_balances')
)
BEGIN
    ALTER TABLE dbo.employee_absence_balances
        ADD CONSTRAINT CK_employee_absence_balances_granted_nonneg CHECK (granted_days >= 0);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_employee_absence_balances_reserved_nonneg'
      AND parent_object_id = OBJECT_ID('dbo.employee_absence_balances')
)
BEGIN
    ALTER TABLE dbo.employee_absence_balances
        ADD CONSTRAINT CK_employee_absence_balances_reserved_nonneg CHECK (reserved_days >= 0);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_employee_absence_balances_consumed_nonneg'
      AND parent_object_id = OBJECT_ID('dbo.employee_absence_balances')
)
BEGIN
    ALTER TABLE dbo.employee_absence_balances
        ADD CONSTRAINT CK_employee_absence_balances_consumed_nonneg CHECK (consumed_days >= 0);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_employee_absence_balances_available_nonneg'
      AND parent_object_id = OBJECT_ID('dbo.employee_absence_balances')
)
BEGIN
    ALTER TABLE dbo.employee_absence_balances
        ADD CONSTRAINT CK_employee_absence_balances_available_nonneg CHECK (available_days >= 0);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_employee_absence_balances_version'
      AND parent_object_id = OBJECT_ID('dbo.employee_absence_balances')
)
BEGIN
    ALTER TABLE dbo.employee_absence_balances
        ADD CONSTRAINT CK_employee_absence_balances_version CHECK (version >= 1);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_employee_absence_balances_projection_invariant'
      AND parent_object_id = OBJECT_ID('dbo.employee_absence_balances')
)
BEGIN
    ALTER TABLE dbo.employee_absence_balances
        ADD CONSTRAINT CK_employee_absence_balances_projection_invariant
        CHECK (ABS(available_days - (granted_days - reserved_days - consumed_days)) < 0.05);
END;
GO

-- ---------------------------------------------------------------------------
-- Ledger movements
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.employee_absence_balance_movements', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.employee_absence_balance_movements (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_eabm_id DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        balance_id UNIQUEIDENTIFIER NOT NULL,
        employee_id UNIQUEIDENTIFIER NOT NULL,
        absence_type_id UNIQUEIDENTIFIER NOT NULL,
        period_year INT NOT NULL,
        absence_request_id UNIQUEIDENTIFIER NULL,
        movement_type NVARCHAR(40) NOT NULL,
        quantity DECIMAL(7,1) NOT NULL,
        direction NVARCHAR(10) NOT NULL,
        idempotency_key NVARCHAR(200) NOT NULL,
        reason NVARCHAR(500) NULL,
        metadata_json NVARCHAR(MAX) NULL,
        performed_by_user_id UNIQUEIDENTIFIER NULL,
        performed_by_employee_id UNIQUEIDENTIFIER NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_eabm_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_employee_absence_balance_movements PRIMARY KEY (id),
        CONSTRAINT FK_eabm_company FOREIGN KEY (company_id) REFERENCES dbo.companies(id),
        CONSTRAINT FK_eabm_balance FOREIGN KEY (balance_id) REFERENCES dbo.employee_absence_balances(id),
        CONSTRAINT FK_eabm_employee FOREIGN KEY (employee_id) REFERENCES dbo.employees(id),
        CONSTRAINT FK_eabm_absence_type FOREIGN KEY (absence_type_id) REFERENCES dbo.absence_types(id),
        CONSTRAINT FK_eabm_request FOREIGN KEY (absence_request_id) REFERENCES dbo.absence_requests(id),
        CONSTRAINT CK_eabm_quantity CHECK (quantity > 0),
        CONSTRAINT CK_eabm_year CHECK (period_year BETWEEN 2000 AND 2100),
        CONSTRAINT CK_eabm_direction CHECK (direction IN (N'CREDIT', N'DEBIT')),
        CONSTRAINT CK_eabm_type CHECK (movement_type IN (
            N'INITIAL_GRANT',
            N'MANUAL_CREDIT',
            N'MANUAL_DEBIT',
            N'RESERVE',
            N'RELEASE',
            N'CONSUME',
            N'REVERSAL',
            N'MIGRATION_ADJUSTMENT'
        )),
        CONSTRAINT UQ_eabm_idempotency UNIQUE (company_id, idempotency_key)
    );

    CREATE INDEX IX_eabm_company_employee_year
        ON dbo.employee_absence_balance_movements (company_id, employee_id, period_year);

    CREATE INDEX IX_eabm_balance
        ON dbo.employee_absence_balance_movements (balance_id, created_at);

    CREATE INDEX IX_eabm_request
        ON dbo.employee_absence_balance_movements (company_id, absence_request_id)
        WHERE absence_request_id IS NOT NULL;
END;
GO

-- ---------------------------------------------------------------------------
-- Backfill projections from legacy total_days + request aggregates
-- ---------------------------------------------------------------------------
UPDATE b
SET
    granted_days = b.total_days,
    reserved_days = ISNULL(pending.days, 0),
    consumed_days = ISNULL(approved.days, 0),
    available_days = CASE
        WHEN b.total_days - ISNULL(pending.days, 0) - ISNULL(approved.days, 0) < 0 THEN 0
        ELSE b.total_days - ISNULL(pending.days, 0) - ISNULL(approved.days, 0)
    END,
    version = CASE WHEN b.version < 1 THEN 1 ELSE b.version END
FROM dbo.employee_absence_balances b
OUTER APPLY (
    SELECT SUM(r.total_days) AS days
    FROM dbo.absence_requests r
    INNER JOIN dbo.absence_types t ON t.id = r.absence_type_id AND t.company_id = r.company_id
    WHERE r.company_id = b.company_id
      AND r.employee_id = b.employee_id
      AND r.absence_type_id = b.absence_type_id
      AND YEAR(r.start_date) = b.year
      AND r.status IN (N'PENDING', N'NEEDS_INFO')
      AND t.deducts_balance = 1
) pending
OUTER APPLY (
    SELECT SUM(r.total_days) AS days
    FROM dbo.absence_requests r
    INNER JOIN dbo.absence_types t ON t.id = r.absence_type_id AND t.company_id = r.company_id
    WHERE r.company_id = b.company_id
      AND r.employee_id = b.employee_id
      AND r.absence_type_id = b.absence_type_id
      AND YEAR(r.start_date) = b.year
      AND r.status = N'APPROVED'
      AND t.deducts_balance = 1
) approved;
GO

-- Clamp reserved/consumed if they exceed granted (legacy oversubscription)
UPDATE dbo.employee_absence_balances
SET
    reserved_days = CASE
        WHEN reserved_days > granted_days - consumed_days
            THEN CASE WHEN granted_days - consumed_days < 0 THEN 0 ELSE granted_days - consumed_days END
        ELSE reserved_days
    END
WHERE reserved_days > granted_days - consumed_days;
GO

UPDATE dbo.employee_absence_balances
SET available_days = granted_days - reserved_days - consumed_days
WHERE ABS(available_days - (granted_days - reserved_days - consumed_days)) >= 0.05
   OR available_days < 0;
GO

-- Initial grant movements (idempotent by key)
INSERT INTO dbo.employee_absence_balance_movements (
    company_id,
    balance_id,
    employee_id,
    absence_type_id,
    period_year,
    absence_request_id,
    movement_type,
    quantity,
    direction,
    idempotency_key,
    reason,
    metadata_json
)
SELECT
    b.company_id,
    b.id,
    b.employee_id,
    b.absence_type_id,
    b.year,
    NULL,
    N'INITIAL_GRANT',
    b.granted_days,
    N'CREDIT',
    CONCAT(N'migration:initial-grant:', LOWER(CONVERT(NVARCHAR(36), b.id))),
    N'Backfill Fase 3 desde total_days legacy',
    N'{"source":"LEGACY_MIGRATION"}'
FROM dbo.employee_absence_balances b
WHERE b.granted_days > 0
  AND NOT EXISTS (
      SELECT 1
      FROM dbo.employee_absence_balance_movements m
      WHERE m.company_id = b.company_id
        AND m.idempotency_key = CONCAT(N'migration:initial-grant:', LOWER(CONVERT(NVARCHAR(36), b.id)))
  );
GO

-- Consume movements for approved requests (one per request/year attribution = start year)
INSERT INTO dbo.employee_absence_balance_movements (
    company_id,
    balance_id,
    employee_id,
    absence_type_id,
    period_year,
    absence_request_id,
    movement_type,
    quantity,
    direction,
    idempotency_key,
    reason,
    metadata_json
)
SELECT
    r.company_id,
    b.id,
    r.employee_id,
    r.absence_type_id,
    YEAR(r.start_date),
    r.id,
    N'CONSUME',
    r.total_days,
    N'DEBIT',
    CONCAT(N'absence:', LOWER(CONVERT(NVARCHAR(36), r.id)), N':consume:', YEAR(r.start_date), N':v1'),
    N'Backfill consumo de solicitud aprobada',
    N'{"source":"LEGACY_MIGRATION"}'
FROM dbo.absence_requests r
INNER JOIN dbo.absence_types t
    ON t.id = r.absence_type_id AND t.company_id = r.company_id AND t.deducts_balance = 1
INNER JOIN dbo.employee_absence_balances b
    ON b.company_id = r.company_id
   AND b.employee_id = r.employee_id
   AND b.absence_type_id = r.absence_type_id
   AND b.year = YEAR(r.start_date)
WHERE r.status = N'APPROVED'
  AND r.total_days > 0
  AND NOT EXISTS (
      SELECT 1
      FROM dbo.employee_absence_balance_movements m
      WHERE m.company_id = r.company_id
        AND m.idempotency_key = CONCAT(N'absence:', LOWER(CONVERT(NVARCHAR(36), r.id)), N':consume:', YEAR(r.start_date), N':v1')
  );
GO

-- Reserve movements for pending / needs_info
INSERT INTO dbo.employee_absence_balance_movements (
    company_id,
    balance_id,
    employee_id,
    absence_type_id,
    period_year,
    absence_request_id,
    movement_type,
    quantity,
    direction,
    idempotency_key,
    reason,
    metadata_json
)
SELECT
    r.company_id,
    b.id,
    r.employee_id,
    r.absence_type_id,
    YEAR(r.start_date),
    r.id,
    N'RESERVE',
    r.total_days,
    N'DEBIT',
    CONCAT(N'absence:', LOWER(CONVERT(NVARCHAR(36), r.id)), N':reserve:', YEAR(r.start_date), N':v1'),
    N'Backfill reserva de solicitud pendiente',
    N'{"source":"LEGACY_MIGRATION"}'
FROM dbo.absence_requests r
INNER JOIN dbo.absence_types t
    ON t.id = r.absence_type_id AND t.company_id = r.company_id AND t.deducts_balance = 1
INNER JOIN dbo.employee_absence_balances b
    ON b.company_id = r.company_id
   AND b.employee_id = r.employee_id
   AND b.absence_type_id = r.absence_type_id
   AND b.year = YEAR(r.start_date)
WHERE r.status IN (N'PENDING', N'NEEDS_INFO')
  AND r.total_days > 0
  AND NOT EXISTS (
      SELECT 1
      FROM dbo.employee_absence_balance_movements m
      WHERE m.company_id = r.company_id
        AND m.idempotency_key = CONCAT(N'absence:', LOWER(CONVERT(NVARCHAR(36), r.id)), N':reserve:', YEAR(r.start_date), N':v1')
  );
GO

-- Enable ledger for all companies after successful backfill
UPDATE dbo.company_settings
SET absence_balance_ledger_enabled = 1;
GO
