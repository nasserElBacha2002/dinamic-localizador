import { useState, type CSSProperties } from "react";
import { MobileSlideCarousel } from "../../components/MobileSlideCarousel";
import { LANDING_MOBILE_MEDIA_QUERY } from "../../constants/responsive";
import { useInView } from "../../hooks/useInView";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import classes from "../sections.module.css";
import {
  OPS_DAY_REPORT_ITEMS,
  OPS_PRIMARY_METRICS,
  OPS_PROGRESS_BARS,
  OPS_SECONDARY_STATS,
} from "./operations-summary-data";
import { useDemoCountUp } from "./useDemoCountUp";

function formatMetric(
  metric: (typeof OPS_PRIMARY_METRICS)[number],
  raw: number,
): string {
  if (metric.format === "percent") {
    return `${raw}%`;
  }
  return String(raw);
}

export function OperationsSummaryDashboard() {
  const reducedMotion = usePrefersReducedMotion();
  const isMobile = useMediaQuery(LANDING_MOBILE_MEDIA_QUERY);
  const [mobileSlide, setMobileSlide] = useState(0);
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.2, once: true });
  const animate = inView && !reducedMotion;

  const metricsInView = inView && (!isMobile || mobileSlide === 0);
  const barsInView = inView && (!isMobile || mobileSlide === 1);
  const reportInView = inView && (!isMobile || mobileSlide === 2);

  const servicesToday = useDemoCountUp(12, metricsInView, reducedMotion);
  const coverage = useDemoCountUp(92, metricsInView, reducedMotion);
  const attendance = useDemoCountUp(96, metricsInView, reducedMotion);
  const lateArrivals = useDemoCountUp(2, metricsInView, reducedMotion);

  const metricValues: Record<string, number> = {
    "services-today": servicesToday,
    coverage,
    attendance,
    "late-arrivals": lateArrivals,
  };

  const metricsBlock = (
    <div className={classes.opsSummaryMetrics}>
      {OPS_PRIMARY_METRICS.map((metric) => (
        <div key={metric.id} className={classes.opsSummaryMetric}>
          <span className={classes.opsSummaryMetricValue}>
            {formatMetric(metric, metricValues[metric.id] ?? 0)}
          </span>
          <span className={classes.opsSummaryMetricLabel}>{metric.label}</span>
        </div>
      ))}
    </div>
  );

  const barsBlock = (
    <div className={classes.opsSummaryBars}>
      {OPS_PROGRESS_BARS.map((bar) => (
        <div key={bar.id} className={classes.opsSummaryBarRow}>
          <div className={classes.opsSummaryBarHead}>
            <span>{bar.label}</span>
            <span>{bar.display}</span>
          </div>
          <div className={classes.opsSummaryBarTrack}>
            <span
              className={classes.opsSummaryBarFill}
              data-tone={bar.tone}
              data-active={barsInView ? "true" : "false"}
              style={{ "--ops-bar-ratio": String(bar.ratio) } as CSSProperties}
            />
          </div>
        </div>
      ))}
    </div>
  );

  const secondaryBlock = (
    <ul className={classes.opsSummarySecondary}>
      {OPS_SECONDARY_STATS.map((stat) => (
        <li key={stat.id}>
          <span className={classes.opsSummarySecondaryValue}>{stat.value}</span>
          <span className={classes.opsSummarySecondaryLabel}>{stat.label}</span>
        </li>
      ))}
    </ul>
  );

  const reportBlock = (
    <ul className={classes.opsSummaryReportList}>
      {OPS_DAY_REPORT_ITEMS.map((item) => (
        <li
          key={item.id}
          className={classes.opsSummaryReportItem}
          data-slide-active={reportInView ? "true" : "false"}
        >
          <span className={classes.opsSummaryReportDot} data-tone={item.tone} aria-hidden="true" />
          <div>
            <p className={classes.opsSummaryReportTitle}>{item.title}</p>
            <p className={classes.opsSummaryReportDetail}>{item.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  );

  return (
    <div
      ref={ref}
      className={classes.opsSummaryDashboard}
      data-in-view={inView ? "true" : "false"}
      data-animate={animate ? "true" : "false"}
      data-reduced={reducedMotion ? "true" : "false"}
      data-mobile-layout={isMobile ? "carousel" : "dashboard"}
      aria-hidden="true"
    >
      <div className={classes.opsSummaryDesktop}>
        <div className={classes.opsSummaryLayout}>
          <div className={classes.opsSummaryMain}>
            <p className={classes.opsSummaryPanelLabel}>Resumen operativo</p>
            {metricsBlock}
            {barsBlock}
            {secondaryBlock}
          </div>

          <aside className={classes.opsSummaryReport}>
            <p className={classes.opsSummaryPanelLabel}>Reporte del día</p>
            {reportBlock}
          </aside>
        </div>
      </div>

      {isMobile ? (
        <MobileSlideCarousel
          ariaLabel="Resumen de operación"
          activeIndex={mobileSlide}
          onActiveIndexChange={setMobileSlide}
          slideCount={3}
          testId="ops-summary-mobile-carousel"
        >
          <div className={classes.opsSummaryMobileSlide}>
            <p className={classes.opsSummaryPanelLabel}>Resumen operativo</p>
            {metricsBlock}
            {secondaryBlock}
          </div>
          <div className={classes.opsSummaryMobileSlide}>
            <p className={classes.opsSummaryPanelLabel}>Indicadores</p>
            {barsBlock}
          </div>
          <div className={classes.opsSummaryMobileSlide}>
            <p className={classes.opsSummaryPanelLabel}>Reporte del día</p>
            {reportBlock}
          </div>
        </MobileSlideCarousel>
      ) : null}
    </div>
  );
}
