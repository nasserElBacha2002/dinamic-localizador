import { setupDomEnvironment } from "../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { cleanup } from "@testing-library/react";
import { afterEach, describe, it } from "node:test";
import React from "react";
import { BRAND_ISOTIPO_SRC, BRAND_LOGO_HORIZONTAL_SRC } from "../brand/brand-assets";
import { BrandLogo } from "./BrandLogo";

let renderPage: typeof import("../test/render-page").renderPage;

describe("BrandLogo", () => {
  afterEach(() => {
    cleanup();
  });

  it("renderiza lockup horizontal PNG final", async () => {
    ({ renderPage } = await import("../test/render-page"));
    const { getByLabelText } = renderPage(<BrandLogo variant="horizontal" />);
    const logo = getByLabelText("Dinamic Operations");
    assert.ok(logo.querySelector(`img[src="${BRAND_LOGO_HORIZONTAL_SRC}"]`));
  });

  it("renderiza isotipo PNG final", async () => {
    ({ renderPage } = await import("../test/render-page"));
    const { getByLabelText } = renderPage(<BrandLogo variant="isotype" />);
    assert.ok(
      getByLabelText("Dinamic Operations").querySelector(`img[src="${BRAND_ISOTIPO_SRC}"]`),
    );
  });
});
