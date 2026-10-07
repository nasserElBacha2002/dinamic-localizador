import type { EChartsOption } from "echarts";
import { chartColors } from "../../design-system/theme/chart-colors";

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

const axisLabelStyle = { color: chartColors.axis, fontSize: 11 };
const splitLineStyle = { lineStyle: { color: chartColors.grid, type: "dashed" as const } };

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
    color: [chartColors.present, chartColors.late, chartColors.volume],
    textStyle: { fontFamily: "Inter, system-ui, sans-serif", color: chartColors.ink },
    tooltip: {
      trigger: "axis",
      backgroundColor: chartColors.ink,
      borderColor: chartColors.ink,
      textStyle: { color: "#fff", fontSize: 12 },
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
    legend: { top: 0, textStyle: { color: chartColors.axis } },
    grid: { left: 48, right: 48, top: 48, bottom: enableDataZoom ? 72 : 32 },
    toolbox: lineToolbox,
    dataZoom: enableDataZoom
      ? [
          { type: "inside", start: 0, end: 100 },
          { type: "slider", start: 0, end: 100, bottom: 8 },
        ]
      : undefined,
    xAxis: {
      type: "category",
      data: labels,
      boundaryGap: false,
      axisLabel: axisLabelStyle,
      axisLine: { lineStyle: { color: chartColors.grid } },
    },
    yAxis: [
      {
        type: "value",
        name: "%",
        min: 0,
        max: 100,
        minInterval: 1,
        nameTextStyle: axisLabelStyle,
        axisLabel: axisLabelStyle,
        splitLine: splitLineStyle,
      },
      {
        type: "value",
        name: "Vol.",
        minInterval: 1,
        splitLine: { show: false },
        nameTextStyle: axisLabelStyle,
        axisLabel: axisLabelStyle,
      },
    ],
    series: [
      {
        name: "Presentismo",
        type: "line",
        smooth: true,
        data: series.attendanceRate,
        yAxisIndex: 0,
        lineStyle: { width: 2 },
      },
      {
        name: "Puntualidad",
        type: "line",
        smooth: true,
        data: series.punctualityRate,
        yAxisIndex: 0,
        lineStyle: { width: 2 },
      },
      {
        name: "Jornadas",
        type: "bar",
        data: series.scheduled,
        yAxisIndex: 1,
        barMaxWidth: 18,
        itemStyle: { opacity: 0.35, color: chartColors.volume },
      },
    ],
  };
}

/** Non-exclusive exception counts — horizontal bars, never a pie/donut. */
export function buildActionExceptionsOption(
  items: Array<{ label: string; count: number; rate?: number | null }>,
): EChartsOption {
  return {
    color: [chartColors.warning],
    textStyle: { fontFamily: "Inter, system-ui, sans-serif", color: chartColors.ink },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      backgroundColor: chartColors.ink,
      borderColor: chartColors.ink,
      textStyle: { color: "#fff", fontSize: 12 },
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
    xAxis: {
      type: "value",
      minInterval: 1,
      axisLabel: axisLabelStyle,
      splitLine: splitLineStyle,
    },
    yAxis: {
      type: "category",
      data: items.map((item) => item.label),
      inverse: true,
      axisLabel: { width: 130, overflow: "truncate", ...axisLabelStyle },
      axisLine: { lineStyle: { color: chartColors.grid } },
    },
    series: [
      {
        type: "bar",
        data: items.map((item) => item.count),
        label: {
          show: true,
          position: "right",
          color: chartColors.ink,
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
    color: [chartColors.primary],
    textStyle: { fontFamily: "Inter, system-ui, sans-serif", color: chartColors.ink },
    title: title
      ? { text: title, left: "center", textStyle: { fontSize: 13, fontWeight: 500, color: chartColors.ink } }
      : undefined,
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      backgroundColor: chartColors.ink,
      borderColor: chartColors.ink,
      textStyle: { color: "#fff", fontSize: 12 },
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
      axisLabel: axisLabelStyle,
      splitLine: splitLineStyle,
    },
    yAxis: {
      type: "category",
      data: categories,
      inverse: true,
      axisLabel: { width: 130, overflow: "truncate", ...axisLabelStyle },
      axisLine: { lineStyle: { color: chartColors.grid } },
    },
    series: [
      {
        type: "bar",
        data: values,
        label: {
          show: true,
          position: "right",
          color: chartColors.ink,
          formatter: `{c}${valueSuffix}`,
        },
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
    color: [chartColors.primary],
    textStyle: { fontFamily: "Inter, system-ui, sans-serif", color: chartColors.ink },
    title: title
      ? { text: title, left: "center", textStyle: { fontSize: 13, fontWeight: 500, color: chartColors.ink } }
      : undefined,
    tooltip: {
      trigger: "axis",
      backgroundColor: chartColors.ink,
      borderColor: chartColors.ink,
      textStyle: { color: "#fff", fontSize: 12 },
    },
    grid: { left: 48, right: 24, top: title ? 40 : 16, bottom: 64 },
    toolbox: baseToolbox,
    xAxis: {
      type: "category",
      data: categories,
      axisLabel: {
        rotate: categories.some((c) => c.length > 12) ? 30 : 0,
        width: 90,
        overflow: "truncate",
        ...axisLabelStyle,
      },
      axisLine: { lineStyle: { color: chartColors.grid } },
    },
    yAxis: {
      type: "value",
      minInterval: 1,
      axisLabel: axisLabelStyle,
      splitLine: splitLineStyle,
    },
    series: [
      {
        type: "bar",
        data: values,
        label: { show: true, position: "top", color: chartColors.ink, formatter: `{c}${valueSuffix}` },
      },
    ],
  };
}
