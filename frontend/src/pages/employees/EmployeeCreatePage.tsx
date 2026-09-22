import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { EmployeeForm } from "../../components/employees/EmployeeForm";
import { PageHeader } from "../../design-system";
import { useListBackNavigation } from "../../hooks/useListBackNavigation";
import { useCreateEmployee, useReplaceEmployeeClients } from "../../hooks/useEmployees";
import type { EmployeeFormValues } from "../../schemas/employee.schema";
import { terminology } from "../../domain/terminology";
import { getApiErrorMessage } from "../../utils/errors";

export function EmployeeCreatePage() {
  const { goBackToList } = useListBackNavigation("/employees");
  const [searchParams] = useSearchParams();
  const createMutation = useCreateEmployee();
  const replaceClientsMutation = useReplaceEmployeeClients();
  const [savingClients, setSavingClients] = useState(false);
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
        categoryId: values.categoryId ?? null,
        locationZoneId: values.locationZoneId ?? null,
      });
      if (values.clientIds.length > 0) {
        setSavingClients(true);
        await replaceClientsMutation.mutateAsync(values.clientIds, employee.id);
      }
      goBackToList();
    } catch (error) {
      setErrorMessage(
        createMutation.isSuccess
          ? `El colaborador fue creado, pero no se pudieron guardar sus clientes: ${getApiErrorMessage(error)}`
          : getApiErrorMessage(error),
      );
    } finally {
      setSavingClients(false);
    }
  };

  return (
    <>
      <PageHeader
        title={`Nuevo ${terminology.worker.singular.toLowerCase()}`}
        description={`Registrá un ${terminology.worker.singular.toLowerCase()} habilitado para ${terminology.operation.plural.toLowerCase()}.`}
      />
      <EmployeeForm
        defaultValues={{
          name: defaultName,
          documentNumber: "",
          phoneNumber: "",
          employeeType: "",
          categoryId: null,
          locationZoneId: null,
          active: true,
          clientIds: [],
        }}
        submitLabel={`Crear ${terminology.worker.singular.toLowerCase()}`}
        cancelTo="/employees"
        onCancel={goBackToList}
        loading={createMutation.isPending || replaceClientsMutation.isPending || savingClients}
        errorMessage={errorMessage}
        onSubmit={handleSubmit}
      />
    </>
  );
}
