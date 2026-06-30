import { Button, Stack } from "@mui/material";
import { buildExportFilename, exportToCsv, exportToXlsx } from "../../utils/export";

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
