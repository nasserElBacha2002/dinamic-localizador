/*
  Migration: 132_attendance_notification_employee_workday_uq.sql

  Phase 3: reminder idempotency per employee_workday (shift-aware).
  Atomic DDL: drop legacy UQ and create filtered UQs in one transaction so a
  partial failure cannot leave NULL-EW rows without uniqueness.

  Rollback: rollback/132_attendance_notification_employee_workday_uq_rollback.sql
*/

USE dinamic_attendance;
GO

SET XACT_ABORT ON;
GO

IF OBJECT_ID(N'dbo.whatsapp_attendance_notifications', N'U') IS NULL
BEGIN
    THROW 50132, 'Precondition failed: whatsapp_attendance_notifications missing', 1;
END;
GO

BEGIN TRY
    BEGIN TRANSACTION;

    IF COL_LENGTH(N'dbo.whatsapp_attendance_notifications', N'employee_workday_id') IS NULL
    BEGIN
        ALTER TABLE dbo.whatsapp_attendance_notifications
            ADD employee_workday_id UNIQUEIDENTIFIER NULL;
    END;

    IF NOT EXISTS (
        SELECT 1 FROM sys.foreign_keys
        WHERE name = N'FK_whatsapp_attendance_notifications_employee_workday_tenant'
          AND parent_object_id = OBJECT_ID(N'dbo.whatsapp_attendance_notifications')
    )
    AND COL_LENGTH(N'dbo.whatsapp_attendance_notifications', N'employee_workday_id') IS NOT NULL
    AND OBJECT_ID(N'dbo.employee_workdays', N'U') IS NOT NULL
    BEGIN
        ALTER TABLE dbo.whatsapp_attendance_notifications
            ADD CONSTRAINT FK_whatsapp_attendance_notifications_employee_workday_tenant
                FOREIGN KEY (company_id, employee_workday_id)
                REFERENCES dbo.employee_workdays (company_id, id);
    END
    ELSE IF EXISTS (
        SELECT 1 FROM sys.foreign_keys
        WHERE name = N'FK_whatsapp_attendance_notifications_employee_workday_tenant'
          AND parent_object_id = OBJECT_ID(N'dbo.whatsapp_attendance_notifications')
    )
    BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM sys.foreign_keys fk
            INNER JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
            INNER JOIN sys.columns pc ON pc.object_id = fkc.parent_object_id AND pc.column_id = fkc.parent_column_id
            INNER JOIN sys.columns rc ON rc.object_id = fkc.referenced_object_id AND rc.column_id = fkc.referenced_column_id
            WHERE fk.name = N'FK_whatsapp_attendance_notifications_employee_workday_tenant'
            GROUP BY fk.object_id
            HAVING COUNT(*) = 2
               AND MAX(CASE WHEN pc.name = N'company_id' AND rc.name = N'company_id' THEN 1 ELSE 0 END) = 1
               AND MAX(CASE WHEN pc.name = N'employee_workday_id' AND rc.name = N'id' THEN 1 ELSE 0 END) = 1
        )
        BEGIN
            THROW 50132, 'Incompatible FK_whatsapp_attendance_notifications_employee_workday_tenant definition', 1;
        END;
    END;

    IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_whatsapp_attendance_notifications_employee_workday'
          AND object_id = OBJECT_ID(N'dbo.whatsapp_attendance_notifications')
    )
    BEGIN
        CREATE INDEX IX_whatsapp_attendance_notifications_employee_workday
            ON dbo.whatsapp_attendance_notifications (company_id, employee_workday_id)
            WHERE employee_workday_id IS NOT NULL;
    END;

    IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'UQ_whatsapp_attendance_notifications_ew_type_version'
          AND object_id = OBJECT_ID(N'dbo.whatsapp_attendance_notifications')
    )
    BEGIN
        CREATE UNIQUE INDEX UQ_whatsapp_attendance_notifications_ew_type_version
            ON dbo.whatsapp_attendance_notifications (employee_workday_id, notification_type, schedule_version)
            WHERE employee_workday_id IS NOT NULL;
    END
    ELSE
    BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM sys.indexes i
            INNER JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
            INNER JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
            WHERE i.name = N'UQ_whatsapp_attendance_notifications_ew_type_version'
              AND i.object_id = OBJECT_ID(N'dbo.whatsapp_attendance_notifications')
              AND i.is_unique = 1
              AND i.has_filter = 1
              AND i.filter_definition LIKE N'%employee_workday_id%IS NOT NULL%'
            GROUP BY i.object_id, i.index_id
            HAVING COUNT(*) = 3
               AND MAX(CASE WHEN ic.key_ordinal = 1 AND c.name = N'employee_workday_id' THEN 1 ELSE 0 END) = 1
               AND MAX(CASE WHEN ic.key_ordinal = 2 AND c.name = N'notification_type' THEN 1 ELSE 0 END) = 1
               AND MAX(CASE WHEN ic.key_ordinal = 3 AND c.name = N'schedule_version' THEN 1 ELSE 0 END) = 1
        )
        BEGIN
            THROW 50132, 'Incompatible UQ_whatsapp_attendance_notifications_ew_type_version definition', 1;
        END;
    END;

    /* Drop legacy UQs only after EW UQ exists; recreate null-EW UQ in same TX.
       Some DBs still carry the pre-rename inventory_* index name from migration 031. */
    IF EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'UQ_whatsapp_attendance_notifications_operation_employee_type_version'
          AND object_id = OBJECT_ID(N'dbo.whatsapp_attendance_notifications')
    )
    BEGIN
        DROP INDEX UQ_whatsapp_attendance_notifications_operation_employee_type_version
            ON dbo.whatsapp_attendance_notifications;
    END;

    IF EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'UQ_whatsapp_attendance_notifications_inventory_employee_type_version'
          AND object_id = OBJECT_ID(N'dbo.whatsapp_attendance_notifications')
    )
    BEGIN
        DROP INDEX UQ_whatsapp_attendance_notifications_inventory_employee_type_version
            ON dbo.whatsapp_attendance_notifications;
    END;

    IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'UQ_whatsapp_attendance_notifications_op_emp_type_version_null_ew'
          AND object_id = OBJECT_ID(N'dbo.whatsapp_attendance_notifications')
    )
    BEGIN
        CREATE UNIQUE INDEX UQ_whatsapp_attendance_notifications_op_emp_type_version_null_ew
            ON dbo.whatsapp_attendance_notifications (operation_id, employee_id, notification_type, schedule_version)
            WHERE employee_workday_id IS NULL;
    END
    ELSE
    BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM sys.indexes i
            INNER JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
            INNER JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
            WHERE i.name = N'UQ_whatsapp_attendance_notifications_op_emp_type_version_null_ew'
              AND i.object_id = OBJECT_ID(N'dbo.whatsapp_attendance_notifications')
              AND i.is_unique = 1
              AND i.has_filter = 1
              AND i.filter_definition LIKE N'%employee_workday_id%IS NULL%'
            GROUP BY i.object_id, i.index_id
            HAVING COUNT(*) = 4
               AND MAX(CASE WHEN ic.key_ordinal = 1 AND c.name = N'operation_id' THEN 1 ELSE 0 END) = 1
               AND MAX(CASE WHEN ic.key_ordinal = 2 AND c.name = N'employee_id' THEN 1 ELSE 0 END) = 1
               AND MAX(CASE WHEN ic.key_ordinal = 3 AND c.name = N'notification_type' THEN 1 ELSE 0 END) = 1
               AND MAX(CASE WHEN ic.key_ordinal = 4 AND c.name = N'schedule_version' THEN 1 ELSE 0 END) = 1
        )
        BEGIN
            THROW 50132, 'Incompatible UQ_whatsapp_attendance_notifications_op_emp_type_version_null_ew definition', 1;
        END;
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
