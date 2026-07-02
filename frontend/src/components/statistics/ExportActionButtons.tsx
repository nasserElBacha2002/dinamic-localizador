import { Button, Group } from "@mantine/core";
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
  const buttonSize = size === "small" ? "compact-sm" : "sm";

  return (
    <Group gap="xs">
      <Button
        size={buttonSize}
        variant="default"
        onClick={() => exportToCsv(filename, headers, rows)}
        disabled={isDisabled}
        title={disabled ? "Completá un rango de fechas válido antes de exportar." : undefined}
      >
        CSV
      </Button>
      <Button
        size={buttonSize}
        variant="default"
        onClick={() => exportToXlsx(filename, headers, rows, sheetName)}
        disabled={isDisabled}
        title={disabled ? "Completá un rango de fechas válido antes de exportar." : undefined}
      >
        Excel
      </Button>
    </Group>
  );
}
