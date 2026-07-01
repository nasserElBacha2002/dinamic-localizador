import { Button, Stack } from "@mui/material";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import { buildExportFilename, exportToCsv, exportToXlsx } from "../../utils/export";
import { hasPermission } from "../../utils/permissions";

interface ExportActionButtonsProps {
  baseName: string;
  headers: string[];
  rows: Array<Array<string | number | null | undefined>>;
  dateFrom?: string;
  dateTo?: string;
  size?: "small" | "medium";
  sheetName?: string;
  disabled?: boolean;
}

export function ExportActionButtons({
  baseName,
  headers,
  rows,
  dateFrom,
  dateTo,
  size = "medium",
  sheetName = "Datos",
  disabled = false,
}: ExportActionButtonsProps) {
  const permissionsQuery = useCompanyPermissions();
  const canExport = hasPermission(permissionsQuery.data?.permissions, "reports:export");

  if (!canExport) {
    return null;
  }

  const filename = buildExportFilename(baseName, dateFrom, dateTo);
  const isDisabled = disabled || rows.length === 0;

  return (
    <Stack direction="row" spacing={1}>
      <Button
        size={size}
        variant="outlined"
        onClick={() => exportToCsv(filename, headers, rows)}
        disabled={isDisabled}
        title={disabled ? "Completá un rango de fechas válido antes de exportar." : undefined}
      >
        CSV
      </Button>
      <Button
        size={size}
        variant="outlined"
        onClick={() => exportToXlsx(filename, headers, rows, sheetName)}
        disabled={isDisabled}
        title={disabled ? "Completá un rango de fechas válido antes de exportar." : undefined}
      >
        Excel
      </Button>
    </Stack>
  );
}
