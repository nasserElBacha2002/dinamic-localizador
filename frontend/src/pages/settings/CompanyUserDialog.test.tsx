import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, it } from "node:test";
import React from "react";
import { CompanyUserDialog } from "./CompanyUserDialog";
import type { CompanyUser } from "../../types/company-user";
import { resolveCompanyUserCapabilities } from "../../utils/company-role-hierarchy";
import {
  clearActiveTestQueryClients,
  renderPage,
} from "../../test/render-page";

const selfUser: CompanyUser = {
  userId: "self-1",
  name: "Yo Owner",
  email: "owner@example.com",
  phoneNumber: "+5491111111111",
  globalRole: "ADMIN",
  companyRole: "OWNER",
  membershipStatus: "ACTIVE",
  isDefault: true,
  membershipId: "m-self",
  companyId: "co-1",
  updatedAt: "2026-07-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  lastLoginAt: null,
};

const inferiorUser: CompanyUser = {
  ...selfUser,
  userId: "hr-1",
  name: "Inferior HR",
  email: "hr@example.com",
  phoneNumber: null,
  companyRole: "HR",
  isDefault: false,
  membershipId: "m-hr",
};

const peerUser: CompanyUser = {
  ...selfUser,
  userId: "peer-1",
  name: "Peer Admin",
  email: "peer@example.com",
  companyRole: "ADMIN",
  isDefault: false,
  membershipId: "m-peer",
};

afterEach(() => {
  cleanup();
  clearActiveTestQueryClients();
});

describe("CompanyUserDialog capabilities & payload", () => {
  it("self-edit sends only name/email/phone and never role/status/isDefault", async () => {
    const user = userEvent.setup({ document: globalThis.document });
    const submitted: unknown[] = [];
    const capabilities = resolveCompanyUserCapabilities({
      actorUserId: "self-1",
      actorRole: "OWNER",
      actorIsPlatformAdmin: false,
      targetUserId: selfUser.userId,
      targetRole: selfUser.companyRole,
      targetStatus: selfUser.membershipStatus,
    });

    assert.equal(capabilities.canEditProfile, true);
    assert.equal(capabilities.canChangeRole, false);
    assert.equal(capabilities.canDeactivate, false);

    const view = renderPage(
      <CompanyUserDialog
        open
        mode="edit"
        initialUser={selfUser}
        capabilities={capabilities}
        assignableRoles={["ADMIN", "HR"]}
        onClose={() => undefined}
        onSubmit={(input) => {
          submitted.push(input);
        }}
      />,
    );

    await waitFor(() => assert.ok(view.getByDisplayValue("Yo Owner")));
    await user.click(view.getByRole("button", { name: "Guardar" }));

    assert.equal(submitted.length, 1);
    const payload = submitted[0] as Record<string, unknown>;
    assert.deepEqual(payload, {
      name: "Yo Owner",
      email: "owner@example.com",
      phoneNumber: "+5491111111111",
    });
    assert.equal("role" in payload, false);
    assert.equal("status" in payload, false);
    assert.equal("isDefault" in payload, false);
    assert.equal(view.queryByRole("button", { name: "Desactivar" }), null);
  });

  it("hides Desactivar for peer/superior and shows it for inferior", () => {
    const peerCaps = resolveCompanyUserCapabilities({
      actorUserId: "admin-1",
      actorRole: "ADMIN",
      actorIsPlatformAdmin: false,
      targetUserId: peerUser.userId,
      targetRole: peerUser.companyRole,
      targetStatus: "ACTIVE",
    });
    assert.equal(peerCaps.canDeactivate, false);
    assert.equal(peerCaps.canEditProfile, false);

    const inferiorCaps = resolveCompanyUserCapabilities({
      actorUserId: "admin-1",
      actorRole: "ADMIN",
      actorIsPlatformAdmin: false,
      targetUserId: inferiorUser.userId,
      targetRole: inferiorUser.companyRole,
      targetStatus: "ACTIVE",
    });
    assert.equal(inferiorCaps.canDeactivate, true);
    assert.equal(inferiorCaps.canEditProfile, false);
  });

  it("requests deactivate without submitting the form", async () => {
    const user = userEvent.setup({ document: globalThis.document });
    let deactivateRequests = 0;
    const submitted: unknown[] = [];
    const capabilities = resolveCompanyUserCapabilities({
      actorUserId: "owner-1",
      actorRole: "OWNER",
      actorIsPlatformAdmin: false,
      targetUserId: inferiorUser.userId,
      targetRole: inferiorUser.companyRole,
      targetStatus: "ACTIVE",
    });

    const view = renderPage(
      <CompanyUserDialog
        open
        mode="edit"
        initialUser={inferiorUser}
        capabilities={capabilities}
        assignableRoles={["ADMIN", "HR", "SUPERVISOR"]}
        onClose={() => undefined}
        onSubmit={(input) => {
          submitted.push(input);
        }}
        onRequestDeactivate={() => {
          deactivateRequests += 1;
        }}
      />,
    );

    await waitFor(() => assert.ok(view.getByRole("button", { name: "Desactivar" })));
    await user.click(view.getByRole("button", { name: "Desactivar" }));
    assert.equal(deactivateRequests, 1);
    assert.equal(submitted.length, 0);
    assert.ok(view.getByDisplayValue("Activo"));
  });

  it("keeps third-party profile fields disabled for company admins", async () => {
    const capabilities = resolveCompanyUserCapabilities({
      actorUserId: "owner-1",
      actorRole: "OWNER",
      actorIsPlatformAdmin: false,
      targetUserId: inferiorUser.userId,
      targetRole: inferiorUser.companyRole,
      targetStatus: "ACTIVE",
    });

    const view = renderPage(
      <CompanyUserDialog
        open
        mode="edit"
        initialUser={inferiorUser}
        capabilities={capabilities}
        assignableRoles={["ADMIN", "HR"]}
        onClose={() => undefined}
        onSubmit={() => undefined}
      />,
    );

    await waitFor(() => assert.ok(view.getByDisplayValue("Inferior HR")));
    assert.ok((view.getByLabelText(/^Nombre/) as HTMLInputElement).disabled);
    assert.ok((view.getByLabelText(/^Email/) as HTMLInputElement).disabled);
    assert.ok((view.getByLabelText(/Teléfono WhatsApp/) as HTMLInputElement).disabled);
  });
});
