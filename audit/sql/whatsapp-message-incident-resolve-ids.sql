/*
  READ-ONLY helper — resolve Formosa / Nasser incident IDs on PRODUCTION,
  then feed into whatsapp-notification-incident-forensics.sql.

  Do NOT run UPDATE/DELETE/INSERT.
*/

USE dinamic_attendance;
GO

/* ---- 1) Resolve location / operation by serviceRef fragments ---- */
SELECT TOP 50
    l.id AS location_id,
    l.company_id,
    l.name,
    l.address,
    l.locality,
    o.id AS operation_id,
    o.scheduled_start,
    o.scheduled_end,
    o.status,
    o.operation_kind
FROM dbo.operational_locations l
INNER JOIN dbo.scheduled_operations o
    ON o.service_id = l.id AND o.company_id = l.company_id
WHERE (
        l.name LIKE N'%Formosa%'
        OR l.name LIKE N'%Tienda Formosa%'
        OR l.address LIKE N'%Formosa%'
      )
  AND o.scheduled_start >= '2026-08-24T00:00:00.000Z'
  AND o.scheduled_start <  '2026-08-25T06:00:00.000Z'  -- covers 20:00 ART ≈ 23:00 UTC
ORDER BY o.scheduled_start;
GO

/* ---- 2) Resolve employee ---- */
SELECT TOP 20
    e.id AS employee_id,
    e.company_id,
    e.name,
    LEFT(e.phone_number, 6) + N'***' AS phone_masked
FROM dbo.employees e
WHERE e.name LIKE N'%Nasser%'
   OR e.name LIKE N'%El Bacha%'
   OR e.name LIKE N'%Bacha%';
GO

/* ---- 3) Assignments for candidate operation+employee (fill IDs) ---- */
/*
DECLARE @operationId UNIQUEIDENTIFIER = '...';
DECLARE @employeeId  UNIQUEIDENTIFIER = '...';

SELECT
    oa.id AS operation_assignment_id,
    oa.operation_id,
    oa.employee_id,
    oa.confirmation_status,
    oa.confirmation_schedule_version,
    oa.assigned_at,
    o.scheduled_start
FROM dbo.operation_assignments oa
INNER JOIN dbo.scheduled_operations o
    ON o.id = oa.operation_id AND o.company_id = oa.company_id
WHERE oa.operation_id = @operationId
  AND oa.employee_id = @employeeId;
*/

/* ---- 4) Then run forensics.sql with:
     @employeeId = <resolved>
     @operationId = <resolved>
     @fromUtc = scheduledStart - 48h
     @toUtc   = scheduledStart + 1h
*/
GO
