import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mergeTableUrlPatch,
  parseTableUrlState,
  serializeTableUrlState,
  shouldResetTablePageForChange,
} from "./table-url-state";

describe("parseTableUrlState", () => {
  it("returns defaults when query params are empty", () => {
    const defaults = {
      search: "",
      page: 1,
      pageSize: 10,
      status: "active",
    };

    const state = parseTableUrlState({
      defaults,
      searchParams: new URLSearchParams(),
      fields: {
        status: { type: "enum", values: ["active", "inactive"] },
      },
    });

    assert.deepEqual(state, defaults);
  });

  it("parses values from the URL", () => {
    const defaults = {
      search: "",
      page: 1,
      pageSize: 10,
      status: "active",
    };

    const params = new URLSearchParams("search=carrefour&page=2&pageSize=25&status=inactive");
    const state = parseTableUrlState({
      defaults,
      searchParams: params,
      fields: {
        status: { type: "enum", values: ["active", "inactive"] },
      },
    });

    assert.equal(state.search, "carrefour");
    assert.equal(state.page, 2);
    assert.equal(state.pageSize, 25);
    assert.equal(state.status, "inactive");
  });

  it("falls back to defaults for invalid values", () => {
    const defaults = {
      page: 1,
      pageSize: 10,
      active: true,
    };

    const params = new URLSearchParams("page=abc&pageSize=0&active=maybe");
    const state = parseTableUrlState({
      defaults,
      searchParams: params,
      fields: {
        active: { type: "boolean" },
      },
    });

    assert.equal(state.page, 1);
    assert.equal(state.pageSize, 10);
    assert.equal(state.active, true);
  });
});

describe("serializeTableUrlState", () => {
  it("omits empty and default values from the URL", () => {
    const defaults = {
      search: "",
      page: 1,
      pageSize: 10,
      status: "active",
    };

    const params = serializeTableUrlState({
      defaults,
      state: {
        search: "",
        page: 1,
        pageSize: 10,
        status: "active",
      },
      fields: {
        status: { type: "enum", values: ["active", "inactive"] },
      },
    });

    assert.equal(params.toString(), "");
  });

  it("serializes active filters without dropping others", () => {
    const defaults = {
      search: "",
      page: 1,
      pageSize: 10,
      status: "active",
      serviceId: "",
    };

    const params = serializeTableUrlState({
      defaults,
      state: {
        search: "test",
        page: 2,
        pageSize: 25,
        status: "inactive",
        serviceId: "store-1",
      },
      fields: {
        status: { type: "enum", values: ["active", "inactive"] },
      },
    });

    assert.equal(params.get("search"), "test");
    assert.equal(params.get("page"), "2");
    assert.equal(params.get("pageSize"), "25");
    assert.equal(params.get("status"), "inactive");
    assert.equal(params.get("serviceId"), "store-1");
  });
});

describe("mergeTableUrlPatch", () => {
  it("resets page when a filter changes", () => {
    const defaults = {
      page: 1,
      pageSize: 10,
      search: "",
      status: "active",
    };

    const next = mergeTableUrlPatch(
      { ...defaults, page: 3 },
      { search: "carrefour" },
      defaults,
      {
        status: { type: "enum", values: ["active", "inactive"] },
      },
    );

    assert.equal(next.search, "carrefour");
    assert.equal(next.page, 1);
  });

  it("keeps page when only page changes", () => {
    const defaults = {
      page: 1,
      pageSize: 10,
      search: "",
    };

    const next = mergeTableUrlPatch({ ...defaults, page: 2 }, { page: 3 }, defaults);

    assert.equal(next.page, 3);
  });
});

describe("shouldResetTablePageForChange", () => {
  it("does not reset page for pageSize changes by default", () => {
    assert.equal(shouldResetTablePageForChange(["pageSize"]), false);
  });

  it("resets page for search and filter changes", () => {
    assert.equal(shouldResetTablePageForChange(["search"]), true);
    assert.equal(shouldResetTablePageForChange(["status"]), true);
  });
});
