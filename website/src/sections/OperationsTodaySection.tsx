import { SectionCtaBand } from "../components/SectionCtaBand";
import shared from "../styles/landing-shared.module.css";
import { OperationsSummaryDashboard } from "./operations/OperationsSummaryDashboard";
import classes from "./sections.module.css";

export function OperationsTodaySection() {
  return (
    <section
      id="operations-today"
      className={`${shared.section} ${classes.operationsToday} ${shared.centered}`}
      aria-labelledby="operations-today-title"
      data-testid="operations-summary-section"
    >
      <div className={shared.sectionInner}>
        <div className={classes.operationsTodayIntro}>
          <h2 id="operations-today-title" className={`${shared.title} ${classes.operationsTodayTitle}`}>
            Toda la operación, en una sola vista.
          </h2>
          <p className={classes.operationsTodayLead}>
            Entendé el estado de tu operación de un vistazo, con métricas, incidencias y reportes listos para
            actuar.
          </p>
        </div>
        <OperationsSummaryDashboard />
        <SectionCtaBand
          testId="cta-post-analytics"
          tone="dark"
          title="Pasá de reaccionar a tener visibilidad."
          description="Centralizá el estado de tus servicios, incidencias y rendimiento operativo."
          primary={{
            label: "Conocer Dinamic Operations",
            href: "#como-funciona",
            trackLocation: "analytics",
            trackEvent: "how_it_works",
          }}
        />
      </div>
    </section>
  );
}
