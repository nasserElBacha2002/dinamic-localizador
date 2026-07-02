import {
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import { useCallback, useState } from "react";
import { ClickableTableRow } from "../../components/common/ClickableTableRow";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { FilterItem, ListFilters } from "../../components/common/ListFilters";
import { LoadingState } from "../../components/common/LoadingState";
import { PageHeader, PageHeaderLinkAction } from "../../components/common/PageHeader";
import { PaginationControls } from "../../components/common/PaginationControls";
import { SearchField } from "../../components/common/SearchField";
import { StatusChip } from "../../components/common/StatusChip";
import { useEmployees } from "../../hooks/useEmployees";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import { usePaginationState } from "../../hooks/usePaginationState";
import { terminology } from "../../domain/terminology";
import { getApiErrorMessage } from "../../utils/errors";
import { activeStatusLabel, employeeTypeLabels } from "../../utils/labels";
import { hasPermission } from "../../utils/permissions";

export function EmployeesListPage() {
  const permissionsQuery = useCompanyPermissions();
  const canManageEmployees = hasPermission(
    permissionsQuery.data?.permissions,
    "employees:manage",
  );
  const pagination = usePaginationState(10);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "true" | "false">("all");

  const filters = {
    page: pagination.page,
    limit: pagination.pageSize,
    search: search || undefined,
    active: activeFilter === "all" ? undefined : activeFilter === "true",
  };

  const { data, isPending, isError, error } = useEmployees(filters);

  const handleSearch = useCallback((value: string) => {
    pagination.resetPage();
    setSearch(value);
  }, [pagination]);

  return (
    <>
      <PageHeader
        title={terminology.worker.plural}
        description={`Administrá el personal habilitado para ${terminology.operation.plural.toLowerCase()}.`}
        action={
          canManageEmployees ? (
            <PageHeaderLinkAction
              to="/employees/new"
              label={`Nuevo ${terminology.worker.singular.toLowerCase()}`}
            />
          ) : undefined
        }
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
                pagination.resetPage();
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
        <EmptyState
          title={`No hay ${terminology.worker.plural.toLowerCase()}`}
          description={`Creá el primer ${terminology.worker.singular.toLowerCase()} para comenzar.`}
        />
      ) : null}

      {data && data.data.length > 0 ? (
        <>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small" aria-label={`Listado de ${terminology.worker.plural.toLowerCase()}`}>
              <TableHead>
                <TableRow>
                  <TableCell>Nombre</TableCell>
                  <TableCell>Documento</TableCell>
                  <TableCell>Teléfono</TableCell>
                  <TableCell>Tipo</TableCell>
                  <TableCell>Estado</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.data.map((employee) => (
                  <ClickableTableRow
                    key={employee.id}
                    to={`/employees/${employee.id}`}
                    ariaLabel={`Ver ${terminology.worker.singular.toLowerCase()} ${employee.name}`}
                  >
                    <TableCell>{employee.name}</TableCell>
                    <TableCell>{employee.documentNumber ?? "—"}</TableCell>
                    <TableCell>{employee.phoneNumber}</TableCell>
                    <TableCell>{employeeTypeLabels[employee.employeeType]}</TableCell>
                    <TableCell>
                      <StatusChip
                        label={activeStatusLabel(employee.active)}
                        color={employee.active ? "success" : "default"}
                      />
                    </TableCell>
                  </ClickableTableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <PaginationControls
            meta={data.meta}
            onPageChange={pagination.onPageChange}
            pageSize={pagination.pageSize}
            onPageSizeChange={pagination.onPageSizeChange}
            showPageSizeSelector
          />
        </>
      ) : null}
    </>
  );
}
