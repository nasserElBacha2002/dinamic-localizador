import { Box, Group, Skeleton } from "@mantine/core";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import type { ReactNode } from "react";
import { EmptyState, SectionCard } from "../../design-system";
import { ExportActionButtons } from "./ExportActionButtons";

interface ChartCardProps {
  title: string;
  description?: ReactNode;
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
  exportsDisabled?: boolean;
}

export function ChartCard({
  title,
  description,
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
  exportsDisabled = false,
}: ChartCardProps) {
  const exportActions =
    exportHeaders && exportRows && exportBaseName ? (
      <ExportActionButtons
        baseName={exportBaseName}
        headers={exportHeaders}
        rows={exportRows}
        dateFrom={dateFrom}
        dateTo={dateTo}
        size="small"
        disabled={exportsDisabled}
      />
    ) : null;

  return (
    <SectionCard
      title={title}
      description={description}
      action={
        actions || exportActions ? (
          <Group gap="xs" wrap="nowrap">
            {actions}
            {exportActions}
          </Group>
        ) : undefined
      }
    >
      {isLoading ? (
        <Skeleton height={height} radius="md" />
      ) : isEmpty || !option ? (
        <Box mih={height} style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <EmptyState title={emptyMessage} />
        </Box>
      ) : (
        <ReactECharts option={option} style={{ height, width: "100%" }} notMerge lazyUpdate />
      )}
    </SectionCard>
  );
}
