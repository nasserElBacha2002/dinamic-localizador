import { useState } from "react";
import { InventoryForm } from "../../components/inventories/InventoryForm";
import { PageHeader } from "../../design-system";
import { useListBackNavigation } from "../../hooks/useListBackNavigation";
import { useCreateInventory } from "../../hooks/useInventories";
import type { InventoryFormValues } from "../../schemas/inventory.schema";
import { datetimeLocalToIso } from "../../utils/dates";
import { terminology } from "../../domain/terminology";
import { getApiErrorMessage } from "../../utils/errors";

export function InventoryCreatePage() {
  const { goBackToList } = useListBackNavigation("/inventories");
  const createMutation = useCreateInventory();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (values: InventoryFormValues) => {
    setErrorMessage(null);

    try {
      await createMutation.mutateAsync({
        storeId: values.storeId,
        scheduledStart: datetimeLocalToIso(values.scheduledStart),
        scheduledEnd: values.scheduledEnd ? datetimeLocalToIso(values.scheduledEnd) : null,
        earlyToleranceMinutes: values.earlyToleranceMinutes,
        lateToleranceMinutes: values.lateToleranceMinutes,
        notes: values.notes?.trim() ? values.notes.trim() : null,
      });
      goBackToList();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  };

  return (
    <>
      <PageHeader
        title={`Nueva ${terminology.operation.singular.toLowerCase()}`}
        description={`Programá una ${terminology.operation.singular.toLowerCase()}.`}
      />
      <InventoryForm
        mode="create"
        defaultValues={{
          storeId: "",
          scheduledStart: "",
          scheduledEnd: "",
          earlyToleranceMinutes: 60,
          lateToleranceMinutes: 90,
          notes: "",
        }}
        submitLabel={`Crear ${terminology.operation.singular.toLowerCase()}`}
        cancelTo="/inventories"
        onCancel={goBackToList}
        loading={createMutation.isPending}
        errorMessage={errorMessage}
        onSubmit={handleSubmit}
      />
    </>
  );
}
