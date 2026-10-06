import { useState } from "react";
import shared from "../styles/landing-shared.module.css";
import classes from "./sections.module.css";

export function WhatsAppSection() {
  const [confirmed, setConfirmed] = useState(false);
  const confirmedCount = confirmed ? 5 : 4;

  return (
    <section className={`${shared.section} ${classes.whatsappSection}`} aria-labelledby="whatsapp-title">
      <div className={`${shared.sectionInner} ${classes.whatsappSplit}`}>
        <div>
          <h2 id="whatsapp-title" className={shared.title}>
            Simple para ellos.
            <br />
            Control para vos.
          </h2>
        </div>
        <div className={classes.whatsappSync}>
          <div className={classes.phone}>
            <div className={classes.bubble}>
              Mañana · Oficina Central
              <br />
              08:00–16:00
              <br />
              <br />
              ¿Confirmás?
            </div>
            <div className={classes.waActions}>
              <button
                type="button"
                className={classes.waBtn}
                data-primary="true"
                data-confirmed={confirmed ? "true" : "false"}
                onClick={() => setConfirmed(true)}
              >
                {confirmed ? "✓ Confirmado" : "Confirmar"}
              </button>
            </div>
          </div>
          <div className={classes.opsPanel} data-synced={confirmed ? "true" : "false"}>
            <p className={classes.opsPanelTitle}>Operations</p>
            <p className={classes.opsPanelMetric} data-testid="ops-confirm-metric">
              Confirmaciones <strong>{confirmedCount}/5</strong>
            </p>
            <div className={classes.opsServiceRow} data-tone={confirmed ? "ok" : "pending"} data-testid="ops-service-row">
              Oficina Central · {confirmed ? "Cubierto" : "Pendiente"}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
