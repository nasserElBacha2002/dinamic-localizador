import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AttendanceTestForm } from "../../components/attendance/AttendanceTestForm";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { PageHeader } from "../../components/common/PageHeader";
import { useCreateAttendanceRecord } from "../../hooks/useAttendance";
import { useEmployees } from "../../hooks/useEmployees";
import { useInventories } from "../../hooks/useInventories";
import { AdminLayout } from "../../layouts/AdminLayout";
import type { AttendanceTestFormValues } from "../../schemas/attendance.schema";
import { datetimeLocalToIso } from "../../utils/dates";
import { getApiErrorMessage } from "../../utils/errors";

export function AttendanceCreatePage() {
  const navigate = useNavigate();
  const createMutation = useCreateAttendanceRecord();
  const inventoriesQuery = useInventories({ page: 1, limit: 100 });
  const employeesQuery = useEmployees({ page: 1, limit: 100, active: true });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (inventoriesQuery.isLoading || employeesQuery.isLoading) {
    return (
      <AdminLayout>
        <LoadingState />
      </AdminLayout>
    );
  }

  if (inventoriesQuery.isError || employeesQuery.isError) {
    return (
      <AdminLayout>
        <ErrorState
          message={getApiErrorMessage(
            inventoriesQuery.error ?? employeesQuery.error,
            "No se pudieron cargar los datos del formulario.",
          )}
        />
      </AdminLayout>
    );
  }

  const handleSubmit = async (values: AttendanceTestFormValues) => {
    setErrorMessage(null);

    try {
      const record = await createMutation.mutateAsync({
        inventoryId: values.inventoryId,
        employeeId: values.employeeId,
        receivedLatitude: values.receivedLatitude,
        receivedLongitude: values.receivedLongitude,
        distanceMeters: values.distanceMeters,
        validationStatus: values.validationStatus,
        locationStatus: values.locationStatus,
        punctualityStatus: values.punctualityStatus,
        receivedAt: datetimeLocalToIso(values.receivedAt),
        sourceMessageSid: values.sourceMessageSid?.trim() ? values.sourceMessageSid.trim() : null,
        validationReason: values.validationReason?.trim() ? values.validationReason.trim() : null,
      });
      navigate(`/attendance/${record.id}`);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  };

  return (
    <AdminLayout>
      <PageHeader
        title="Crear registro de prueba"
        description="Herramienta temporal para validar el modelo de asistencia."
      />
      <AttendanceTestForm
        inventories={inventoriesQuery.data?.data ?? []}
        employees={employeesQuery.data?.data ?? []}
        defaultValues={{
          inventoryId: inventoriesQuery.data?.data[0]?.id ?? "",
          employeeId: employeesQuery.data?.data[0]?.id ?? "",
          receivedLatitude: 0,
          receivedLongitude: 0,
          distanceMeters: 0,
          validationStatus: "VALID",
          locationStatus: "INSIDE_GEOFENCE",
          punctualityStatus: "ON_TIME",
          receivedAt: "",
          sourceMessageSid: "",
          validationReason: "",
        }}
        submitLabel="Crear registro de prueba"
        cancelTo="/attendance"
        loading={createMutation.isPending}
        errorMessage={errorMessage}
        onSubmit={handleSubmit}
      />
    </AdminLayout>
  );
}
