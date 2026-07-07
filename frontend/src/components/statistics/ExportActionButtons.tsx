import { Button, Group } from "@mantine/core";
import { useState } from "react";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import { buildExportFilename, exportToCsv, exportToXlsx } from "../../utils/export";
import { hasPermission } from "../../utils/permissions";

type ExportRow = Array<string | number | null | undefined>;

interface ExportActionButtonsProps {
  baseName: string;
  headers: string[];
  rows?: ExportRow[];
  loadRows?: () => Promise<ExportRow[]>;
  dateFrom?: string;
  dateTo?: string;
  size?: "small" | "medium";
  sheetName?: string;
  disabled?: boolean;
}

export function ExportActionButtons({
  baseName,
  headers,
  rows = [],
  loadRows,
  dateFrom,
  dateTo,
  size = "medium",
  sheetName = "Datos",
  disabled = false,
}: ExportActionButtonsProps) {
  const permissionsQuery = useCompanyPermissions();
  const canExport = hasPermission(permissionsQuery.data?.permissions, "reports:export");
  const [isLoading, setIsLoading] = useState(false);

  if (!canExport) {
    return null;
  }

  const filename = buildExportFilename(baseName, dateFrom, dateTo);
  const hasStaticRows = rows.length > 0;
  const isDisabled = disabled || isLoading || (!loadRows && !hasStaticRows);
  const buttonSize = size === "small" ? "compact-sm" : "sm";

  const resolveRows = async (): Promise<ExportRow[]> => {
    if (loadRows) {
      return loadRows();
    }

    return rows;
  };

  const handleCsvExport = async () => {
    setIsLoading(true);
    try {
      const exportRows = await resolveRows();
      if (exportRows.length === 0) {
        return;
      }
      exportToCsv(filename, headers, exportRows);
    } finally {
      setIsLoading(false);
    }
  };

  const handleXlsxExport = async () => {
    setIsLoading(true);
    try {
      const exportRows = await resolveRows();
      if (exportRows.length === 0) {
        return;
      }
      exportToXlsx(filename, headers, exportRows, sheetName);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Group gap="xs">
      <Button
        size={buttonSize}
        variant="default"
        onClick={() => void handleCsvExport()}
        disabled={isDisabled}
        loading={isLoading}
        title={disabled ? "Completá un rango de fechas válido antes de exportar." : undefined}
      >
        CSV
      </Button>
      <Button
        size={buttonSize}
        variant="default"
        onClick={() => void handleXlsxExport()}
        disabled={isDisabled}
        loading={isLoading}
        title={disabled ? "Completá un rango de fechas válido antes de exportar." : undefined}
      >
        Excel
      </Button>
    </Group>
  );
}
