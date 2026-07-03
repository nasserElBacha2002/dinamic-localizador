import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { EmployeeForm } from "../../components/employees/EmployeeForm";
import { PageHeader } from "../../design-system";
import { useListBackNavigation } from "../../hooks/useListBackNavigation";
import { useCreateEmployee } from "../../hooks/useEmployees";
import type { EmployeeFormValues } from "../../schemas/employee.schema";
import { terminology } from "../../domain/terminology";
import { getApiErrorMessage } from "../../utils/errors";

export function EmployeeCreatePage() {
  const { goBackToList } = useListBackNavigation("/employees");
  const [searchParams] = useSearchParams();
  const createMutation = useCreateEmployee();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const defaultName = useMemo(() => searchParams.get("name")?.trim() ?? "", [searchParams]);

  const handleSubmit = async (values: EmployeeFormValues) => {
    setErrorMessage(null);

    try {
      await createMutation.mutateAsync({
        name: values.name,
        documentNumber: values.documentNumber?.trim() ? values.documentNumber.trim() : null,
        phoneNumber: values.phoneNumber,
        employeeType: values.employeeType,
      });
      goBackToList();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  };

  return (
    <>
      <PageHeader
        title={`Nuevo ${terminology.worker.singular.toLowerCase()}`}
        description={`Registrá un ${terminology.worker.singular.toLowerCase()} habilitado para ${terminology.operation.plural.toLowerCase()}.`}
      />
      <EmployeeForm
        defaultValues={{ name: defaultName, documentNumber: "", phoneNumber: "", employeeType: "", active: true }}
        submitLabel={`Crear ${terminology.worker.singular.toLowerCase()}`}
        cancelTo="/employees"
        onCancel={goBackToList}
        loading={createMutation.isPending}
        errorMessage={errorMessage}
        onSubmit={handleSubmit}
      />
    </>
  );
}
