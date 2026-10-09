-- Allow import_jobs.entity_type = clients for generic client imports.
-- Rollback: restore CK_import_jobs_entity_type without clients (only if no client jobs exist).

USE dinamic_attendance;
GO

IF EXISTS (
  SELECT 1
  FROM sys.check_constraints
  WHERE name = N'CK_import_jobs_entity_type'
    AND parent_object_id = OBJECT_ID(N'dbo.import_jobs')
)
BEGIN
  ALTER TABLE dbo.import_jobs DROP CONSTRAINT CK_import_jobs_entity_type;
END
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.check_constraints
  WHERE name = N'CK_import_jobs_entity_type'
    AND parent_object_id = OBJECT_ID(N'dbo.import_jobs')
)
BEGIN
  ALTER TABLE dbo.import_jobs
  ADD CONSTRAINT CK_import_jobs_entity_type CHECK (
    entity_type IN (N'operations', N'services', N'employees', N'clients')
  );
END
GO
