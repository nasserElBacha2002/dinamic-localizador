/*
  Migration: 124_whatsapp_turn_classification_corrections.sql

  Corrective follow-up to 123 (Phase 1 review):
  - Expand system interaction lifecycle statuses (PREPARED / send outcomes)
  - Add causation_message_sid on turn classifications (payroll docs ↔ inbound turn)
  - Do not modify 123 history.

  FK policy (intentional, same as other WhatsApp telemetry tables):
  - No FK to companies/employees/operations: retention and company deletion must not
    cascade-block shadow rows; company_id/employee_id are soft references.
  - Integrity is enforced by application source_key uniqueness + status CHECK.

  Rollback: rollback/124_whatsapp_turn_classification_corrections_rollback.sql
  WARNING: rollback drops causation data; requires no PREPARED/SEND_* rows.
*/

USE dinamic_attendance;
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

    ALTER TABLE dbo.whatsapp_system_interactions
        ADD CONSTRAINT CK_whatsapp_system_interactions_status
            CHECK (status IN (
                N'PREPARED',
                N'ACTIVE',
                N'SEND_FAILED',
                N'SEND_AMBIGUOUS',
                N'CONSUMED',
                N'EXPIRED',
                N'CANCELLED'
            ));
END;
GO

IF OBJECT_ID(N'dbo.whatsapp_turn_classifications', N'U') IS NOT NULL
   AND COL_LENGTH(N'dbo.whatsapp_turn_classifications', N'causation_message_sid') IS NULL
BEGIN
    ALTER TABLE dbo.whatsapp_turn_classifications
        ADD causation_message_sid NVARCHAR(64) NULL;
END;
GO

IF OBJECT_ID(N'dbo.whatsapp_turn_classifications', N'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_whatsapp_turn_classifications_causation'
          AND object_id = OBJECT_ID(N'dbo.whatsapp_turn_classifications')
   )
BEGIN
    CREATE INDEX IX_whatsapp_turn_classifications_causation
        ON dbo.whatsapp_turn_classifications (company_id, causation_message_sid)
        WHERE causation_message_sid IS NOT NULL;
END;
GO

/*
  --- Preflight / post-apply verification (run manually on target DB) ---
  Expect: tables, status CHECK with PREPARED, causation column, indexes, unique keys.

  SELECT DB_NAME() AS db_name; -- must be dinamic_attendance (or env target)

  SELECT OBJECT_ID(N'dbo.whatsapp_system_interactions', N'U') AS system_interactions_oid,
         OBJECT_ID(N'dbo.whatsapp_turn_classifications', N'U') AS turn_classifications_oid;

  SELECT name FROM sys.check_constraints
  WHERE parent_object_id = OBJECT_ID(N'dbo.whatsapp_system_interactions')
    AND name = N'CK_whatsapp_system_interactions_status';

  SELECT COL_LENGTH(N'dbo.whatsapp_turn_classifications', N'causation_message_sid') AS causation_len;

  SELECT name FROM sys.indexes
  WHERE object_id = OBJECT_ID(N'dbo.whatsapp_system_interactions')
    AND name IN (
      N'IX_whatsapp_system_interactions_active_lookup',
      N'IX_whatsapp_system_interactions_provider_sid'
    );

  SELECT name FROM sys.indexes
  WHERE object_id = OBJECT_ID(N'dbo.whatsapp_turn_classifications')
    AND name IN (
      N'IX_whatsapp_turn_classifications_company_classified',
      N'IX_whatsapp_turn_classifications_causation'
    );

  SELECT name FROM sys.key_constraints
  WHERE parent_object_id IN (
      OBJECT_ID(N'dbo.whatsapp_system_interactions'),
      OBJECT_ID(N'dbo.whatsapp_turn_classifications')
    )
    AND name IN (
      N'UQ_whatsapp_system_interactions_source',
      N'UQ_whatsapp_turn_classifications_message_sid'
    );
*/
