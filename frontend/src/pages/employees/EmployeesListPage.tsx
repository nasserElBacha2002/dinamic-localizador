import {
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import { useCallback, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { FeedbackSnackbar } from "../../components/common/FeedbackSnackbar";
import { FilterItem, ListFilters } from "../../components/common/ListFilters";
import { LoadingState } from "../../components/common/LoadingState";
import { PageHeader, PageHeaderLinkAction } from "../../components/common/PageHeader";
import { PaginationControls } from "../../components/common/PaginationControls";
import { SearchField } from "../../components/common/SearchField";
import { StatusChip } from "../../components/common/StatusChip";
import { useDeactivateEmployee, useEmployees } from "../../hooks/useEmployees";
import { AdminLayout } from "../../layouts/AdminLayout";
import type { Employee } from "../../types/employee";
import { getApiErrorMessage } from "../../utils/errors";
import { activeStatusLabel } from "../../utils/labels";

export function EmployeesListPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "true" | "false">("all");
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [feedback, setFeedback] = useState<{ open: boolean; message: string; severity: "success" | "error" }>({
    open: false,
    message: "",
    severity: "success",
  });

  const filters = {
    page,
    limit: 10,
    search: search || undefined,
    active: activeFilter === "all" ? undefined : activeFilter === "true",
  };

  const { data, isPending, isError, error } = useEmployees(filters);
  const deactivateMutation = useDeactivateEmployee();

  const handleSearch = useCallback((value: string) => {
    setPage(1);
    setSearch(value);
  }, []);

  const handleDeactivate = async () => {
    if (!selectedEmployee) {
      return;
    }

    try {
      await deactivateMutation.mutateAsync(selectedEmployee.id);
      setFeedback({ open: true, message: "Empleado desactivado correctamente.", severity: "success" });
      setSelectedEmployee(null);
    } catch (mutationError) {
      setFeedback({
        open: true,
        message: getApiErrorMessage(mutationError, "No se pudo desactivar el empleado."),
        severity: "error",
      });
    }
  };

  return (
    <AdminLayout>
      <PageHeader
        title="Empleados"
        description="Administrá el personal habilitado para inventarios."
        action={<PageHeaderLinkAction to="/employees/new" label="Nuevo empleado" />}
      />

      <ListFilters>
        <FilterItem size={{ xs: 12, sm: 6, md: 4 }}>
          <SearchField
            placeholder="Nombre, documento o teléfono"
            onSearch={handleSearch}
            fullWidth
          />
        </FilterItem>
        <FilterItem size={{ xs: 12, sm: 6, md: 4 }}>
          <FormControl fullWidth>
            <InputLabel id="employee-active-filter">Estado</InputLabel>
            <Select
              labelId="employee-active-filter"
              label="Estado"
              value={activeFilter}
              onChange={(event) => {
                setPage(1);
                setActiveFilter(event.target.value as "all" | "true" | "false");
              }}
            >
              <MenuItem value="all">Todos</MenuItem>
              <MenuItem value="true">Activos</MenuItem>
              <MenuItem value="false">Inactivos</MenuItem>
            </Select>
          </FormControl>
        </FilterItem>
      </ListFilters>

      {isPending ? <LoadingState /> : null}
      {isError ? <ErrorState message={getApiErrorMessage(error)} /> : null}

      {data && !isError && data.data.length === 0 ? (
        <EmptyState title="No hay empleados" description="Creá el primer empleado para comenzar." />
      ) : null}

      {data && data.data.length > 0 ? (
        <>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small" aria-label="Listado de empleados">
              <TableHead>
                <TableRow>
                  <TableCell>Nombre</TableCell>
                  <TableCell>Documento</TableCell>
                  <TableCell>Teléfono</TableCell>
                  <TableCell>Estado</TableCell>
                  <TableCell align="right">Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.data.map((employee) => (
                  <TableRow key={employee.id} hover>
                    <TableCell>{employee.name}</TableCell>
                    <TableCell>{employee.documentNumber ?? "—"}</TableCell>
                    <TableCell>{employee.phoneNumber}</TableCell>
                    <TableCell>
                      <StatusChip
                        label={activeStatusLabel(employee.active)}
                        color={employee.active ? "success" : "default"}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Button component={RouterLink} to={`/employees/${employee.id}`} size="small">
                          Editar
                        </Button>
                        <Button
                          size="small"
                          color="error"
                          disabled={!employee.active}
                          onClick={() => setSelectedEmployee(employee)}
                        >
                          Desactivar
                        </Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <PaginationControls meta={data.meta} onPageChange={setPage} />
        </>
      ) : null}

      <ConfirmDialog
        open={Boolean(selectedEmployee)}
        title="Desactivar empleado"
        description={`¿Confirmás desactivar a ${selectedEmployee?.name ?? "este empleado"}?`}
        confirmLabel="Desactivar"
        loading={deactivateMutation.isPending}
        onCancel={() => setSelectedEmployee(null)}
        onConfirm={handleDeactivate}
      />

      <FeedbackSnackbar
        open={feedback.open}
        message={feedback.message}
        severity={feedback.severity}
        onClose={() => setFeedback((current) => ({ ...current, open: false }))}
      />
    </AdminLayout>
  );
}
