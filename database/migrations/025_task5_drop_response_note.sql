-- Repair: remove unused response_note column from Task 5 review fix.
-- Safe for databases that never had the column (old 023 without response_note).

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('operation_assignments') AND name = 'response_note'
)
BEGIN
    ALTER TABLE operation_assignments DROP COLUMN response_note;
END;
GO
