/* DIN-473 round 2: tie candidate offers to coverage cycle */

IF COL_LENGTH(N'dbo.replacement_request_candidates', N'offer_version') IS NULL
  ALTER TABLE dbo.replacement_request_candidates
    ADD offer_version INT NOT NULL
    CONSTRAINT DF_replacement_candidates_offer_version DEFAULT 1;
GO

UPDATE c
SET c.offer_version = rr.request_version
FROM dbo.replacement_request_candidates c
JOIN dbo.replacement_requests rr
  ON rr.company_id = c.company_id AND rr.id = c.request_id;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_replacement_candidates_request_offer_rank'
    AND object_id = OBJECT_ID(N'dbo.replacement_request_candidates')
)
  CREATE INDEX IX_replacement_candidates_request_offer_rank
    ON dbo.replacement_request_candidates(company_id, request_id, offer_version, rank)
    INCLUDE (status, employee_id);
GO