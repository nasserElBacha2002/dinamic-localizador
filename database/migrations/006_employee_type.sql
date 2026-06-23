IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('employees')
      AND name = 'employee_type'
)
BEGIN
    ALTER TABLE employees
        ADD employee_type NVARCHAR(20) NOT NULL
        CONSTRAINT DF_employees_employee_type DEFAULT N'fijo';
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_employees_employee_type'
      AND parent_object_id = OBJECT_ID('employees')
)
BEGIN
    ALTER TABLE employees
        ADD CONSTRAINT CK_employees_employee_type
        CHECK (employee_type IN (N'fijo', N'eventual'));
END;
GO
