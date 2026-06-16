import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { InventoryForm } from "../../components/inventories/InventoryForm";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { PageHeader } from "../../components/common/PageHeader";
import { useCreateInventory } from "../../hooks/useInventories";
import { useStores } from "../../hooks/useStores";
import { AdminLayout } from "../../layouts/AdminLayout";
import type { InventoryFormValues } from "../../schemas/inventory.schema";
import { datetimeLocalToIso } from "../../utils/dates";
import { getApiErrorMessage } from "../../utils/errors";

export function InventoryCreatePage() {
  const navigate = useNavigate();
  const createMutation = useCreateInventory();
  const storesQuery = useStores({ page: 1, limit: 100, active: true });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (storesQuery.isLoading) {
    return (
      <AdminLayout>
        <LoadingState />
      </AdminLayout>
    );
  }

  if (storesQuery.isError) {
    return (
      <AdminLayout>
        <ErrorState message={getApiErrorMessage(storesQuery.error)} />
      </AdminLayout>
    );
  }

  const handleSubmit = async (values: InventoryFormValues) => {
    setErrorMessage(null);

    try {
      const inventory = await createMutation.mutateAsync({
        storeId: values.storeId,
        scheduledStart: datetimeLocalToIso(values.scheduledStart),
        scheduledEnd: values.scheduledEnd ? datetimeLocalToIso(values.scheduledEnd) : null,
        earlyToleranceMinutes: values.earlyToleranceMinutes,
        lateToleranceMinutes: values.lateToleranceMinutes,
        notes: values.notes?.trim() ? values.notes.trim() : null,
      });
      navigate(`/inventories/${inventory.id}`);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  };

  return (
    <AdminLayout>
      <PageHeader title="Nuevo inventario" description="Programá una jornada de inventario." />
      <InventoryForm
        mode="create"
        stores={storesQuery.data?.data ?? []}
        defaultValues={{
          storeId: storesQuery.data?.data[0]?.id ?? "",
          scheduledStart: "",
          scheduledEnd: "",
          earlyToleranceMinutes: 60,
          lateToleranceMinutes: 90,
          notes: "",
        }}
        submitLabel="Crear inventario"
        cancelTo="/inventories"
        loading={createMutation.isPending}
        errorMessage={errorMessage}
        onSubmit={handleSubmit}
      />
    </AdminLayout>
  );
}
