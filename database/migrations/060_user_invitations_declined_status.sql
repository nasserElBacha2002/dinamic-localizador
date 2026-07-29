-- Allow invitees to decline invitations (distinct from admin revoke).
--
-- Rollback:
--   UPDATE user_invitations SET status = 'REVOKED' WHERE status = 'DECLINED';
--   ALTER TABLE user_invitations DROP CONSTRAINT CK_user_invitations_status;
--   ALTER TABLE user_invitations ADD CONSTRAINT CK_user_invitations_status
--     CHECK (status IN ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED'));

USE dinamic_attendance;
GO

IF EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = 'CK_user_invitations_status'
      AND parent_object_id = OBJECT_ID('user_invitations')
)
BEGIN
    ALTER TABLE user_invitations DROP CONSTRAINT CK_user_invitations_status;
END;
GO

ALTER TABLE user_invitations
    ADD CONSTRAINT CK_user_invitations_status CHECK (
        status IN ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED', 'DECLINED')
    );
GO
