-- Enforce operational location (service/store) name uniqueness per company.
-- Physical table: operational_locations (legacy: stores).
-- Remediates legacy duplicate names deterministically before creating the index.
-- Rollback:
--   DROP INDEX UQ_operational_locations_company_id_name ON dbo.operational_locations;

USE dinamic_attendance;
GO

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
    THROW 51000, 'Cannot create unique operational location name index: duplicate names remain after remediation.', 1;
END;
GO

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
