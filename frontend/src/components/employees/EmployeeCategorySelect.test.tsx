import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  configurable: true,
  value: () => undefined,
});
Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
  configurable: true,
  value: () => false,
});

import assert from "node:assert/strict";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, it } from "node:test";
import React, { useEffect } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { scopedApiClient } from "../../api/scoped-client";
import { clearActiveCompanyId, setRuntimeCompanyId } from "../../api/company-path";
import { CompanyContext } from "../../context/company-context";
import type { CompanyMembershipSummary } from "../../types/company";
import type { EmployeeCategory } from "../../types/employee-category";
import { ApiError } from "../../utils/errors";
import { EmployeeCategorySelect } from "./EmployeeCategorySelect";
import {
  shouldOfferEmployeeCategoryCreate,
} from "./employee-category-select-logic";

const activeCompany = {
  companyId: "company-1",
  companyName: "Test Co",
  role: "ADMIN",
  isDefault: true,
  status: "ACTIVE",
} satisfies CompanyMembershipSummary;

const auditor: EmployeeCategory = {
  id: "cat-auditor",
  companyId: "company-1",
  name: "Auditor",
  normalizedName: "auditor",
  isSystem: false,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const operario: EmployeeCategory = {
  id: "cat-operario",
  companyId: null,
  name: "Operario",
  normalizedName: "operario",
  isSystem: true,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

type FormValues = {
  name: string;
  categoryId: string | null;
};

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryDelay: 0 },
      mutations: { retry: false },
    },
  });
}

function CategoryFormHarness({
  canCreate = true,
  retainedCategory = null,
  defaultValues = { name: "Ana", categoryId: null as string | null },
  onValuesChange,
}: {
  canCreate?: boolean;
  retainedCategory?: { id: string; name: string } | null;
  defaultValues?: FormValues;
  onValuesChange?: (values: FormValues) => void;
}) {
  const methods = useForm<FormValues>({ defaultValues });

  useEffect(() => {
    const subscription = methods.watch((values) => {
      onValuesChange?.({
        name: String(values.name ?? ""),
        categoryId: (values.categoryId as string | null | undefined) ?? null,
      });
    });
    return () => subscription.unsubscribe();
  }, [methods, onValuesChange]);

  return (
    <FormProvider {...methods}>
      <form>
        <input aria-label="Nombre colaborador" {...methods.register("name")} />
        <EmployeeCategorySelect
          control={methods.control}
          name="categoryId"
          canCreate={canCreate}
          retainedCategory={retainedCategory}
        />
      </form>
    </FormProvider>
  );
}

function renderSelect(options: {
  canCreate?: boolean;
  retainedCategory?: { id: string; name: string } | null;
  defaultValues?: FormValues;
  onValuesChange?: (values: FormValues) => void;
} = {}) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <CompanyContext.Provider
        value={{
          companies: [activeCompany],
          activeCompany,
          isLoading: false,
          isReady: true,
          requiresSelection: false,
          hasNoCompanies: false,
          selectCompany: () => {},
          refreshCompanies: async () => {},
          clearActiveCompany: () => {},
        }}
      >
        <MantineProvider>
          <CategoryFormHarness {...options} />
        </MantineProvider>
      </CompanyContext.Provider>
    </QueryClientProvider>,
  );
}

describe("shouldOfferEmployeeCategoryCreate", () => {
  it("offers create on partial match without exact normalized match", () => {
    assert.equal(
      shouldOfferEmployeeCategoryCreate({
        input: "Audit",
        categoryNames: ["Auditor", "Operario"],
        canCreate: true,
        catalogReady: true,
        createPending: false,
      }),
      true,
    );
  });

  it("hides create on exact normalized match and when catalog is not ready", () => {
    assert.equal(
      shouldOfferEmployeeCategoryCreate({
        input: "  AUDITOR ",
        categoryNames: ["Auditor"],
        canCreate: true,
        catalogReady: true,
        createPending: false,
      }),
      false,
    );
    assert.equal(
      shouldOfferEmployeeCategoryCreate({
        input: "Audit",
        categoryNames: ["Auditor"],
        canCreate: true,
        catalogReady: false,
        createPending: false,
      }),
      false,
    );
    assert.equal(
      shouldOfferEmployeeCategoryCreate({
        input: "Audit",
        categoryNames: ["Auditor"],
        canCreate: false,
        catalogReady: true,
        createPending: false,
      }),
      false,
    );
  });
});

describe("EmployeeCategorySelect behavior", () => {
  const originalGet = scopedApiClient.get;
  const originalPost = scopedApiClient.post;
  let latestValues: FormValues = { name: "Ana", categoryId: null };

  beforeEach(() => {
    latestValues = { name: "Ana", categoryId: null };
    setRuntimeCompanyId("company-1");
    scopedApiClient.get = (async () =>
      ({
        data: { data: [operario, auditor] },
        status: 200,
        statusText: "OK",
        headers: {},
        config: {},
      }) as never);
    scopedApiClient.post = (async (_path, body) => {
      const name = String((body as { name: string }).name);
      return {
        data: {
          data: {
            id: "cat-created",
            companyId: "company-1",
            name,
            normalizedName: name.toLowerCase(),
            isSystem: false,
            isActive: true,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        },
        status: 201,
        statusText: "Created",
        headers: {},
        config: {},
      } as never;
    }) as typeof scopedApiClient.post;
  });

  afterEach(() => {
    scopedApiClient.get = originalGet;
    scopedApiClient.post = originalPost;
    clearActiveCompanyId();
    cleanup();
  });

  it("renders selector once catalog loads", async () => {
    const view = renderSelect({ canCreate: true });
    await waitFor(() => {
      assert.equal((view.getByLabelText("Categoría") as HTMLInputElement).disabled, false);
    });
    assert.ok(view.getByLabelText("Categoría"));
  });

  it("confirms inline create from create option, selects category, preserves name", async () => {
    const user = userEvent.setup({ document: globalThis.document });
    const view = renderSelect({
      canCreate: true,
      onValuesChange: (values) => {
        latestValues = values;
      },
    });

    await waitFor(() => {
      assert.equal((view.getByLabelText("Categoría") as HTMLInputElement).disabled, false);
    });

    fireEvent.change(view.getByLabelText("Nombre colaborador"), {
      target: { value: "Bruno Persistido" },
    });

    const input = view.getByLabelText("Categoría");
    await user.click(input);
    await user.clear(input);
    await user.keyboard("Nueva Cat");

    await waitFor(() => {
      assert.ok(view.getByText(/Crear categoría/));
    });
    await user.click(view.getByText(/Crear categoría/));
    assert.ok(view.getByText(/¿Crear la categoría/));
    await user.click(view.getByRole("button", { name: "Crear y seleccionar" }));

    await waitFor(() => {
      assert.equal(latestValues.categoryId, "cat-created");
    });
    assert.equal(
      (view.getByLabelText("Nombre colaborador") as HTMLInputElement).value,
      "Bruno Persistido",
    );
  });

  it("surfaces create conflict (409) without clearing form name", async () => {
    const user = userEvent.setup({ document: globalThis.document });
    scopedApiClient.post = (async () => {
      throw new ApiError(
        "Ya existe una categoría con ese nombre.",
        "EMPLOYEE_CATEGORY_NAME_ALREADY_EXISTS",
        409,
      );
    }) as typeof scopedApiClient.post;

    const view = renderSelect({
      canCreate: true,
      onValuesChange: (values) => {
        latestValues = values;
      },
    });

    await waitFor(() => {
      assert.equal((view.getByLabelText("Categoría") as HTMLInputElement).disabled, false);
    });

    fireEvent.change(view.getByLabelText("Nombre colaborador"), {
      target: { value: "Carla" },
    });

    const input = view.getByLabelText("Categoría");
    await user.click(input);
    await user.keyboard("Duplicada");
    await waitFor(() => {
      assert.ok(view.getByText(/Crear categoría/));
    });
    await user.click(view.getByText(/Crear categoría/));
    await user.click(view.getByRole("button", { name: "Crear y seleccionar" }));

    await waitFor(() => {
      assert.ok(view.getByText(/Ya existe una categoría con ese nombre/));
    });
    assert.equal((view.getByLabelText("Nombre colaborador") as HTMLInputElement).value, "Carla");
    assert.equal(latestValues.categoryId, null);
  });

  it("shows catalog error with retry and blocks create until catalog loads", async () => {
    let attempts = 0;
    scopedApiClient.get = (async () => {
      attempts += 1;
      if (attempts <= 2) {
        throw new ApiError("Fallo de catálogo", "INTERNAL_ERROR", 500);
      }
      return {
        data: { data: [operario, auditor] },
        status: 200,
        statusText: "OK",
        headers: {},
        config: {},
      } as never;
    }) as typeof scopedApiClient.get;

    const view = renderSelect({ canCreate: true });

    await waitFor(
      () => {
        assert.ok(view.getByRole("alert"));
        assert.match(view.container.textContent ?? "", /No se pudieron cargar las categorías/);
      },
      { timeout: 4000 },
    );

    assert.equal((view.getByLabelText("Categoría") as HTMLInputElement).disabled, true);

    fireEvent.click(view.getByRole("button", { name: "Reintentar" }));

    await waitFor(
      () => {
        assert.equal((view.getByLabelText("Categoría") as HTMLInputElement).disabled, false);
      },
      { timeout: 4000 },
    );
  });

  it("hides create affordance when user lacks create permission", async () => {
    const user = userEvent.setup({ document: globalThis.document });
    const view = renderSelect({ canCreate: false });
    await waitFor(() => {
      assert.equal((view.getByLabelText("Categoría") as HTMLInputElement).disabled, false);
    });

    const input = view.getByLabelText("Categoría");
    await user.click(input);
    await user.keyboard("Audit");

    await waitFor(() => {
      assert.ok(view.getByText("Auditor"));
    });
    assert.equal(view.queryByText(/Crear categoría/), null);
  });

  it("keeps inactive historical category visible and allows clearing", async () => {
    const view = renderSelect({
      canCreate: false,
      defaultValues: { name: "Ana", categoryId: "cat-inactive" },
      retainedCategory: { id: "cat-inactive", name: "Histórica" },
      onValuesChange: (values) => {
        latestValues = values;
      },
    });

    await waitFor(() => {
      assert.equal((view.getByLabelText("Categoría") as HTMLInputElement).disabled, false);
    });

    const input = view.getByLabelText("Categoría");
    fireEvent.focus(input);
    fireEvent.click(input);

    await waitFor(() => {
      assert.ok(view.getByText("Histórica"));
      assert.ok(view.getByText(/Inactiva/));
      assert.ok(view.getByText("Sin categoría"));
    });

    fireEvent.click(view.getByText("Sin categoría"));
    await waitFor(() => {
      assert.equal(latestValues.categoryId, null);
    });
  });

  it("selects an existing category from search results", async () => {
    const user = userEvent.setup({ document: globalThis.document });
    const view = renderSelect({
      onValuesChange: (values) => {
        latestValues = values;
      },
    });

    await waitFor(() => {
      assert.equal((view.getByLabelText("Categoría") as HTMLInputElement).disabled, false);
    });

    const input = view.getByLabelText("Categoría");
    await user.click(input);
    await user.keyboard("Oper");
    await waitFor(() => {
      assert.ok(view.getByText("Operario"));
    });
    await user.click(view.getByText("Operario"));

    await waitFor(() => {
      assert.equal(latestValues.categoryId, "cat-operario");
    });
  });
});
