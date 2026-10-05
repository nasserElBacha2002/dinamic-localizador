/*
  Removes company-wide (client_id IS NULL) rows that migration 026 and
  ensureLegacyTypesForCompany propagated to every tenant.

  Matching uses code, name, and sort_order from migration 026 so manually
  created company formats with the same display name but different metadata
  are not removed.

  operational_locations.store_format is a denormalized string (no FK); clear
  values that no longer exist in the company catalog after cleanup.
*/

USE dinamic_attendance;
GO

DECLARE @deletedTypes INT;

DELETE lt
FROM dbo.company_location_types AS lt
INNER JOIN (
    VALUES
        (N'Express', N'Express', 1),
        (N'Express Interior MZA', N'Express Interior MZA', 2),
        (N'Express Interior SALTA', N'Express Interior SALTA', 3),
        (N'EXPRESS PLUS INTERIOR', N'EXPRESS PLUS INTERIOR', 4),
        (N'Market Bs As', N'Market Bs As', 5)
) AS seed (code, name, sort_order)
    ON lt.code = seed.code
   AND lt.name = seed.name
   AND lt.sort_order = seed.sort_order
WHERE lt.client_id IS NULL;

SET @deletedTypes = @@ROWCOUNT;
PRINT N'Migration 150 removed ' + CAST(@deletedTypes AS NVARCHAR(20))
    + N' legacy global location type row(s).';
GO

UPDATE ol
SET
    ol.store_format = NULL,
    ol.updated_at = SYSUTCDATETIME()
FROM dbo.operational_locations AS ol
WHERE ol.store_format IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM dbo.company_location_types AS lt
      WHERE lt.company_id = ol.company_id
        AND lt.code = ol.store_format
  );
GO
