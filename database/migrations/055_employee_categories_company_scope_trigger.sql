-- Employee categories integrity: scope join guarantee for employees.category_id.
-- Additive for environments that already applied 054 without the trigger.
-- Rollback (manual): DROP TRIGGER TR_employees_category_company_scope.

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.TR_employees_category_company_scope', N'TR') IS NULL
BEGIN
    EXEC(N'
    CREATE TRIGGER dbo.TR_employees_category_company_scope
    ON dbo.employees
    AFTER INSERT, UPDATE
    AS
    BEGIN
        SET NOCOUNT ON;

        IF NOT EXISTS (SELECT 1 FROM inserted)
        BEGIN
            RETURN;
        END;

        IF EXISTS (
            SELECT 1
            FROM inserted i
            WHERE i.category_id IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1
                  FROM dbo.employee_categories ec
                  WHERE ec.id = i.category_id
                    AND (ec.company_id IS NULL OR ec.company_id = i.company_id)
              )
        )
        BEGIN
            THROW 50051, ''EMPLOYEE_CATEGORY_CROSS_COMPANY: category_id must be global or belong to the employee company.'', 1;
        END;
    END;
    ');
END;
GO
