import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { EmployeeForm } from "../../components/employees/EmployeeForm";
import { ErrorState } from "../../components/common/ErrorState";
import { FeedbackSnackbar } from "../../components/common/FeedbackSnackbar";
import { LoadingState } from "../../components/common/LoadingState";
import { PageHeader } from "../../components/common/PageHeader";
import { useEmployee, useUpdateEmployee } from "../../hooks/useEmployees";
import { AdminLayout } from "../../layouts/AdminLayout";
import type { EmployeeFormValues } from "../../schemas/employee.schema";
import { getApiErrorMessage } from "../../utils/errors";

export function EmployeeEditPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const employeeQuery = useEmployee(id);
  const updateMutation = useUpdateEmployee(id ?? "");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);

  if (!id) {
    return (
      <AdminLayout>
        <ErrorState message="Empleado no encontrado." />
      </AdminLayout>
    );
  }

  if (employeeQuery.isLoading) {
    return (
      <AdminLayout>
        <LoadingState />
      </AdminLayout>
    );
  }

  if (employeeQuery.isError || !employeeQuery.data) {
    return (
      <AdminLayout>
        <ErrorState message={getApiErrorMessage(employeeQuery.error, "Empleado no encontrado.")} />
      </AdminLayout>
    );
  }

  const employee = employeeQuery.data;

  const handleSubmit = async (values: EmployeeFormValues) => {
    setErrorMessage(null);

    try {
      await updateMutation.mutateAsync({
        name: values.name,
        documentNumber: values.documentNumber?.trim() ? values.documentNumber.trim() : null,
        phoneNumber: values.phoneNumber,
        active: values.active,
      });
      setSuccessOpen(true);
      navigate("/employees");
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  };

  return (
    <AdminLayout>
      <PageHeader title="Editar empleado" description={employee.name} />
      <EmployeeForm
        defaultValues={{
          name: employee.name,
          documentNumber: employee.documentNumber ?? "",
          phoneNumber: employee.phoneNumber,
          active: employee.active,
        }}
        submitLabel="Guardar cambios"
        cancelTo="/employees"
        loading={updateMutation.isPending}
        errorMessage={errorMessage}
        onSubmit={handleSubmit}
      />
      <FeedbackSnackbar
        open={successOpen}
        message="Empleado actualizado correctamente."
        onClose={() => setSuccessOpen(false)}
      />
    </AdminLayout>
  );
}
