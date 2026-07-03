import { useMemo, useState } from "react";
import { Alert } from "@mantine/core";
import { InventoryForm } from "../../components/inventories/InventoryForm";
import { LoadingState, PageHeader } from "../../design-system";
import { useCompanySettingsForInventoryCreate } from "../../hooks/useCompanySettings";
import { useListBackNavigation } from "../../hooks/useListBackNavigation";
import { useCreateInventory } from "../../hooks/useInventories";
import type { InventoryFormValues } from "../../schemas/inventory.schema";
import { datetimeLocalToIso } from "../../utils/dates";
import { terminology } from "../../domain/terminology";
import { getApiErrorMessage } from "../../utils/errors";
import { buildInventoryCreateDefaultValues } from "../../utils/inventory-create-defaults";

export function InventoryCreatePage() {
  const { goBackToList } = useListBackNavigation("/inventories");
  const createMutation = useCreateInventory();
  const {
    data: companySettings,
    isPending: settingsPending,
    isFetching: settingsFetching,
    isSuccess: settingsLoaded,
    isError: settingsError,
  } = useCompanySettingsForInventoryCreate();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const defaultValues = useMemo<InventoryFormValues | null>(() => {
    if (!companySettings) {
      return null;
    }

    return buildInventoryCreateDefaultValues(companySettings);
  }, [companySettings]);

  const handleSubmit = async (values: InventoryFormValues) => {
    setErrorMessage(null);

    try {
      await createMutation.mutateAsync({
        storeId: values.storeId,
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
          configuración de inventarios al crear la operación.
        </Alert>
      ) : null}
      {defaultValues ? (
        <InventoryForm
          key={`settings-${companySettings?.updatedAt}-${defaultValues.earlyToleranceMinutes}-${defaultValues.lateToleranceMinutes}`}
          mode="create"
          defaultValues={defaultValues}
          submitLabel={`Crear ${terminology.operation.singular.toLowerCase()}`}
          cancelTo="/inventories"
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
