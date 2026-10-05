import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { HomeAttentionViewModel } from "./home-dashboard-attention";
import {
  buildHomeAttentionSummary,
  flattenHomeAttentionRows,
} from "./home-dashboard-attention-presentation";

const emptyModel: HomeAttentionViewModel = {
  globalIssues: [],
  operationGroups: [],
  employees: [],
  isEmpty: true,
  truncatedGlobalIssues: false,
  truncatedIncidentDetails: false,
  truncatedEmployees: false,
};

describe("home attention presentation", () => {
  it("flattens grouped issues into prioritized rows", () => {
    const model: HomeAttentionViewModel = {
      ...emptyModel,
      isEmpty: false,
      globalIssues: [
        {
          id: "late",
          severity: "medium",
          sortWeight: 200,
          title: "Llegadas tarde",
          detail: "2 en el día",
          href: "/attendance",
        },
      ],
      operationGroups: [
        {
          operationId: "op-1",
          serviceName: "Operación 173",
          serviceAddress: null,
          maxSeverity: "high",
          sortWeight: 300,
          operationHref: "/operations/op-1",
          issues: [
            {
              id: "inc-1",
              severity: "high",
              sortWeight: 300,
              title: "Sin fichaje",
              detail: "Kike Mercado",
              href: "/statistics",
            },
          ],
        },
      ],
    };

    const rows = flattenHomeAttentionRows(model);
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.title, "Sin fichaje");
    assert.match(rows[0]?.subtitle ?? "", /Kike Mercado/);
    assert.match(rows[0]?.subtitle ?? "", /Operación 173/);
  });

  it("builds compact summary text", () => {
    const model: HomeAttentionViewModel = {
      ...emptyModel,
      isEmpty: false,
      globalIssues: [
        {
          id: "a",
          severity: "high",
          sortWeight: 300,
          title: "Ausencias",
          href: "/attendance",
        },
      ],
      operationGroups: [
        {
          operationId: "op-1",
          serviceName: "S1",
          serviceAddress: null,
          maxSeverity: "high",
          sortWeight: 300,
          operationHref: "/operations/op-1",
          issues: [],
        },
      ],
    };
    assert.equal(buildHomeAttentionSummary(model), "1 operación afectada · 1 alerta visible");
  });

  it("does not claim duplicate global and operation rows are distinct situations", () => {
    const model: HomeAttentionViewModel = {
      ...emptyModel,
      isEmpty: false,
      globalIssues: [
        {
          id: "global-absence",
          severity: "high",
          sortWeight: 300,
          title: "Ausencia no justificada",
          detail: "1 en el día",
          href: "/attendance",
        },
      ],
      operationGroups: [
        {
          operationId: "op-1",
          serviceName: "Operación 173",
          serviceAddress: null,
          maxSeverity: "high",
          sortWeight: 300,
          operationHref: "/operations/op-1",
          issues: [
            {
              id: "op-inc-1",
              severity: "high",
              sortWeight: 300,
              title: "Sin confirmar",
              detail: "Kike Mercado",
              href: "/statistics",
            },
          ],
        },
      ],
      employees: [
        {
          employeeId: "emp-1",
          employeeName: "Kike Mercado",
          severity: "high",
          primaryIncidentLabel: "Ausencia no justificada",
          href: "/statistics/employee",
          incidentCount: 1,
        },
      ],
    };

    const summary = buildHomeAttentionSummary(model);
    assert.equal(flattenHomeAttentionRows(model).length, 3);
    assert.match(summary, /3 alertas visibles/);
    assert.match(summary, /1 operación afectada/);
    assert.doesNotMatch(summary, /situaci[oó]n/i);
  });
});
