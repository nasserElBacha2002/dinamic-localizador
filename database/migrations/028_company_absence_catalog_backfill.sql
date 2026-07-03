-- Backfill company-scoped absence types and default absence settings for all companies.
-- Idempotent: only inserts missing rows per (company_id, code).

USE dinamic_attendance;
GO

INSERT INTO absence_types (
  company_id, code, name, description,
  requires_approval, requires_attachment, deducts_balance, allows_half_day
)
SELECT
  c.id,
  seed.code,
  seed.name,
  seed.description,
  seed.requires_approval,
  seed.requires_attachment,
  seed.deducts_balance,
  seed.allows_half_day
FROM companies c
CROSS JOIN (
  VALUES
    (N'VACATION', N'Vacaciones', N'Licencia por vacaciones', 1, 0, 1, 0),
    (N'STUDY_DAY', N'Día de estudio', N'Ausencia por día de estudio', 1, 0, 0, 1),
    (N'SICK_LEAVE', N'Salud', N'Ausencia por motivos de salud', 1, 0, 0, 1),
    (N'PERSONAL_PROCEDURE', N'Trámite personal', N'Ausencia por trámite personal', 1, 0, 0, 0),
    (N'JUSTIFIED_ABSENCE', N'Ausencia justificada', N'Ausencia justificada', 1, 0, 0, 0),
    (N'UNJUSTIFIED_ABSENCE', N'Ausencia injustificada', N'Ausencia injustificada', 1, 0, 0, 0),
    (N'SPECIAL_LEAVE', N'Licencia especial', N'Licencia especial', 1, 0, 0, 0),
    (N'OTHER', N'Otro', N'Otro tipo de ausencia', 1, 0, 0, 0)
) AS seed(code, name, description, requires_approval, requires_attachment, deducts_balance, allows_half_day)
WHERE NOT EXISTS (
  SELECT 1
  FROM absence_types at
  WHERE at.company_id = c.id
    AND at.code = seed.code
);
GO

INSERT INTO company_absence_settings (
  company_id,
  absence_type_code,
  default_annual_days,
  auto_assign_on_employee_create
)
SELECT
  c.id,
  seed.absence_type_code,
  seed.default_annual_days,
  seed.auto_assign_on_employee_create
FROM companies c
CROSS JOIN (
  VALUES
    (N'VACATION', CAST(14 AS DECIMAL(5, 1)), 1),
    (N'STUDY_DAY', CAST(2.5 AS DECIMAL(5, 1)), 1),
    (N'SICK_LEAVE', CAST(0 AS DECIMAL(5, 1)), 0),
    (N'PERSONAL_PROCEDURE', CAST(0 AS DECIMAL(5, 1)), 0),
    (N'JUSTIFIED_ABSENCE', CAST(0 AS DECIMAL(5, 1)), 0),
    (N'UNJUSTIFIED_ABSENCE', CAST(0 AS DECIMAL(5, 1)), 0),
    (N'SPECIAL_LEAVE', CAST(0 AS DECIMAL(5, 1)), 0),
    (N'OTHER', CAST(0 AS DECIMAL(5, 1)), 0)
) AS seed(absence_type_code, default_annual_days, auto_assign_on_employee_create)
WHERE NOT EXISTS (
  SELECT 1
  FROM company_absence_settings cas
  WHERE cas.company_id = c.id
    AND cas.absence_type_code = seed.absence_type_code
);
GO
