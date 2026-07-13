-- Harden operational location name uniqueness per company.
-- Complements 048 by:
--   1) removing any legacy name-only UNIQUE constraint/index on dbo.operational_locations
--   2) auditing duplicates with trim-compatible normalization (LTRIM/RTRIM)
--   3) ensuring UQ_operational_locations_company_id_name exists
--   4) failing if any name-only unique key still remains
--
-- Rollback:
--   DROP INDEX UQ_operational_locations_company_id_name ON dbo.operational_locations;
--   (do not recreate dropped name-only unique indexes)

USE dinamic_attendance;
GO

-- ---------------------------------------------------------------------------
-- Drop unique constraints/indexes whose effective key is ONLY the name column.
-- ---------------------------------------------------------------------------
DECLARE @dropSql NVARCHAR(MAX) = N'';

;WITH name_only_unique AS (
    SELECT
        i.object_id,
        i.index_id,
        i.name AS index_name,
        i.is_unique_constraint
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID(N'dbo.operational_locations')
      AND i.is_unique = 1
      AND i.is_primary_key = 0
      AND i.name IS NOT NULL
      AND NOT EXISTS (
          SELECT 1
          FROM sys.index_columns ic
          INNER JOIN sys.columns c
              ON c.object_id = ic.object_id
             AND c.column_id = ic.column_id
          WHERE ic.object_id = i.object_id
            AND ic.index_id = i.index_id
            AND ic.is_included_column = 0
            AND c.name <> N'name'
      )
      AND EXISTS (
          SELECT 1
          FROM sys.index_columns ic
          INNER JOIN sys.columns c
              ON c.object_id = ic.object_id
             AND c.column_id = ic.column_id
          WHERE ic.object_id = i.object_id
            AND ic.index_id = i.index_id
            AND ic.is_included_column = 0
            AND c.name = N'name'
      )
      AND (
          SELECT COUNT(*)
          FROM sys.index_columns ic
          WHERE ic.object_id = i.object_id
            AND ic.index_id = i.index_id
            AND ic.is_included_column = 0
      ) = 1
)
SELECT @dropSql = @dropSql + CASE
    WHEN is_unique_constraint = 1 THEN
        N'ALTER TABLE dbo.operational_locations DROP CONSTRAINT ' + QUOTENAME(index_name) + N';'
    ELSE
        N'DROP INDEX ' + QUOTENAME(index_name) + N' ON dbo.operational_locations;'
END + CHAR(10)
FROM name_only_unique;

IF LEN(@dropSql) > 0
BEGIN
    EXEC sp_executesql @dropSql;
END;
GO

-- ---------------------------------------------------------------------------
-- Remediate trim-compatible duplicates before enforcing uniqueness.
-- Idempotent with migration 048 (safe if 048 already renamed rows).
-- ---------------------------------------------------------------------------
;WITH duplicate_groups AS (
    SELECT
        company_id,
        LTRIM(RTRIM(name)) AS normalized_name
    FROM dbo.operational_locations
    GROUP BY company_id, LTRIM(RTRIM(name))
    HAVING COUNT(*) > 1
),
ranked AS (
    SELECT
        ol.id,
        ol.company_id,
        LTRIM(RTRIM(ol.name)) AS normalized_name,
        ROW_NUMBER() OVER (
            PARTITION BY ol.company_id, LTRIM(RTRIM(ol.name))
            ORDER BY
                (
                    SELECT COUNT(*)
                    FROM dbo.scheduled_operations so
                    WHERE so.service_id = ol.id
                      AND so.company_id = ol.company_id
                ) DESC,
                ol.active DESC,
                ol.created_at ASC,
                ol.id ASC
        ) AS duplicate_rank
    FROM dbo.operational_locations ol
    INNER JOIN duplicate_groups dg
        ON dg.company_id = ol.company_id
       AND dg.normalized_name = LTRIM(RTRIM(ol.name))
),
rename_candidates AS (
    SELECT
        ranked.id,
        ranked.company_id,
        ranked.normalized_name + N' (' + CAST(ranked.duplicate_rank AS NVARCHAR(10)) + N')' AS candidate_name
    FROM ranked
    WHERE ranked.duplicate_rank > 1
),
final_names AS (
    SELECT
        rename_candidates.id,
        rename_candidates.company_id,
        rename_candidates.candidate_name,
        ROW_NUMBER() OVER (
            PARTITION BY rename_candidates.company_id, rename_candidates.candidate_name
            ORDER BY rename_candidates.id
        ) AS name_collision_rank
    FROM rename_candidates
)
UPDATE ol
SET
    name = CASE
        WHEN final_names.name_collision_rank > 1
            THEN final_names.candidate_name
                + N' #'
                + LEFT(REPLACE(CAST(final_names.id AS NVARCHAR(36)), N'-', N''), 8)
        ELSE final_names.candidate_name
    END,
    updated_at = SYSUTCDATETIME()
FROM dbo.operational_locations ol
INNER JOIN final_names ON final_names.id = ol.id;
GO

IF EXISTS (
    SELECT 1
    FROM (
        SELECT
            company_id,
            LTRIM(RTRIM(name)) AS normalized_name,
            COUNT(*) AS duplicate_count
        FROM dbo.operational_locations
        GROUP BY company_id, LTRIM(RTRIM(name))
        HAVING COUNT(*) > 1
    ) duplicates
)
BEGIN
    THROW 51000, 'Cannot enforce operational location name uniqueness: duplicate names remain after remediation.', 1;
END;
GO

-- ---------------------------------------------------------------------------
-- Ensure company-scoped unique index exists (idempotent with migration 048).
-- ---------------------------------------------------------------------------
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'UQ_operational_locations_company_id_name'
      AND object_id = OBJECT_ID(N'dbo.operational_locations')
)
BEGIN
    CREATE UNIQUE INDEX UQ_operational_locations_company_id_name
    ON dbo.operational_locations (company_id, name);
END;
GO

-- ---------------------------------------------------------------------------
-- Postcondition: no name-only unique key/index may remain.
-- ---------------------------------------------------------------------------
IF EXISTS (
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID(N'dbo.operational_locations')
      AND i.is_unique = 1
      AND i.is_primary_key = 0
      AND i.name IS NOT NULL
      AND NOT EXISTS (
          SELECT 1
          FROM sys.index_columns ic
          INNER JOIN sys.columns c
              ON c.object_id = ic.object_id
             AND c.column_id = ic.column_id
          WHERE ic.object_id = i.object_id
            AND ic.index_id = i.index_id
            AND ic.is_included_column = 0
            AND c.name <> N'name'
      )
      AND EXISTS (
          SELECT 1
          FROM sys.index_columns ic
          INNER JOIN sys.columns c
              ON c.object_id = ic.object_id
             AND c.column_id = ic.column_id
          WHERE ic.object_id = i.object_id
            AND ic.index_id = i.index_id
            AND ic.is_included_column = 0
            AND c.name = N'name'
      )
      AND (
          SELECT COUNT(*)
          FROM sys.index_columns ic
          WHERE ic.object_id = i.object_id
            AND ic.index_id = i.index_id
            AND ic.is_included_column = 0
      ) = 1
)
BEGIN
    THROW 51000, 'Migration failed: global operational location name uniqueness still exists on dbo.operational_locations.', 1;
END;
GO

-- ---------------------------------------------------------------------------
-- Postcondition: company-scoped unique index must exist with expected keys.
-- ---------------------------------------------------------------------------
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID(N'dbo.operational_locations')
      AND i.name = N'UQ_operational_locations_company_id_name'
      AND i.is_unique = 1
)
BEGIN
    THROW 51000, 'Migration failed: UQ_operational_locations_company_id_name is missing.', 1;
END;
GO
