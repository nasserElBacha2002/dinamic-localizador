-- Assign only Dinamic Systems legacy formats to that tenant's Carrefour client.
DECLARE @dinamicSystemsCompanyId UNIQUEIDENTIFIER;
DECLARE @carrefourClientId UNIQUEIDENTIFIER;
DECLARE @dinamicSystemsCount INT;
DECLARE @carrefourClientCount INT;
DECLARE @affectedRows INT;

SELECT @dinamicSystemsCount = COUNT(*), @dinamicSystemsCompanyId = MIN(id)
FROM dbo.companies
WHERE name = N'Dinamic Systems';

IF @dinamicSystemsCount <> 1
BEGIN
    THROW 51000, N'Backfill 144 requires exactly one Dinamic Systems company.', 1;
END;

SELECT @carrefourClientCount = COUNT(*), @carrefourClientId = MIN(id)
FROM dbo.clients
WHERE company_id = @dinamicSystemsCompanyId
  AND normalized_name = N'carrefour';

IF @carrefourClientCount = 0
BEGIN
    PRINT N'Backfill 144 skipped: Carrefour client does not yet exist in Dinamic Systems.';
END;
ELSE IF @carrefourClientCount <> 1
BEGIN
    THROW 51001, N'Backfill 144 requires at most one Carrefour client in Dinamic Systems.', 1;
END;
ELSE
BEGIN
    UPDATE dbo.company_location_types
    SET client_id = @carrefourClientId
    WHERE company_id = @dinamicSystemsCompanyId
      AND client_id IS NULL;

    SET @affectedRows = @@ROWCOUNT;
    PRINT N'Backfill 144 assigned ' + CAST(@affectedRows AS NVARCHAR(20)) + N' legacy format(s) to Dinamic Systems / Carrefour.';
END;
