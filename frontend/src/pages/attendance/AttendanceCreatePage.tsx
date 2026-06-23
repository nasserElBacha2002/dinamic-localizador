import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AttendanceTestForm } from "../../components/attendance/AttendanceTestForm";
import { PageHeader } from "../../components/common/PageHeader";
import { useCreateAttendanceRecord } from "../../hooks/useAttendance";
import { AdminLayout } from "../../layouts/AdminLayout";
import type { AttendanceTestFormValues } from "../../schemas/attendance.schema";
import { datetimeLocalToIso } from "../../utils/dates";
import { getApiErrorMessage } from "../../utils/errors";

export function AttendanceCreatePage() {
  const navigate = useNavigate();
  const createMutation = useCreateAttendanceRecord();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
        defaultValues={{
          inventoryId: "",
          employeeId: "",
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
