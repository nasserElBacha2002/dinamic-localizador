/*
  Rollback: 124_whatsapp_turn_classification_corrections_rollback.sql

  WARNING: Dropping causation_message_sid loses that column's data.
  Restores status CHECK to 123 set (may fail if PREPARED/SEND_* rows exist —
  cancel or migrate those rows before rollback).
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.whatsapp_turn_classifications', N'U') IS NOT NULL
   AND EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_whatsapp_turn_classifications_causation'
          AND object_id = OBJECT_ID(N'dbo.whatsapp_turn_classifications')
   )
BEGIN
    DROP INDEX IX_whatsapp_turn_classifications_causation
        ON dbo.whatsapp_turn_classifications;
END;
GO

IF OBJECT_ID(N'dbo.whatsapp_turn_classifications', N'U') IS NOT NULL
   AND COL_LENGTH(N'dbo.whatsapp_turn_classifications', N'causation_message_sid') IS NOT NULL
BEGIN
    ALTER TABLE dbo.whatsapp_turn_classifications
        DROP COLUMN causation_message_sid;
END;
GO

IF OBJECT_ID(N'dbo.whatsapp_system_interactions', N'U') IS NOT NULL
BEGIN
    IF EXISTS (
        SELECT 1 FROM sys.check_constraints
        WHERE name = N'CK_whatsapp_system_interactions_status'
          AND parent_object_id = OBJECT_ID(N'dbo.whatsapp_system_interactions')
    )
    BEGIN
        ALTER TABLE dbo.whatsapp_system_interactions
            DROP CONSTRAINT CK_whatsapp_system_interactions_status;
    END;

    -- Require no PREPARED/SEND_* rows before restoring 123 CHECK.
    ALTER TABLE dbo.whatsapp_system_interactions
        ADD CONSTRAINT CK_whatsapp_system_interactions_status
            CHECK (status IN (N'ACTIVE', N'CONSUMED', N'EXPIRED', N'CANCELLED'));
END;
GO
