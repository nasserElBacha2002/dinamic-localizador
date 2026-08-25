-- 105: WhatsApp contact phone on platform users (admin alert recipients).
-- Nullable: existing users until an authorized editor sets E.164.

IF COL_LENGTH(N'dbo.users', N'phone_number') IS NULL
BEGIN
    ALTER TABLE dbo.users
        ADD phone_number NVARCHAR(20) NULL;
END;
GO
