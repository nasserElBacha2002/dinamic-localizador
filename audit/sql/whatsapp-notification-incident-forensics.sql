/*
  READ-ONLY forensics for WhatsApp notification incidents (Caso B).

  Purpose:
    Correlate attendance reminders, assignment notifications, outbound messages,
    and attendance records for a given employee / operation / time window.

  How to use:
    1. Set @employeeId / @operationId / @fromUtc / @toUtc below.
    2. Run against the production/staging DB with a read-only account.
    3. Interpret rows using the CASE labels in the SELECT (see comments at end).

  Does NOT modify data.
*/

USE dinamic_attendance;
GO

DECLARE @employeeId UNIQUEIDENTIFIER = NULL; -- e.g. 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
DECLARE @operationId UNIQUEIDENTIFIER = NULL; -- optional filter
DECLARE @fromUtc DATETIME2 = DATEADD(HOUR, -48, SYSUTCDATETIME());
DECLARE @toUtc DATETIME2 = SYSUTCDATETIME();

/* Optional phone filter when employee id is unknown (E.164 without whatsapp:). */
DECLARE @phoneNormalized NVARCHAR(32) = NULL; -- e.g. '+54911...'

;WITH attendance_notifs AS (
    SELECT
        wan.sent_at AS event_at,
        wan.created_at AS created_at,
        N'whatsapp_attendance_notifications' AS source_table,
        wan.notification_type AS notification_type,
        wan.schedule_version AS schedule_version,
        wan.status AS status,
        CAST(NULL AS NVARCHAR(64)) AS template_sid_runtime, -- Content SID is env-bound; see outbound messages
        wan.twilio_message_sid AS provider_message_sid,
        wan.attempt_count AS attempt,
        wan.operation_id AS operation_id,
        wan.employee_id AS employee_id,
        CAST(NULL AS UNIQUEIDENTIFIER) AS operation_assignment_id,
        wan.id AS notification_id,
        wan.error_message AS error_message
    FROM dbo.whatsapp_attendance_notifications wan
    WHERE (@employeeId IS NULL OR wan.employee_id = @employeeId)
      AND (@operationId IS NULL OR wan.operation_id = @operationId)
      AND COALESCE(wan.sent_at, wan.created_at) >= @fromUtc
      AND COALESCE(wan.sent_at, wan.created_at) < @toUtc
),
assignment_notifs AS (
    SELECT
        woan.sent_at AS event_at,
        woan.created_at AS created_at,
        N'whatsapp_operation_assignment_notifications' AS source_table,
        woan.notification_type AS notification_type,
        CAST(NULL AS INT) AS schedule_version,
        woan.status AS status,
        CAST(NULL AS NVARCHAR(64)) AS template_sid_runtime,
        woan.provider_message_sid AS provider_message_sid,
        woan.attempt_count AS attempt,
        woan.operation_id AS operation_id,
        woan.employee_id AS employee_id,
        woan.operation_assignment_id AS operation_assignment_id,
        woan.id AS notification_id,
        woan.last_error_message AS error_message
    FROM dbo.whatsapp_operation_assignment_notifications woan
    WHERE (@employeeId IS NULL OR woan.employee_id = @employeeId)
      AND (@operationId IS NULL OR woan.operation_id = @operationId)
      AND COALESCE(woan.sent_at, woan.created_at) >= @fromUtc
      AND COALESCE(woan.sent_at, woan.created_at) < @toUtc
),
outbound_messages AS (
    SELECT
        COALESCE(wm.sent_at, wm.created_at) AS event_at,
        wm.created_at AS created_at,
        N'whatsapp_messages' AS source_table,
        COALESCE(wm.template_name, wm.body) AS notification_type,
        CAST(NULL AS INT) AS schedule_version,
        COALESCE(wm.provider_status, wm.status) AS status,
        wm.template_sid AS template_sid_runtime,
        COALESCE(wm.provider_message_sid, wm.message_sid) AS provider_message_sid,
        CAST(NULL AS INT) AS attempt,
        CAST(NULL AS UNIQUEIDENTIFIER) AS operation_id,
        wm.employee_id AS employee_id,
        CAST(NULL AS UNIQUEIDENTIFIER) AS operation_assignment_id,
        wm.notification_id AS notification_id,
        wm.provider_error_message AS error_message
    FROM dbo.whatsapp_messages wm
    WHERE wm.direction = N'OUTBOUND'
      AND (@employeeId IS NULL OR wm.employee_id = @employeeId)
      AND COALESCE(wm.sent_at, wm.created_at) >= @fromUtc
      AND COALESCE(wm.sent_at, wm.created_at) < @toUtc
      AND (
            @phoneNormalized IS NULL
            OR wm.phone_to LIKE N'%' + @phoneNormalized + N'%'
            OR wm.phone_from LIKE N'%' + @phoneNormalized + N'%'
        )
),
attendance_rows AS (
    SELECT
        ar.received_at AS event_at,
        ar.created_at AS created_at,
        N'attendance_records' AS source_table,
        N'ATTENDANCE_RECORD' AS notification_type,
        CAST(NULL AS INT) AS schedule_version,
        ar.validation_status AS status,
        CAST(NULL AS NVARCHAR(64)) AS template_sid_runtime,
        ar.source_message_sid AS provider_message_sid,
        CAST(NULL AS INT) AS attempt,
        ar.operation_id AS operation_id,
        ar.employee_id AS employee_id,
        CAST(NULL AS UNIQUEIDENTIFIER) AS operation_assignment_id,
        ar.id AS notification_id,
        ar.validation_reason AS error_message
    FROM dbo.attendance_records ar
    WHERE (@employeeId IS NULL OR ar.employee_id = @employeeId)
      AND (@operationId IS NULL OR ar.operation_id = @operationId)
      AND ar.received_at >= @fromUtc
      AND ar.received_at < @toUtc
),
unified AS (
    SELECT * FROM attendance_notifs
    UNION ALL
    SELECT * FROM assignment_notifs
    UNION ALL
    SELECT * FROM outbound_messages
    UNION ALL
    SELECT * FROM attendance_rows
)
SELECT
    u.event_at,
    u.created_at,
    u.source_table,
    u.notification_type,
    u.schedule_version,
    u.status,
    u.template_sid_runtime,
    u.provider_message_sid,
    u.attempt,
    u.operation_id,
    u.employee_id,
    u.operation_assignment_id,
    u.notification_id,
    u.error_message,
    /* Duplicate provider SID across rows → investigate provider/retry. */
    COUNT(*) OVER (PARTITION BY u.provider_message_sid) AS same_provider_sid_row_count,
    /* Same attendance reminder key → potential true duplication. */
    COUNT(*) OVER (
        PARTITION BY
            CASE WHEN u.source_table = N'whatsapp_attendance_notifications'
                 THEN CONCAT(CONVERT(NVARCHAR(36), u.operation_id), N'|',
                             CONVERT(NVARCHAR(36), u.employee_id), N'|',
                             u.notification_type, N'|',
                             CONVERT(NVARCHAR(20), u.schedule_version))
                 ELSE NULL END
    ) AS same_attendance_reminder_key_count
FROM unified u
ORDER BY COALESCE(u.event_at, u.created_at), u.source_table, u.notification_type;
GO

/*
  Interpretation guide (Caso B):

  Caso 1 — ARRIVAL + ARRIVAL same operation/employee/schedule_version
           → potencial duplicación real del mismo reminder.

  Caso 2 — ARRIVAL + ATTENDANCE_CONFIRMATION_REMINDER
           → eventos distintos (no asumir doble reminder).

  Caso 3 — ARRIVAL + EVENTUAL_OPERATION_ASSIGNED
           → eventos distintos (job vs assignment worker).

  Caso 4 — dos filas con el mismo provider_message_sid
           → investigar provider/retry / observability link.

  Caso 5 — dos provider_message_sid distintos
           → dos sends reales al provider.

  Content SID runtime for attendance reminders is primarily in env + logs
  (WHATSAPP_NOTIFICATION_SENT). Outbound whatsapp_messages.template_sid is the
  best DB correlate when observability link succeeded.
*/
