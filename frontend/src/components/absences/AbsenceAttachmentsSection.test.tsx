import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import { mockApiModule, ABSENCES_API_EXPORTS } from "../../test/mock-api-module";
import { setRuntimeCompanyId } from "../../api/company-path";
import { installLayoutPolyfills } from "../../test/layout-polyfills";

setRuntimeCompanyId("co-1");
installLayoutPolyfills();

const REQUEST_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

mockApiModule(
  "api/absences.api",
  {
    getAbsenceTypes: async () => [],
    getAbsenceRequests: async () => ({
      data: [],
      meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
    }),
    getAbsenceRequestById: async () => {
      throw new Error("not used");
    },
    listAbsenceAttachments: async () => [],
  },
  ABSENCES_API_EXPORTS,
);

import assert from "node:assert/strict";
import { cleanup, waitFor } from "@testing-library/react";
import { afterEach, describe, it } from "node:test";
import React from "react";
import { renderPage, clearActiveTestQueryClients } from "../../test/render-page";
import { AbsenceAttachmentsSection } from "./AbsenceAttachmentsSection";

afterEach(() => {
  cleanup();
  clearActiveTestQueryClients();
});

describe("AbsenceAttachmentsSection permissions", () => {
  it("shows unavailable message when view is disabled instead of empty attachments", async () => {
    const view = renderPage(
      <AbsenceAttachmentsSection
        requestId={REQUEST_ID}
        requestStatus="PENDING"
        attachmentPolicy="OPTIONAL"
        canView={false}
        canManage={false}
        variant="embedded"
      />,
    );

    await waitFor(() => {
      assert.match(
        view.container.textContent ?? "",
        /no está disponible con tus permisos actuales/i,
      );
    });
    assert.doesNotMatch(view.container.textContent ?? "", /No hay documentación adjunta/i);
  });
});
