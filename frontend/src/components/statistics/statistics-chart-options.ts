import type { EChartsOption } from "echarts";

const CHART_COLORS = {
  present: "#2e7d32",
  absent: "#d32f2f",
  justified: "#7b1fa2",
  expected: "#0288d1",
  late: "#ed6c02",
  outsideGeofence: "#6d4c41",
  pendingReview: "#455a64",
  rejected: "#5d4037",
  primary: "#1565c0",
  volume: "#90a4ae",
};

const baseToolbox = {
  right: 12,
  feature: {
    saveAsImage: { title: "Guardar imagen" },
    dataView: { readOnly: true, title: "Ver datos" },
    restore: { title: "Restaurar" },
  },
};

const lineToolbox = {
  ...baseToolbox,
  feature: {
    ...baseToolbox.feature,
    dataZoom: { title: { zoom: "Zoom", back: "Restaurar zoom" } },
    magicType: { type: ["line", "bar"] as ("line" | "bar")[], title: { line: "Línea", bar: "Barras" } },
  },
};

export function buildTimelineChartOption(
  dates: string[],
  series: {
    attendanceRate: number[];
    punctualityRate: number[];
    scheduled: number[];
    isPartial?: boolean[];
  },
): EChartsOption {
  const enableDataZoom = dates.length > 14;
  const labels = dates.map((date, index) =>
    series.isPartial?.[index] ? `${date} (parcial)` : date,
  );

  return {
    color: [CHART_COLORS.present, CHART_COLORS.late, CHART_COLORS.volume],
    tooltip: {
      trigger: "axis",
      formatter: (params: unknown) => {
        const items = Array.isArray(params) ? params : [params];
        return (items as Array<{ seriesName: string; value: number; axisValue: string; marker: string }>)
          .map((item) => {
            const suffix = item.seriesName === "Jornadas" ? "" : "%";
            return `${item.marker} ${item.seriesName}: ${item.value}${suffix}`;
          })
          .join("<br/>");
      },
    },
    legend: { top: 0 },
    grid: { left: 48, right: 48, top: 48, bottom: enableDataZoom ? 72 : 32 },
    toolbox: lineToolbox,
    dataZoom: enableDataZoom
      ? [
          { type: "inside", start: 0, end: 100 },
          { type: "slider", start: 0, end: 100, bottom: 8 },
        ]
      : undefined,
    xAxis: { type: "category", data: labels, boundaryGap: false },
    yAxis: [
      { type: "value", name: "%", min: 0, max: 100, minInterval: 1 },
      { type: "value", name: "Vol.", minInterval: 1, splitLine: { show: false } },
    ],
    series: [
      {
        name: "Presentismo",
        type: "line",
        smooth: true,
        data: series.attendanceRate,
        yAxisIndex: 0,
      },
      {
        name: "Puntualidad",
        type: "line",
        smooth: true,
        data: series.punctualityRate,
        yAxisIndex: 0,
      },
      {
        name: "Jornadas",
        type: "bar",
        data: series.scheduled,
        yAxisIndex: 1,
        barMaxWidth: 18,
        itemStyle: { opacity: 0.35 },
      },
    ],
  };
}

/** Non-exclusive exception counts — horizontal bars, never a pie/donut. */
export function buildActionExceptionsOption(
  items: Array<{ label: string; count: number; rate?: number | null }>,
): EChartsOption {
  return {
    color: [CHART_COLORS.late],
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params: unknown) => {
        const itemsArr = Array.isArray(params) ? params : [params];
        const first = itemsArr[0] as { name: string; value: number; dataIndex: number };
        const rate = items[first.dataIndex]?.rate;
        const rateText = rate == null ? "sin %" : `${rate}%`;
        return `${first.name}: ${first.value} (${rateText})`;
      },
    },
    grid: { left: 140, right: 40, top: 16, bottom: 24 },
    toolbox: baseToolbox,
    xAxis: { type: "value", minInterval: 1 },
    yAxis: {
      type: "category",
      data: items.map((item) => item.label),
      inverse: true,
      axisLabel: { width: 130, overflow: "truncate" },
    },
    series: [
      {
        type: "bar",
        data: items.map((item) => item.count),
        label: {
          show: true,
          position: "right",
          formatter: (params: unknown) => {
            const p = params as { dataIndex: number; value: number };
            const rate = items[p.dataIndex]?.rate;
            return rate == null ? `${p.value}` : `${p.value} (${rate}%)`;
          },
        },
      },
    ],
  };
}

export function buildHorizontalBarOption(
  title: string,
  categories: string[],
  values: number[],
  valueSuffix = "%",
): EChartsOption {
  return {
    color: [CHART_COLORS.primary],
    title: title ? { text: title, left: "center", textStyle: { fontSize: 13, fontWeight: 500 } } : undefined,
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params: unknown) => {
        const items = Array.isArray(params) ? params : [params];
        const first = items[0] as { name: string; value: number };
        return `${first.name}: ${first.value}${valueSuffix}`;
      },
    },
    grid: { left: 140, right: 40, top: title ? 40 : 16, bottom: 24 },
    toolbox: baseToolbox,
    xAxis: {
      type: "value",
      max: valueSuffix === "%" ? 100 : undefined,
      minInterval: valueSuffix === "" ? 1 : undefined,
    },
    yAxis: {
      type: "category",
      data: categories,
      inverse: true,
      axisLabel: { width: 130, overflow: "truncate" },
    },
    series: [
      {
        type: "bar",
        data: values,
        label: { show: true, position: "right", formatter: `{c}${valueSuffix}` },
      },
    ],
  };
}

export function buildVerticalBarOption(
  title: string,
  categories: string[],
  values: number[],
  valueSuffix = "",
): EChartsOption {
  return {
    color: [CHART_COLORS.late],
    title: title ? { text: title, left: "center", textStyle: { fontSize: 13, fontWeight: 500 } } : undefined,
    tooltip: { trigger: "axis" },
    grid: { left: 48, right: 24, top: title ? 40 : 16, bottom: 64 },
    toolbox: baseToolbox,
    xAxis: {
      type: "category",
      data: categories,
      axisLabel: { rotate: categories.some((c) => c.length > 12) ? 30 : 0, width: 90, overflow: "truncate" },
    },
    yAxis: { type: "value", minInterval: 1 },
    series: [
      {
        type: "bar",
        data: values,
        label: { show: true, position: "top", formatter: `{c}${valueSuffix}` },
      },
    ],
  };
}
