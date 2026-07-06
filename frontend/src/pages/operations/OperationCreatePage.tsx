import { useMemo, useState } from "react";
import { Alert } from "@mantine/core";
import { OperationForm } from "../../components/operations/OperationForm";
import { LoadingState, PageHeader } from "../../design-system";
import { useCompanySettingsForOperationCreate } from "../../hooks/useCompanySettings";
import { useCompanyWorkSchedule } from "../../hooks/useCompanyWorkSchedule";
import { useListBackNavigation } from "../../hooks/useListBackNavigation";
import { useCreateOperation } from "../../hooks/useOperations";
import type { OperationFormValues } from "../../schemas/operation.schema";
import type { CreateOperationInput } from "../../types/operation";
import type { WeeklyScheduleDay } from "../../types/schedule";
import { datetimeLocalToIso } from "../../utils/dates";
import { terminology } from "../../domain/terminology";
import { getApiErrorMessage } from "../../utils/errors";
import { buildOperationCreateDefaultValues } from "../../utils/operation-create-defaults";

function toCreatePayload(values: OperationFormValues, settingsLoaded: boolean): CreateOperationInput {
  const shared = {
    serviceId: values.serviceId,
    ...(settingsLoaded
      ? {
          earlyToleranceMinutes: values.earlyToleranceMinutes,
          lateToleranceMinutes: values.lateToleranceMinutes,
        }
      : {}),
    notes: values.notes?.trim() ? values.notes.trim() : null,
  };

  if (values.operationKind === "RECURRING") {
    return {
      operationKind: "RECURRING",
      ...shared,
      validFrom: values.validFrom,
      validUntil: values.validUntil?.trim() ? values.validUntil : null,
      scheduleSource: values.scheduleSource,
      ...(values.scheduleSource === "CUSTOM"
        ? { scheduleDays: values.scheduleDays as WeeklyScheduleDay[] }
        : {}),
    };
  }

  return {
    operationKind: "ONE_TIME",
    ...shared,
    scheduledStart: datetimeLocalToIso(values.scheduledStart),
    scheduledEnd: values.scheduledEnd ? datetimeLocalToIso(values.scheduledEnd) : null,
  };
}

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
  const companyWorkScheduleQuery = useCompanyWorkSchedule(settingsLoaded);
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
      await createMutation.mutateAsync(toCreatePayload(values, settingsLoaded));
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
          companyWorkSchedule={companyWorkScheduleQuery.data ?? null}
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
