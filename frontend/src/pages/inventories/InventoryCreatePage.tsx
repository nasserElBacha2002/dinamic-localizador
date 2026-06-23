import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { InventoryForm } from "../../components/inventories/InventoryForm";
import { PageHeader } from "../../components/common/PageHeader";
import { useCreateInventory } from "../../hooks/useInventories";
import { AdminLayout } from "../../layouts/AdminLayout";
import type { InventoryFormValues } from "../../schemas/inventory.schema";
import { datetimeLocalToIso } from "../../utils/dates";
import { getApiErrorMessage } from "../../utils/errors";

export function InventoryCreatePage() {
  const navigate = useNavigate();
  const createMutation = useCreateInventory();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
        defaultValues={{
          storeId: "",
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
