-- Post-backfill validation for multi-company migration (idempotent safety check).
-- Throws with a clear table name if any operational row lacks company_id.

USE dinamic_attendance;
GO

IF EXISTS (SELECT 1 FROM employees WHERE company_id IS NULL)
    THROW 51000, 'employees has rows without company_id after backfill', 1;
GO

IF EXISTS (SELECT 1 FROM stores WHERE company_id IS NULL)
    THROW 51000, 'stores has rows without company_id after backfill', 1;
GO

IF EXISTS (SELECT 1 FROM inventories WHERE company_id IS NULL)
    THROW 51000, 'inventories has rows without company_id after backfill', 1;
GO

IF EXISTS (SELECT 1 FROM inventory_employees WHERE company_id IS NULL)
    THROW 51000, 'inventory_employees has rows without company_id after backfill', 1;
GO

IF EXISTS (SELECT 1 FROM attendance_records WHERE company_id IS NULL)
    THROW 51000, 'attendance_records has rows without company_id after backfill', 1;
GO

IF EXISTS (SELECT 1 FROM attendance_reviews WHERE company_id IS NULL)
    THROW 51000, 'attendance_reviews has rows without company_id after backfill', 1;
GO

IF EXISTS (SELECT 1 FROM whatsapp_attendance_notifications WHERE company_id IS NULL)
    THROW 51000, 'whatsapp_attendance_notifications has rows without company_id after backfill', 1;
GO

IF EXISTS (SELECT 1 FROM bot_sessions WHERE company_id IS NULL)
    THROW 51000, 'bot_sessions has rows without company_id after backfill', 1;
GO

IF EXISTS (SELECT 1 FROM bot_simulation_sessions WHERE company_id IS NULL)
    THROW 51000, 'bot_simulation_sessions has rows without company_id after backfill', 1;
GO

IF EXISTS (SELECT 1 FROM absence_types WHERE company_id IS NULL)
    THROW 51000, 'absence_types has rows without company_id after backfill', 1;
GO

IF EXISTS (SELECT 1 FROM absence_requests WHERE company_id IS NULL)
    THROW 51000, 'absence_requests has rows without company_id after backfill', 1;
GO

IF EXISTS (SELECT 1 FROM absence_request_events WHERE company_id IS NULL)
    THROW 51000, 'absence_request_events has rows without company_id after backfill', 1;
GO

IF EXISTS (SELECT 1 FROM employee_absence_balances WHERE company_id IS NULL)
    THROW 51000, 'employee_absence_balances has rows without company_id after backfill', 1;
GO

IF EXISTS (SELECT 1 FROM whatsapp_messages WHERE company_id IS NULL)
    THROW 51000, 'whatsapp_messages has rows without company_id after backfill', 1;
GO

IF EXISTS (SELECT 1 FROM audit_logs WHERE company_id IS NULL)
    THROW 51000, 'audit_logs has rows without company_id after backfill', 1;
GO
