import { Box, Paper, Skeleton, Stack, Typography } from "@mui/material";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import type { ReactNode } from "react";
import { EmptyState } from "../common/EmptyState";
import { ExportActionButtons } from "./ExportActionButtons";

interface ChartCardProps {
  title: string;
  height?: number;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
  option?: EChartsOption;
  exportHeaders?: string[];
  exportRows?: Array<Array<string | number | null | undefined>>;
  exportBaseName?: string;
  dateFrom?: string;
  dateTo?: string;
  actions?: ReactNode;
}

export function ChartCard({
  title,
  height = 360,
  isLoading,
  isEmpty,
  emptyMessage = "No hay datos para mostrar con los filtros actuales.",
  option,
  exportHeaders,
  exportRows,
  exportBaseName,
  dateFrom,
  dateTo,
  actions,
}: ChartCardProps) {
  return (
    <Paper sx={{ p: 2, height: "100%" }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1} sx={{ mb: 1 }}>
        <Typography variant="subtitle1" fontWeight={600}>
          {title}
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          {actions}
          {exportHeaders && exportRows && exportBaseName ? (
            <ExportActionButtons
              baseName={exportBaseName}
              headers={exportHeaders}
              rows={exportRows}
              dateFrom={dateFrom}
              dateTo={dateTo}
              size="small"
            />
          ) : null}
        </Stack>
      </Stack>

      {isLoading ? (
        <Skeleton variant="rounded" height={height} />
      ) : isEmpty || !option ? (
        <Box sx={{ minHeight: height, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <EmptyState title={emptyMessage} />
        </Box>
      ) : (
        <ReactECharts option={option} style={{ height }} notMerge lazyUpdate />
      )}
    </Paper>
  );
}
