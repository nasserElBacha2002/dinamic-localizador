-- Invitation token versioning + public delivery error codes.
-- Additive. Keeps last_email_error for internal diagnostics (never expose via API).
--
-- Rollback (manual, only if no dependency on new columns):
--   ALTER TABLE user_invitations DROP COLUMN token_version;
--   ALTER TABLE user_invitations DROP COLUMN last_email_error_code;
-- Do not drop user_invitations or revoke live invitations in production.

USE dinamic_attendance;
GO

IF COL_LENGTH('user_invitations', 'token_version') IS NULL
BEGIN
    ALTER TABLE user_invitations
        ADD token_version INT NOT NULL
            CONSTRAINT DF_user_invitations_token_version DEFAULT 1;
END;
GO

IF COL_LENGTH('user_invitations', 'last_email_error_code') IS NULL
BEGIN
    ALTER TABLE user_invitations
        ADD last_email_error_code NVARCHAR(80) NULL;
END;
GO
