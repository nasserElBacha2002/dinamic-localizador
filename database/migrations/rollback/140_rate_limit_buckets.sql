IF OBJECT_ID(N'dbo.rate_limit_buckets', N'U') IS NOT NULL
BEGIN
  DROP TABLE dbo.rate_limit_buckets;
END;
GO
