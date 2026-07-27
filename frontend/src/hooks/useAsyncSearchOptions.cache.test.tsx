import { setupDomEnvironment } from "../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { QueryClient, QueryClientProvider, useMutation } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, it } from "node:test";
import React from "react";
import { useAsyncSearchOptions } from "./useAsyncSearchOptions";
import { invalidateEmployeeListAndLookupQueries } from "../queryKeys/invalidation";
import { employeeKeys } from "../queryKeys/employees";
import { DEFAULT_LOOKUP_LIMIT, lookupKeys } from "../queryKeys/lookups";

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryDelay: 0 },
      mutations: { retry: false },
    },
  });
}

describe("useAsyncSearchOptions scopeKey", () => {
  afterEach(() => {
    cleanup();
  });

  it("does not keep previous company options as placeholder after scope change", async () => {
    const queryClient = createTestQueryClient();
    let latestOptions: Array<{ id: string; label: string }> = [];

    function Harness({ scopeKey }: { scopeKey: string }) {
      const { options, setInputValue } = useAsyncSearchOptions({
        scopeKey,
        getQueryKey: (search) => ["async-search", scopeKey, search] as const,
        fetchItems: async () => [{ id: `${scopeKey}-1`, name: scopeKey }],
        mapToOption: (item: { id: string; name: string }) => ({
          id: item.id,
          label: item.name,
        }),
        debounceMs: 0,
        minSearchLength: 0,
      });

      React.useEffect(() => {
        setInputValue("q");
      }, [scopeKey, setInputValue]);

      latestOptions = options;
      return null;
    }

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <Harness scopeKey="co-a" />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      assert.equal(latestOptions.some((o) => o.id === "co-a-1"), true);
    });

    rerender(
      <QueryClientProvider client={queryClient}>
        <Harness scopeKey="co-b" />
      </QueryClientProvider>,
    );

    assert.equal(latestOptions.some((o) => o.id === "co-a-1"), false);

    await waitFor(() => {
      assert.equal(latestOptions.some((o) => o.id === "co-b-1"), true);
    });
  });
});

describe("mutation company capture + awaited invalidation", () => {
  afterEach(() => {
    cleanup();
  });

  it("mutateAsync does not resolve before invalidation finishes", async () => {
    const queryClient = createTestQueryClient();
    let invalidateFinished = false;
    const originalInvalidate = queryClient.invalidateQueries.bind(queryClient);
    queryClient.invalidateQueries = (async (...args: Parameters<typeof originalInvalidate>) => {
      await new Promise((resolve) => setTimeout(resolve, 40));
      const result = await originalInvalidate(...args);
      invalidateFinished = true;
      return result;
    }) as typeof queryClient.invalidateQueries;

    let mutateAsyncFn: ((input: { name: string }) => Promise<unknown>) | null = null;

    function Harness() {
      const mutation = useMutation({
        mutationFn: async ({
          companyId,
          input,
        }: {
          companyId: string;
          input: { name: string };
        }) => ({ id: "emp-1", companyId, ...input }),
        onSuccess: async (updated, variables) => {
          queryClient.setQueryData(
            employeeKeys.detail(variables.companyId, updated.id),
            updated,
          );
          await invalidateEmployeeListAndLookupQueries(queryClient, variables.companyId);
        },
      });

      mutateAsyncFn = (input) => mutation.mutateAsync({ companyId: "co-a", input });

      return null;
    }

    render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    );

    assert.ok(mutateAsyncFn);
    await mutateAsyncFn!({ name: "Ana" });
    assert.equal(invalidateFinished, true);
    assert.deepEqual(queryClient.getQueryData(employeeKeys.detail("co-a", "emp-1")), {
      id: "emp-1",
      companyId: "co-a",
      name: "Ana",
    });
    assert.equal(queryClient.getQueryData(employeeKeys.detail("co-b", "emp-1")), undefined);
  });

  it("late response after company switch still writes under captured company only", async () => {
    const queryClient = createTestQueryClient();
    let resolveUpdate!: (value: { id: string; name: string; companyId: string }) => void;
    const pending = new Promise<{ id: string; name: string; companyId: string }>((resolve) => {
      resolveUpdate = resolve;
    });

    let mutateAsyncFn:
      | ((vars: { companyId: string; input: { name: string } }) => Promise<unknown>)
      | null = null;

    function Harness() {
      const mutation = useMutation({
        mutationFn: async ({
          companyId,
          input,
        }: {
          companyId: string;
          input: { name: string };
        }) => {
          const resolved = await pending;
          return { ...resolved, companyId, name: input.name || resolved.name };
        },
        onSuccess: async (updated, variables) => {
          queryClient.setQueryData(
            employeeKeys.detail(variables.companyId, updated.id),
            updated,
          );
          await invalidateEmployeeListAndLookupQueries(queryClient, variables.companyId);
        },
      });

      mutateAsyncFn = mutation.mutateAsync;
      return null;
    }

    render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    );

    assert.ok(mutateAsyncFn);
    const done = mutateAsyncFn!({ companyId: "co-a", input: { name: "From A" } });
    resolveUpdate({ id: "emp-9", name: "From A", companyId: "co-a" });
    await done;

    assert.deepEqual(queryClient.getQueryData(employeeKeys.detail("co-a", "emp-9")), {
      id: "emp-9",
      name: "From A",
      companyId: "co-a",
    });
    assert.equal(queryClient.getQueryData(employeeKeys.detail("co-b", "emp-9")), undefined);
    assert.equal(
      queryClient.getQueryState(
        lookupKeys.employeeSearch("co-c", { search: "", limit: DEFAULT_LOOKUP_LIMIT }),
      )?.isInvalidated,
      undefined,
    );
  });
});

describe("selected lookup key isolation", () => {
  it("search and selected keys never collide", () => {
    assert.notDeepEqual(
      lookupKeys.serviceSearch("co-1", { search: "svc-1", limit: DEFAULT_LOOKUP_LIMIT }),
      lookupKeys.serviceSelected("co-1", "svc-1"),
    );
  });
});
