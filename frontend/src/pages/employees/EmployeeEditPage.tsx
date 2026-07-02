import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent, Typography } from "@mui/material";
import { EmployeeAbsenceBalanceCard } from "../../components/absences/EmployeeAbsenceBalanceCard";
import { EmployeeAbsenceHistoryTable } from "../../components/absences/EmployeeAbsenceHistoryTable";
import { EmployeeForm } from "../../components/employees/EmployeeForm";
import { ErrorState } from "../../components/common/ErrorState";
import { FeedbackSnackbar } from "../../components/common/FeedbackSnackbar";
import { LoadingState } from "../../components/common/LoadingState";
import { PageHeader } from "../../components/common/PageHeader";
import { useEmployee, useUpdateEmployee } from "../../hooks/useEmployees";
import type { EmployeeFormValues } from "../../schemas/employee.schema";
import { terminology } from "../../domain/terminology";
import { getApiErrorMessage } from "../../utils/errors";

export function EmployeeEditPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const employeeQuery = useEmployee(id);
  const updateMutation = useUpdateEmployee(id ?? "");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);

  if (!id) {
    return (
      <ErrorState message={`${terminology.worker.singular} no encontrado.`} />
    );
  }

  if (employeeQuery.isLoading) {
    return (
      <LoadingState />
    );
  }

  if (employeeQuery.isError || !employeeQuery.data) {
    return (
      <ErrorState
          message={getApiErrorMessage(
            employeeQuery.error,
            `${terminology.worker.singular} no encontrado.`,
          )}
        />
    );
  }

  const employee = employeeQuery.data;
  const currentYear = new Date().getFullYear();

  const handleSubmit = async (values: EmployeeFormValues) => {
    setErrorMessage(null);

    try {
      await updateMutation.mutateAsync({
        name: values.name,
        documentNumber: values.documentNumber?.trim() ? values.documentNumber.trim() : null,
        phoneNumber: values.phoneNumber,
        employeeType: values.employeeType,
        active: values.active,
      });
      setSuccessOpen(true);
      navigate("/employees");
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  };

  return (
    <>
      <PageHeader
        title={`Editar ${terminology.worker.singular.toLowerCase()}`}
        description={employee.name}
      />
      <EmployeeForm
        defaultValues={{
          name: employee.name,
          documentNumber: employee.documentNumber ?? "",
          phoneNumber: employee.phoneNumber,
          employeeType: employee.employeeType,
          active: employee.active,
        }}
        submitLabel="Guardar cambios"
        cancelTo="/employees"
        loading={updateMutation.isPending}
        errorMessage={errorMessage}
        onSubmit={handleSubmit}
      />
      <Card variant="outlined" sx={{ mt: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Ausencias · Saldos {currentYear}
          </Typography>
          <EmployeeAbsenceBalanceCard employeeId={employee.id} year={currentYear} />
        </CardContent>
      </Card>
      <Card variant="outlined" sx={{ mt: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Ausencias · Historial {currentYear}
          </Typography>
          <EmployeeAbsenceHistoryTable employeeId={employee.id} year={currentYear} />
        </CardContent>
      </Card>
      <FeedbackSnackbar
        open={successOpen}
        message={`${terminology.worker.singular} actualizado correctamente.`}
        onClose={() => setSuccessOpen(false)}
      />
    </>
  );
}
