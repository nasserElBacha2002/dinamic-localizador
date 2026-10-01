-- =============================================================================
-- Manual index maintenance (EXPLICIT OPERATOR RUN ONLY — never from deploy)
-- =============================================================================
-- Rules:
--   - Ignore indexes with page_count < @minPages (default 1000)
--   - Prefer REORGANIZE for moderate fragmentation
--   - REBUILD only when fragmentation is high AND page_count is large
--   - NEVER SHRINK / NEVER AUTO_SHRINK
--   - Do not schedule permanently unless volume justifies it (~5k whatsapp_messages
--     with NEWID() PK fragmentation is architectural, not a rebuild loop)
--
-- This script PRINTS recommended commands by default (@execute = 0).
-- Set @execute = 1 only after reviewing the printed statements.
-- =============================================================================

SET NOCOUNT ON;

DECLARE @minPages INT = 1000;
DECLARE @reorganizePct FLOAT = 15.0;
DECLARE @rebuildPct FLOAT = 30.0;
DECLARE @execute BIT = 0; -- 0 = print only

DECLARE @schema SYSNAME;
DECLARE @table SYSNAME;
DECLARE @index SYSNAME;
DECLARE @frag FLOAT;
DECLARE @pages BIGINT;
DECLARE @sql NVARCHAR(MAX);

DECLARE cur CURSOR LOCAL FAST_FORWARD FOR
SELECT
  OBJECT_SCHEMA_NAME(ps.object_id),
  OBJECT_NAME(ps.object_id),
  i.name,
  ps.avg_fragmentation_in_percent,
  ps.page_count
FROM sys.dm_db_index_physical_stats(DB_ID(), NULL, NULL, NULL, N'SAMPLED') ps
INNER JOIN sys.indexes i
  ON i.object_id = ps.object_id AND i.index_id = ps.index_id
WHERE ps.index_id > 0
  AND i.name IS NOT NULL
  AND ps.page_count >= @minPages
  AND ps.avg_fragmentation_in_percent >= @reorganizePct
ORDER BY ps.page_count DESC;

OPEN cur;
FETCH NEXT FROM cur INTO @schema, @table, @index, @frag, @pages;

WHILE @@FETCH_STATUS = 0
BEGIN
  IF @frag >= @rebuildPct
    SET @sql = N'ALTER INDEX ' + QUOTENAME(@index)
      + N' ON ' + QUOTENAME(@schema) + N'.' + QUOTENAME(@table)
      + N' REBUILD; -- frag='
      + CONVERT(NVARCHAR(20), CAST(@frag AS DECIMAL(5,1)))
      + N'% pages=' + CONVERT(NVARCHAR(20), @pages)
      + N' (add WITH (ONLINE = ON) only on Enterprise/supported editions)';
  ELSE
    SET @sql = N'ALTER INDEX ' + QUOTENAME(@index)
      + N' ON ' + QUOTENAME(@schema) + N'.' + QUOTENAME(@table)
      + N' REORGANIZE; -- frag='
      + CONVERT(NVARCHAR(20), CAST(@frag AS DECIMAL(5,1)))
      + N'% pages=' + CONVERT(NVARCHAR(20), @pages);

  PRINT @sql;
  IF @execute = 1
    EXEC sys.sp_executesql @sql;

  FETCH NEXT FROM cur INTO @schema, @table, @index, @frag, @pages;
END;

CLOSE cur;
DEALLOCATE cur;

PRINT '-- Done. Small indexes skipped. whatsapp_messages PK fragmentation from NEWID() is not fixed by rebuild loops.';
