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
}

export function ExportActionButtons({
  baseName,
  headers,
  rows,
  dateFrom,
  dateTo,
  size = "medium",
  sheetName = "Datos",
}: ExportActionButtonsProps) {
  const filename = buildExportFilename(baseName, dateFrom, dateTo);

  return (
    <Stack direction="row" spacing={1}>
      <Button
        size={size}
        variant="outlined"
        onClick={() => exportToCsv(filename, headers, rows)}
        disabled={rows.length === 0}
      >
        CSV
      </Button>
      <Button
        size={size}
        variant="outlined"
        onClick={() => exportToXlsx(filename, headers, rows, sheetName)}
        disabled={rows.length === 0}
      >
        Excel
      </Button>
    </Stack>
  );
}
