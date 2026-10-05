/*
  Removes legacy mass-seeded company_location_types rows from migration 026 and
  ensureLegacyTypesForCompany (same INSERT shape: client_id NULL, canonical codes).

  Provenance (no separate audit column exists):
  - client_id IS NULL (client-scoped rows from migration 144 / manual client formats are kept)
  - Exact (code, name, sort_order) match to the five 026 seeds
  - created_at = updated_at (any catalog edit preserves the row as intentionally maintained)
  - Company still holds all five canonical seeds at once (026/ensureLegacy only ever
    introduced the full quintet per company; a single manual format with the same
    metadata is not removed)

  Does not run a global orphan store_format sweep. Only operational_locations whose
  store_format matches a removed (company_id, code) pair are cleared.

  Idempotent: safe to re-apply; second run deletes zero rows.
*/

SET XACT_ABORT ON;

DECLARE @deletedKeys TABLE (
    company_id UNIQUEIDENTIFIER NOT NULL,
    code NVARCHAR(80) NOT NULL
);

;WITH legacy_seed AS (
    SELECT *
    FROM (
        VALUES
            (N'Express', N'Express', 1),
            (N'Express Interior MZA', N'Express Interior MZA', 2),
            (N'Express Interior SALTA', N'Express Interior SALTA', 3),
            (N'EXPRESS PLUS INTERIOR', N'EXPRESS PLUS INTERIOR', 4),
            (N'Market Bs As', N'Market Bs As', 5)
    ) AS seed (code, name, sort_order)
),
companies_with_unmodified_quintet AS (
    SELECT lt.company_id
    FROM dbo.company_location_types AS lt
    INNER JOIN legacy_seed AS seed
        ON lt.code = seed.code
       AND lt.name = seed.name
       AND lt.sort_order = seed.sort_order
    WHERE lt.client_id IS NULL
      AND lt.created_at = lt.updated_at
    GROUP BY lt.company_id
    HAVING COUNT(DISTINCT lt.code) = 5
)
DELETE lt
OUTPUT
    deleted.company_id,
    deleted.code
INTO @deletedKeys (company_id, code)
FROM dbo.company_location_types AS lt
INNER JOIN legacy_seed AS seed
    ON lt.code = seed.code
   AND lt.name = seed.name
   AND lt.sort_order = seed.sort_order
INNER JOIN companies_with_unmodified_quintet AS quintet
    ON quintet.company_id = lt.company_id
WHERE lt.client_id IS NULL
  AND lt.created_at = lt.updated_at;

DECLARE @deletedTypes INT = (SELECT COUNT(*) FROM @deletedKeys);

UPDATE ol
SET
    ol.store_format = NULL,
    ol.updated_at = SYSUTCDATETIME()
FROM dbo.operational_locations AS ol
INNER JOIN @deletedKeys AS removed
    ON removed.company_id = ol.company_id
   AND removed.code = ol.store_format;

DECLARE @clearedLocations INT = @@ROWCOUNT;

PRINT N'Migration 150 removed ' + CAST(@deletedTypes AS NVARCHAR(20))
    + N' legacy global location type row(s) and cleared store_format on '
    + CAST(@clearedLocations AS NVARCHAR(20)) + N' operational location(s).';
