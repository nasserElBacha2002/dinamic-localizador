import type { HomeAttentionViewModel } from "./home-dashboard-attention";

export type HomeAttentionFlatRow = {
  id: string;
  severity: HomeAttentionViewModel["globalIssues"][number]["severity"];
  sortWeight: number;
  title: string;
  subtitle?: string;
  href: string;
};

export const HOME_ATTENTION_SCROLL_THRESHOLD = 14;

export function flattenHomeAttentionRows(model: HomeAttentionViewModel): HomeAttentionFlatRow[] {
  const rows: HomeAttentionFlatRow[] = [];

  for (const issue of model.globalIssues) {
    rows.push({
      id: issue.id,
      severity: issue.severity,
      sortWeight: issue.sortWeight,
      title: issue.title,
      subtitle: issue.detail,
      href: issue.href,
    });
  }

  for (const group of model.operationGroups) {
    for (const issue of group.issues) {
      const subtitle = [issue.detail, group.serviceName].filter(Boolean).join(" · ");
      rows.push({
        id: issue.id,
        severity: issue.severity,
        sortWeight: issue.sortWeight,
        title: issue.title,
        subtitle: subtitle || undefined,
        href: issue.href,
      });
    }
  }

  for (const employee of model.employees) {
    rows.push({
      id: `employee:${employee.employeeId}`,
      severity: employee.severity,
      sortWeight:
        employee.severity === "critical"
          ? 400
          : employee.severity === "high"
            ? 300
            : employee.severity === "medium"
              ? 200
              : 100,
      title: employee.primaryIncidentLabel ?? "Incidencias de asistencia",
      subtitle: employee.employeeName,
      href: employee.href,
    });
  }

  return rows.sort(
    (a, b) => b.sortWeight - a.sortWeight || a.title.localeCompare(b.title, "es"),
  );
}

/** Visible rows in the panel — may represent overlapping signals, not unique situations. */
export function countHomeAttentionVisibleAlerts(model: HomeAttentionViewModel): number {
  return flattenHomeAttentionRows(model).length;
}

export function buildHomeAttentionSummary(model: HomeAttentionViewModel): string {
  const visibleAlerts = countHomeAttentionVisibleAlerts(model);
  const operations = model.operationGroups.length;

  if (visibleAlerts === 0 && operations === 0) {
    return "Sin situaciones pendientes";
  }

  const parts: string[] = [];
  if (operations > 0) {
    parts.push(
      operations === 1 ? "1 operación afectada" : `${operations} operaciones afectadas`,
    );
  }
  if (visibleAlerts > 0) {
    parts.push(
      visibleAlerts === 1 ? "1 alerta visible" : `${visibleAlerts} alertas visibles`,
    );
  }
  return parts.join(" · ");
}
