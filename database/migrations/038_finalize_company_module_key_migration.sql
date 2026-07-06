-- Forward-only completion for company_modules inventory_operations → operations.
-- Handles duplicate legacy + canonical rows deterministically.
-- Idempotent — safe after 037 on databases with or without duplicate module rows.

IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'company_modules')
BEGIN
    -- Merge enabled state and preserve meaningful timestamps when both rows exist.
    UPDATE ops
    SET
        is_enabled = CASE
            WHEN ops.is_enabled = 1 OR leg.is_enabled = 1 THEN CAST(1 AS BIT)
            ELSE CAST(0 AS BIT)
        END,
        created_at = CASE
            WHEN leg.created_at < ops.created_at THEN leg.created_at
            ELSE ops.created_at
        END,
        updated_at = CASE
            WHEN leg.updated_at > ops.updated_at THEN leg.updated_at
            ELSE ops.updated_at
        END
    FROM company_modules ops
    INNER JOIN company_modules leg
        ON leg.company_id = ops.company_id
       AND leg.module_key = N'inventory_operations'
    WHERE ops.module_key = N'operations';

    -- Remove legacy rows when canonical operations row already exists.
    DELETE leg
    FROM company_modules leg
    WHERE leg.module_key = N'inventory_operations'
      AND EXISTS (
          SELECT 1
          FROM company_modules ops
          WHERE ops.company_id = leg.company_id
            AND ops.module_key = N'operations'
      );

    -- Rename orphaned legacy rows (inventory_operations only).
    UPDATE company_modules
    SET module_key = N'operations'
    WHERE module_key = N'inventory_operations';
END;
GO
