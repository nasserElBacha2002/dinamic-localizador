import { useMemo, useState } from "react";
import { Alert } from "@mantine/core";
import { OperationForm } from "../../components/operations/OperationForm";
import { LoadingState, PageHeader } from "../../design-system";
import { useCompanySettingsForOperationCreate } from "../../hooks/useCompanySettings";
import { useListBackNavigation } from "../../hooks/useListBackNavigation";
import { useCreateOperation } from "../../hooks/useOperations";
import type { OperationFormValues } from "../../schemas/operation.schema";
import { datetimeLocalToIso } from "../../utils/dates";
import { terminology } from "../../domain/terminology";
import { getApiErrorMessage } from "../../utils/errors";
import { buildOperationCreateDefaultValues } from "../../utils/operation-create-defaults";

export function OperationCreatePage() {
  const { goBackToList } = useListBackNavigation("/operations");
  const createMutation = useCreateOperation();
  const {
    data: companySettings,
    isPending: settingsPending,
    isFetching: settingsFetching,
    isSuccess: settingsLoaded,
    isError: settingsError,
  } = useCompanySettingsForOperationCreate();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const defaultValues = useMemo<OperationFormValues | null>(() => {
    if (!companySettings) {
      return null;
    }

    return buildOperationCreateDefaultValues(companySettings);
  }, [companySettings]);

  const handleSubmit = async (values: OperationFormValues) => {
    setErrorMessage(null);

    try {
      await createMutation.mutateAsync({
        serviceId: values.serviceId,
        scheduledStart: datetimeLocalToIso(values.scheduledStart),
        scheduledEnd: values.scheduledEnd ? datetimeLocalToIso(values.scheduledEnd) : null,
        ...(settingsLoaded
          ? {
              earlyToleranceMinutes: values.earlyToleranceMinutes,
              lateToleranceMinutes: values.lateToleranceMinutes,
            }
          : {}),
        notes: values.notes?.trim() ? values.notes.trim() : null,
      });
      goBackToList();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  };

  const settingsReady = settingsLoaded && Boolean(companySettings) && !settingsFetching;

  if (settingsPending || settingsFetching || !settingsReady) {
    return (
      <>
        <PageHeader
          title={`Nueva ${terminology.operation.singular.toLowerCase()}`}
          description={`Programá una ${terminology.operation.singular.toLowerCase()}.`}
        />
        <LoadingState />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={`Nueva ${terminology.operation.singular.toLowerCase()}`}
        description={`Programá una ${terminology.operation.singular.toLowerCase()}.`}
      />
      {settingsError ? (
        <Alert color="yellow" variant="light" mb="md">
          No se pudieron cargar los valores por defecto de la empresa. El servidor aplicará la
          configuración de operaciones al crear la operación.
        </Alert>
      ) : null}
      {defaultValues ? (
        <OperationForm
          key={`settings-${companySettings?.updatedAt}-${defaultValues.earlyToleranceMinutes}-${defaultValues.lateToleranceMinutes}`}
          mode="create"
          defaultValues={defaultValues}
          submitLabel={`Crear ${terminology.operation.singular.toLowerCase()}`}
          cancelTo="/operations"
          onCancel={goBackToList}
          loading={createMutation.isPending}
          errorMessage={errorMessage}
          onSubmit={handleSubmit}
        />
      ) : (
        <Alert color="red" variant="light">
          No se pudo inicializar el formulario sin la configuración de la empresa.
        </Alert>
      )}
    </>
  );
}
