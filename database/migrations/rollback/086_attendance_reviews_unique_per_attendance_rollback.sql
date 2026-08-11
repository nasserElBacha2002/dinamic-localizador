/*
  Rollback: 086_attendance_reviews_unique_per_attendance_rollback.sql
  Restores non-unique IX_attendance_reviews_attendance_id.
*/

USE dinamic_attendance;
GO

IF EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'UQ_attendance_reviews_company_attendance'
      AND object_id = OBJECT_ID(N'dbo.attendance_reviews')
)
BEGIN
    DROP INDEX UQ_attendance_reviews_company_attendance ON dbo.attendance_reviews;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'IX_attendance_reviews_attendance_id'
      AND object_id = OBJECT_ID(N'dbo.attendance_reviews')
)
BEGIN
    CREATE INDEX IX_attendance_reviews_attendance_id
        ON dbo.attendance_reviews (attendance_id);
END;
GO
