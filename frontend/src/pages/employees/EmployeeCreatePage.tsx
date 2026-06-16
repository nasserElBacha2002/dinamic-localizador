import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { EmployeeForm } from "../../components/employees/EmployeeForm";
import { PageHeader } from "../../components/common/PageHeader";
import { useCreateEmployee } from "../../hooks/useEmployees";
import { AdminLayout } from "../../layouts/AdminLayout";
import type { EmployeeFormValues } from "../../schemas/employee.schema";
import { getApiErrorMessage } from "../../utils/errors";

export function EmployeeCreatePage() {
  const navigate = useNavigate();
  const createMutation = useCreateEmployee();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (values: EmployeeFormValues) => {
    setErrorMessage(null);

    try {
      const employee = await createMutation.mutateAsync({
        name: values.name,
        documentNumber: values.documentNumber?.trim() ? values.documentNumber.trim() : null,
        phoneNumber: values.phoneNumber,
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
        defaultValues={{ name: "", documentNumber: "", phoneNumber: "", active: true }}
        submitLabel="Crear empleado"
        cancelTo="/employees"
        loading={createMutation.isPending}
        errorMessage={errorMessage}
        onSubmit={handleSubmit}
      />
    </AdminLayout>
  );
}
