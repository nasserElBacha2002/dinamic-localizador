import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, describe, it } from "node:test";
import React from "react";
import { CompanySwitcher } from "./CompanySwitcher";
import { ENTITY_AVATAR_BRAND_TONE, ENTITY_AVATAR_SIZE_PX } from "../components/entity-avatar.constants";
import { renderPage } from "../../test/render-page";
import type { CompanyContextValue } from "../../context/company-context";

afterEach(() => {
  cleanup();
});

const multiCompany: Partial<CompanyContextValue> = {
  companies: [
    {
      companyId: "co-1",
      companyName: "Empresa Activa Con Nombre Extremadamente Largo SA",
      role: "ADMIN",
      isDefault: true,
      status: "ACTIVE",
    },
    {
      companyId: "co-2",
      companyName: "Otra Empresa",
      role: "OPERATOR",
      isDefault: false,
      status: "ACTIVE",
    },
  ],
  activeCompany: {
    companyId: "co-1",
    companyName: "Empresa Activa Con Nombre Extremadamente Largo SA",
    role: "ADMIN",
    isDefault: true,
    status: "ACTIVE",
  },
};

describe("CompanySwitcher entity avatar", () => {
  it("renders the active company with brand tone and 32px avatar", () => {
    const view = renderPage(<CompanySwitcher />);
    assert.ok(view.getByText("Empresa activa"));
    assert.ok(view.getByText("Empresa Test"));
    const avatar = view.container.querySelector("[data-entity-avatar='company']") as HTMLElement;
    assert.equal(avatar.textContent, "E");
    assert.equal(avatar.style.width, `${ENTITY_AVATAR_SIZE_PX.sm}px`);
    assert.equal(avatar.style.background, ENTITY_AVATAR_BRAND_TONE.background);
  });

  it("keeps 32px brand avatar in compact mode", () => {
    const view = renderPage(<CompanySwitcher compact />);
    assert.equal(view.queryByText("Empresa activa"), null);
    const avatar = view.container.querySelector("[data-entity-avatar='company']") as HTMLElement;
    assert.equal(avatar.style.width, `${ENTITY_AVATAR_SIZE_PX.sm}px`);
    assert.equal(avatar.style.background, ENTITY_AVATAR_BRAND_TONE.background);
  });

  it("opens the company menu and preserves selection interaction", async () => {
    let selected: string | null = null;
    const view = renderPage(<CompanySwitcher />, {
      company: {
        ...multiCompany,
        selectCompany: (companyId: string) => {
          selected = companyId;
        },
      },
    });

    fireEvent.click(view.getByRole("button", { name: "Cambiar empresa activa" }));
    await waitFor(() => {
      assert.ok(within(document.body).getByText("Otra Empresa"));
    });

    fireEvent.click(within(document.body).getByText("Otra Empresa"));
    await waitFor(() => {
      assert.equal(selected, "co-2");
    });
  });
});
