-- Distributed rate-limit buckets (shared across API replicas).
IF OBJECT_ID(N'dbo.rate_limit_buckets', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.rate_limit_buckets (
    bucket_key NVARCHAR(300) NOT NULL CONSTRAINT PK_rate_limit_buckets PRIMARY KEY,
    window_start_utc DATETIME2 NOT NULL,
    hit_count INT NOT NULL CONSTRAINT CK_rate_limit_buckets_hit_count CHECK (hit_count >= 0),
    expires_at_utc DATETIME2 NOT NULL,
    updated_at_utc DATETIME2 NOT NULL CONSTRAINT DF_rate_limit_buckets_updated DEFAULT (SYSUTCDATETIME())
  );

  CREATE INDEX IX_rate_limit_buckets_expires_at
    ON dbo.rate_limit_buckets (expires_at_utc);
END;
GO
