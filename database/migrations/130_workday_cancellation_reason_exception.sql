/*
  Migration: 130_workday_cancellation_reason_exception.sql

  Phase 2 — allow EXCEPTION cancellation provenance for shift date exceptions.
  Extends CK_operation_workdays_cancellation_reason and
  CK_employee_workdays_cancellation_reason.

  Rollback: rollback/130_workday_cancellation_reason_exception_rollback.sql
*/

USE dinamic_attendance;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_operation_workdays_cancellation_reason'
      AND parent_object_id = OBJECT_ID(N'dbo.operation_workdays')
)
BEGIN
    ALTER TABLE dbo.operation_workdays DROP CONSTRAINT CK_operation_workdays_cancellation_reason;
END;
GO

ALTER TABLE dbo.operation_workdays
    ADD CONSTRAINT CK_operation_workdays_cancellation_reason
    CHECK (
        cancellation_reason IS NULL
        OR cancellation_reason IN (N'SCHEDULE', N'OPERATION', N'EXCEPTION')
    );
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_employee_workdays_cancellation_reason'
      AND parent_object_id = OBJECT_ID(N'dbo.employee_workdays')
)
BEGIN
    ALTER TABLE dbo.employee_workdays DROP CONSTRAINT CK_employee_workdays_cancellation_reason;
END;
GO

ALTER TABLE dbo.employee_workdays
    ADD CONSTRAINT CK_employee_workdays_cancellation_reason
    CHECK (
        cancellation_reason IS NULL
        OR cancellation_reason IN (N'ASSIGNMENT', N'SCHEDULE', N'OPERATION', N'EXCEPTION')
    );
GO
