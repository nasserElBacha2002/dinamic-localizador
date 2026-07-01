import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import {
  COMPANY_MODULES_GC_TIME_MS,
  COMPANY_MODULES_STALE_TIME_MS,
  companyModulesQueryKey,
  companyModulesQueryOptions,
} from "./company-modules-query";

describe("companyModulesQueryKey", () => {
  it("scopes cache by companyId", () => {
    assert.deepEqual(companyModulesQueryKey("company-a"), ["company-modules", "company-a"]);
    assert.notDeepEqual(
      companyModulesQueryKey("company-a"),
      companyModulesQueryKey("company-b"),
    );
  });
});

describe("companyModulesQueryOptions", () => {
  it("uses long staleTime and disables focus refetch", () => {
    const options = companyModulesQueryOptions("company-a", true);
    assert.equal(options.staleTime, COMPANY_MODULES_STALE_TIME_MS);
    assert.equal(options.gcTime, COMPANY_MODULES_GC_TIME_MS);
    assert.equal(options.refetchOnWindowFocus, false);
    assert.equal(options.enabled, true);
    assert.deepEqual(options.queryKey, ["company-modules", "company-a"]);
  });

  it("disables query when companyId is missing", () => {
    const options = companyModulesQueryOptions(undefined, true);
    assert.equal(options.enabled, false);
  });
});

describe("company modules React Query cache", () => {
  const testQueryOptions = (companyId: string) => ({
    ...companyModulesQueryOptions(companyId, true),
    gcTime: 0,
  });

  it("reuses cached modules for the same company while data is fresh", async () => {
    let fetchCount = 0;
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });

    const baseOptions = {
      ...testQueryOptions("company-a"),
      queryFn: async () => {
        fetchCount += 1;
        return [{ moduleKey: "attendance", isEnabled: true }];
      },
    };

    await queryClient.fetchQuery(baseOptions);
    await queryClient.fetchQuery(baseOptions);

    assert.equal(fetchCount, 1);
    queryClient.clear();
  });

  it("fetches again for a different companyId", async () => {
    let fetchCount = 0;
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });

    const queryFn = async () => {
      fetchCount += 1;
      return [];
    };

    await queryClient.fetchQuery({
      ...testQueryOptions("company-a"),
      queryFn,
    });
    await queryClient.fetchQuery({
      ...testQueryOptions("company-b"),
      queryFn,
    });

    assert.equal(fetchCount, 2);
    queryClient.clear();
  });

  it("refetches after invalidation", async () => {
    let fetchCount = 0;
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });

    const options = {
      ...testQueryOptions("company-a"),
      queryFn: async () => {
        fetchCount += 1;
        return [];
      },
    };

    await queryClient.fetchQuery(options);
    await queryClient.invalidateQueries({ queryKey: companyModulesQueryKey("company-a") });
    await queryClient.fetchQuery(options);

    assert.equal(fetchCount, 2);
    queryClient.clear();
  });
});

describe("useCompanyModules hook wiring", () => {
  it("configures company-scoped cache in the hook", () => {
    const hooksFile = readFileSync(join(process.cwd(), "src/hooks/useCompanyModules.ts"), "utf8");
    assert.match(hooksFile, /companyModulesQueryOptions/);
    assert.match(hooksFile, /companyModulesQueryKey/);
    assert.match(hooksFile, /invalidateQueries\(\{ queryKey: companyModulesQueryKey\(companyId\) \}\)/);
  });
});
