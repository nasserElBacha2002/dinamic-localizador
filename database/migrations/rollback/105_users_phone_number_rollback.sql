-- Rollback 105: drop users.phone_number (only if unused by app after rollback).

IF COL_LENGTH(N'dbo.users', N'phone_number') IS NOT NULL
BEGIN
    ALTER TABLE dbo.users
        DROP COLUMN phone_number;
END;
GO
