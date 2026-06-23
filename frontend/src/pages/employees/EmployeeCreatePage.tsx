import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { EmployeeForm } from "../../components/employees/EmployeeForm";
import { PageHeader } from "../../components/common/PageHeader";
import { useCreateEmployee } from "../../hooks/useEmployees";
import { AdminLayout } from "../../layouts/AdminLayout";
import type { EmployeeFormValues } from "../../schemas/employee.schema";
import { getApiErrorMessage } from "../../utils/errors";

export function EmployeeCreatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const createMutation = useCreateEmployee();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const defaultName = useMemo(() => searchParams.get("name")?.trim() ?? "", [searchParams]);

  const handleSubmit = async (values: EmployeeFormValues) => {
    setErrorMessage(null);

    try {
      const employee = await createMutation.mutateAsync({
        name: values.name,
        documentNumber: values.documentNumber?.trim() ? values.documentNumber.trim() : null,
        phoneNumber: values.phoneNumber,
        employeeType: values.employeeType,
      });
      navigate(`/employees/${employee.id}`);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  };

  return (
    <AdminLayout>
      <PageHeader title="Nuevo empleado" description="Registrá un empleado habilitado para inventarios." />
      <EmployeeForm
        defaultValues={{ name: defaultName, documentNumber: "", phoneNumber: "", employeeType: "", active: true }}
        submitLabel="Crear empleado"
        cancelTo="/employees"
        loading={createMutation.isPending}
        errorMessage={errorMessage}
        onSubmit={handleSubmit}
      />
    </AdminLayout>
  );
}
