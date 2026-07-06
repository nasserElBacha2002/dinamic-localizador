-- Phase 3: Backfill audit entity types for operational domain rename.
-- Permission keys (operations:read, services:read, etc.) are resolved in application code;
-- no persisted permission rows require migration in this schema.

IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'audit_logs')
BEGIN
    UPDATE audit_logs
    SET entity_type = N'operation'
    WHERE entity_type = N'inventory';

    UPDATE audit_logs
    SET entity_type = N'service'
    WHERE entity_type = N'store';
END;
GO
