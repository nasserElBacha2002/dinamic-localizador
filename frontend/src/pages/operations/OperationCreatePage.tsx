import { useMemo, useState } from "react";
import { Alert } from "@mantine/core";
import { useSearchParams } from "react-router";
import { OperationForm } from "../../components/operations/OperationForm";
import { LoadingState, PageHeader } from "../../design-system";
import { useCompanySettingsForOperationCreate } from "../../hooks/useCompanySettings";
import { useCompanyWorkSchedule } from "../../hooks/useCompanyWorkSchedule";
import { useListBackNavigation } from "../../hooks/useListBackNavigation";
import { useCreateOperation } from "../../hooks/useOperations";
import type { OperationFormValues } from "../../schemas/operation.schema";
import { terminology } from "../../domain/terminology";
import { getApiErrorMessage } from "../../utils/errors";
import { buildOperationCreateDefaultValues } from "../../utils/operation-create-defaults";
import { buildCreateOperationPayload } from "../../utils/operation-shift-payload";

export function OperationCreatePage() {
  const { goBackToList } = useListBackNavigation("/operations");
  const [searchParams] = useSearchParams();
  const createMutation = useCreateOperation();
  const {
    data: companySettings,
    isPending: settingsPending,
    isFetching: settingsFetching,
    isSuccess: settingsLoaded,
    isError: settingsError,
  } = useCompanySettingsForOperationCreate();
  const companyWorkScheduleQuery = useCompanyWorkSchedule(settingsLoaded);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const presetServiceId = useMemo(
    () => searchParams.get("serviceId")?.trim() ?? "",
    [searchParams],
  );

  const defaultValues = useMemo<OperationFormValues | null>(() => {
    if (!companySettings) {
      return null;
    }

    return buildOperationCreateDefaultValues(companySettings, {
      serviceId: presetServiceId,
    });
  }, [companySettings, presetServiceId]);

  const handleSubmit = async (values: OperationFormValues) => {
    setErrorMessage(null);

    try {
      await createMutation.mutateAsync(buildCreateOperationPayload(values));
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
          key={`settings-${companySettings?.updatedAt}-${defaultValues.earlyToleranceMinutes}-${defaultValues.lateToleranceMinutes}-${presetServiceId}`}
          mode="create"
          defaultValues={defaultValues}
          companyWorkSchedule={companyWorkScheduleQuery.data ?? null}
          companyWorkScheduleLoading={
            companyWorkScheduleQuery.isPending || companyWorkScheduleQuery.isFetching
          }
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
