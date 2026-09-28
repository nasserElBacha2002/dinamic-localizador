import { useState } from "react";
import { useNavigate } from "react-router";
import { AttendanceTestForm } from "../../components/attendance/AttendanceTestForm";
import { PageHeader } from "../../design-system";
import { useCreateAttendanceRecord } from "../../hooks/useAttendance";
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
        operationId: values.operationId,
        employeeId: values.employeeId,
        receivedLatitude: values.receivedLatitude,
        receivedLongitude: values.receivedLongitude,
        receivedAt: datetimeLocalToIso(values.receivedAt),
        sourceMessageSid: values.sourceMessageSid?.trim() ? values.sourceMessageSid.trim() : null,
      });
      navigate(`/attendance/${record.id}`);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  };

  return (
    <>
      <PageHeader
        title="Crear registro de prueba"
        description="Herramienta temporal para validar el modelo de asistencia. Los estados los calcula el servidor."
      />
      <AttendanceTestForm
        defaultValues={{
          operationId: "",
          employeeId: "",
          receivedLatitude: 0,
          receivedLongitude: 0,
          receivedAt: "",
          sourceMessageSid: "",
        }}
        submitLabel="Crear registro de prueba"
        cancelTo="/attendance"
        loading={createMutation.isPending}
        errorMessage={errorMessage}
        onSubmit={handleSubmit}
      />
    </>
  );
}
