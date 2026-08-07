/*
  Migration: 086_attendance_reviews_unique_per_attendance.sql
  Purpose: Enforce at most one attendance_reviews row per (company_id, attendance_id)
           so concurrent reviewers cannot insert duplicate reviews (H2).
  Rollback: database/migrations/rollback/086_attendance_reviews_unique_per_attendance_rollback.sql
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.attendance_reviews', N'U') IS NULL
BEGIN
    THROW 50086, 'Precondition failed: attendance_reviews missing', 1;
END;
GO

-- Preflight: refuse to create unique index when historical duplicates exist.
IF EXISTS (
    SELECT 1
    FROM dbo.attendance_reviews
    GROUP BY company_id, attendance_id
    HAVING COUNT(*) > 1
)
BEGIN
    THROW 50086,
        'Cannot create UQ_attendance_reviews_company_attendance: duplicate (company_id, attendance_id) rows exist. Heal data before applying migration 086.',
        1;
END;
GO

IF EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'IX_attendance_reviews_attendance_id'
      AND object_id = OBJECT_ID(N'dbo.attendance_reviews')
)
BEGIN
    DROP INDEX IX_attendance_reviews_attendance_id ON dbo.attendance_reviews;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'UQ_attendance_reviews_company_attendance'
      AND object_id = OBJECT_ID(N'dbo.attendance_reviews')
)
BEGIN
    CREATE UNIQUE INDEX UQ_attendance_reviews_company_attendance
        ON dbo.attendance_reviews (company_id, attendance_id);
END;
GO
