import type { EChartsOption } from "echarts";

const CHART_COLORS = {
  present: "#2e7d32",
  late: "#ed6c02",
  outsideGeofence: "#d32f2f",
  pendingReview: "#0288d1",
  rejected: "#6d4c41",
  noShow: "#757575",
  manuallyAccepted: "#7b1fa2",
  primary: "#1565c0",
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
    present: number[];
    late: number[];
    outsideGeofence: number[];
    pendingReview: number[];
    rejected: number[];
  },
): EChartsOption {
  const enableDataZoom = dates.length > 14;

  return {
    color: [
      CHART_COLORS.present,
      CHART_COLORS.late,
      CHART_COLORS.outsideGeofence,
      CHART_COLORS.pendingReview,
      CHART_COLORS.rejected,
    ],
    tooltip: { trigger: "axis" },
    legend: { top: 0 },
    grid: { left: 48, right: 24, top: 48, bottom: enableDataZoom ? 72 : 32 },
    toolbox: lineToolbox,
    dataZoom: enableDataZoom
      ? [
          { type: "inside", start: 0, end: 100 },
          { type: "slider", start: 0, end: 100, bottom: 8 },
        ]
      : undefined,
    xAxis: { type: "category", data: dates, boundaryGap: false },
    yAxis: { type: "value", minInterval: 1 },
    series: [
      { name: "Presente", type: "line", smooth: true, data: series.present },
      { name: "Tarde", type: "line", smooth: true, data: series.late },
      { name: "Fuera de geocerca", type: "line", smooth: true, data: series.outsideGeofence },
      { name: "Pendiente", type: "line", smooth: true, data: series.pendingReview },
      { name: "Rechazado", type: "line", smooth: true, data: series.rejected },
    ],
  };
}

export function buildStatusDistributionOption(
  items: Array<{ label: string; count: number }>,
): EChartsOption {
  return {
    color: [
      CHART_COLORS.present,
      CHART_COLORS.late,
      CHART_COLORS.outsideGeofence,
      CHART_COLORS.pendingReview,
      CHART_COLORS.rejected,
      CHART_COLORS.manuallyAccepted,
      CHART_COLORS.noShow,
    ],
    tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
    legend: { orient: "vertical", left: "left", top: "middle" },
    toolbox: baseToolbox,
    series: [
      {
        name: "Estado",
        type: "pie",
        radius: ["42%", "68%"],
        center: ["58%", "50%"],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 6, borderColor: "#fff", borderWidth: 2 },
        label: { formatter: "{b}\n{d}%" },
        data: items.map((item) => ({ name: item.label, value: item.count })),
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
    grid: { left: 120, right: 32, top: title ? 40 : 16, bottom: 24 },
    toolbox: baseToolbox,
    xAxis: { type: "value", max: valueSuffix === "%" ? 100 : undefined },
    yAxis: {
      type: "category",
      data: categories,
      inverse: true,
      axisLabel: { width: 110, overflow: "truncate" },
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
      axisLabel: { rotate: categories.length > 6 ? 35 : 0, overflow: "truncate", width: 80 },
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
