/*
  Rollback: 123_whatsapp_turn_classification_rollback.sql
  Drops Phase 1 shadow classification tables.
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.whatsapp_turn_classifications', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.whatsapp_turn_classifications;
END;
GO

IF OBJECT_ID(N'dbo.whatsapp_system_interactions', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.whatsapp_system_interactions;
END;
GO
