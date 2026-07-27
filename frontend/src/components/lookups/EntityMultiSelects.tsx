import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  EntityMultiSelect,
  type EntityMultiSelectOption,
  type EntityMultiSelectProps,
} from "../common/EntityMultiSelect";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useOperationalQueryEnabled } from "../../hooks/useOperationalQueryEnabled";
import {
  DEFAULT_LOOKUP_LIMIT,
  LOOKUP_STALE_TIME_MS,
  lookupKeys,
} from "../../queryKeys/lookups";
import { getEmployeeLookups, getOperationLookups, getServiceLookups } from "../../api/lookups.api";
import { terminology } from "../../domain/terminology";
import { formatDateTime } from "../../utils/dates";
import { MAX_MULTI_FILTER_IDS } from "../../utils/multi-value-filter";

type SharedMultiProps = Omit<
  EntityMultiSelectProps,
  "options" | "selectedOptions" | "inputValue" | "onInputChange" | "loading"
> & {
  activeOnly?: boolean;
  excludeIds?: string[];
  /** Clear selected chips when company scope changes. Default true. */
  clearValueOnCompanyChange?: boolean;
};

function orderByIds(options: EntityMultiSelectOption[], ids: string[]): EntityMultiSelectOption[] {
  const byId = new Map(options.map((option) => [option.value, option]));
  return ids
    .map((id) => byId.get(id))
    .filter((option): option is EntityMultiSelectOption => Boolean(option));
}

function useRemoteMultiSelectOptions(params: {
  companyId: string | undefined;
  enabled: boolean;
  queryKeyBase: readonly unknown[];
  selectedKeyBase: readonly unknown[];
  fetchSearch: (search: string, signal: AbortSignal) => Promise<EntityMultiSelectOption[]>;
  fetchSelected: (ids: string[], signal: AbortSignal) => Promise<EntityMultiSelectOption[]>;
  value: string[];
  onChange?: (value: string[]) => void;
  clearValueOnCompanyChange?: boolean;
  debounceMs?: number;
}) {
  const [inputValue, setInputValue] = useState("");
  const debounced = useDebouncedValue(inputValue, params.debounceMs ?? 300);
  const trimmed = debounced.trim();

  const previousCompanyIdRef = useRef(params.companyId);
  const onChangeRef = useRef(params.onChange);
  onChangeRef.current = params.onChange;
  const clearOnCompanyChange = params.clearValueOnCompanyChange !== false;
  const hasValue = params.value.length > 0;

  useEffect(() => {
    const previousCompanyId = previousCompanyIdRef.current;
    if (previousCompanyId === params.companyId) {
      return;
    }
    previousCompanyIdRef.current = params.companyId;
    setInputValue("");
    if (previousCompanyId !== undefined && clearOnCompanyChange && hasValue) {
      onChangeRef.current?.([]);
    }
  }, [params.companyId, clearOnCompanyChange, hasValue]);

  const searchQuery = useQuery({
    queryKey: [...params.queryKeyBase, trimmed] as const,
    queryFn: ({ signal }) => params.fetchSearch(trimmed, signal),
    enabled: params.enabled,
    staleTime: LOOKUP_STALE_TIME_MS,
    placeholderData: (previousData, previousQuery) => {
      if (previousQuery?.meta?.scopeKey !== params.companyId) {
        return undefined;
      }
      return previousData;
    },
    meta: { scopeKey: params.companyId },
  });

  const missingIds = useMemo(() => {
    const known = new Set((searchQuery.data ?? []).map((item) => item.value));
    return params.value.filter((id) => !known.has(id)).slice(0, MAX_MULTI_FILTER_IDS);
  }, [params.value, searchQuery.data]);

  const selectedQuery = useQuery({
    queryKey: [...params.selectedKeyBase, missingIds.join(",")] as const,
    queryFn: ({ signal }) => params.fetchSelected(missingIds, signal),
    enabled: params.enabled && missingIds.length > 0,
    staleTime: LOOKUP_STALE_TIME_MS,
    placeholderData: (previousData, previousQuery) => {
      if (previousQuery?.meta?.scopeKey !== params.companyId) {
        return undefined;
      }
      return previousData;
    },
    meta: { scopeKey: params.companyId },
  });

  const selectedFromSearch = (searchQuery.data ?? []).filter((option) =>
    params.value.includes(option.value),
  );
  const selectedHydrated = orderByIds(selectedQuery.data ?? [], missingIds);

  return {
    inputValue,
    setInputValue,
    options: searchQuery.data ?? [],
    selectedOptions: [...selectedFromSearch, ...selectedHydrated],
    loading: searchQuery.isFetching || selectedQuery.isFetching,
  };
}

export function EmployeeMultiSelect({
  activeOnly = true,
  excludeIds = [],
  clearValueOnCompanyChange,
  ...props
}: SharedMultiProps) {
  const { companyId, enabled } = useOperationalQueryEnabled();
  const excludeKey = excludeIds.join(",");

  const remote = useRemoteMultiSelectOptions({
    companyId,
    enabled,
    clearValueOnCompanyChange,
    onChange: props.onChange,
    queryKeyBase: [
      ...lookupKeys.employeeSearch(companyId, {
        search: "",
        activeOnly,
        limit: DEFAULT_LOOKUP_LIMIT,
      }),
      "multi",
      excludeKey,
    ],
    selectedKeyBase: [...lookupKeys.employeeCompany(companyId), "multi-selected"],
    value: props.value,
    fetchSearch: async (search, signal) => {
      const rows = await getEmployeeLookups(
        {
          search: search || undefined,
          limit: DEFAULT_LOOKUP_LIMIT,
          active: activeOnly ? true : undefined,
        },
        { signal },
      );
      const excluded = new Set(excludeIds);
      return rows
        .filter((row) => !excluded.has(row.id))
        .map((row) => ({ value: row.id, label: row.fullName }));
    },
    fetchSelected: async (ids, signal) => {
      if (ids.length === 0) {
        return [];
      }
      const rows = await getEmployeeLookups(
        {
          ids,
          limit: Math.min(ids.length, MAX_MULTI_FILTER_IDS),
        },
        { signal },
      );
      return orderByIds(
        rows.map((row) => ({ value: row.id, label: row.fullName })),
        ids,
      );
    },
  });

  return (
    <EntityMultiSelect
      {...props}
      options={remote.options}
      selectedOptions={remote.selectedOptions}
      inputValue={remote.inputValue}
      onInputChange={remote.setInputValue}
      loading={remote.loading}
      placeholder={props.placeholder ?? `Nombre del ${terminology.worker.singular.toLowerCase()}`}
      selectionSummaryLabel={props.selectionSummaryLabel ?? terminology.worker.plural.toLowerCase()}
    />
  );
}

export function ServiceMultiSelect({
  activeOnly = true,
  clearValueOnCompanyChange,
  ...props
}: SharedMultiProps) {
  const { companyId, enabled } = useOperationalQueryEnabled();

  const remote = useRemoteMultiSelectOptions({
    companyId,
    enabled,
    clearValueOnCompanyChange,
    onChange: props.onChange,
    queryKeyBase: [
      ...lookupKeys.serviceSearch(companyId, {
        search: "",
        activeOnly,
        limit: DEFAULT_LOOKUP_LIMIT,
      }),
      "multi",
    ],
    selectedKeyBase: [...lookupKeys.serviceCompany(companyId), "multi-selected"],
    value: props.value,
    fetchSearch: async (search, signal) => {
      const rows = await getServiceLookups(
        {
          search: search || undefined,
          limit: DEFAULT_LOOKUP_LIMIT,
          active: activeOnly ? true : undefined,
        },
        { signal },
      );
      return rows.map((row) => ({
        value: row.id,
        label: row.name,
        description: row.address ?? undefined,
      }));
    },
    fetchSelected: async (ids, signal) => {
      if (ids.length === 0) {
        return [];
      }
      const rows = await getServiceLookups(
        {
          ids,
          limit: Math.min(ids.length, MAX_MULTI_FILTER_IDS),
        },
        { signal },
      );
      return orderByIds(
        rows.map((row) => ({
          value: row.id,
          label: row.name,
          description: row.address ?? undefined,
        })),
        ids,
      );
    },
  });

  return (
    <EntityMultiSelect
      {...props}
      options={remote.options}
      selectedOptions={remote.selectedOptions}
      inputValue={remote.inputValue}
      onInputChange={remote.setInputValue}
      loading={remote.loading}
      placeholder={props.placeholder ?? "Nombre o dirección del servicio"}
      selectionSummaryLabel={props.selectionSummaryLabel ?? terminology.service.plural.toLowerCase()}
    />
  );
}

export function OperationMultiSelect({
  clearValueOnCompanyChange,
  ...props
}: SharedMultiProps) {
  const { companyId, enabled } = useOperationalQueryEnabled();

  const remote = useRemoteMultiSelectOptions({
    companyId,
    enabled,
    clearValueOnCompanyChange,
    onChange: props.onChange,
    queryKeyBase: [
      ...lookupKeys.operationSearch(companyId, {
        search: "",
        activeOnly: true,
        limit: DEFAULT_LOOKUP_LIMIT,
      }),
      "multi",
    ],
    selectedKeyBase: [...lookupKeys.operationCompany(companyId), "multi-selected"],
    value: props.value,
    fetchSearch: async (search, signal) => {
      const rows = await getOperationLookups(
        {
          search: search || undefined,
          limit: DEFAULT_LOOKUP_LIMIT,
        },
        { signal },
      );
      return rows.map((row) => ({
        value: row.id,
        label: `${row.serviceName} · ${formatDateTime(row.startDate)}`,
        description: row.endDate ? formatDateTime(row.endDate) : undefined,
      }));
    },
    fetchSelected: async (ids, signal) => {
      if (ids.length === 0) {
        return [];
      }
      const rows = await getOperationLookups(
        {
          ids,
          limit: Math.min(ids.length, MAX_MULTI_FILTER_IDS),
        },
        { signal },
      );
      return orderByIds(
        rows.map((row) => ({
          value: row.id,
          label: `${row.serviceName} · ${formatDateTime(row.startDate)}`,
          description: row.endDate ? formatDateTime(row.endDate) : undefined,
        })),
        ids,
      );
    },
  });

  return (
    <EntityMultiSelect
      {...props}
      options={remote.options}
      selectedOptions={remote.selectedOptions}
      inputValue={remote.inputValue}
      onInputChange={remote.setInputValue}
      loading={remote.loading}
      placeholder={
        props.placeholder ??
        `${terminology.service.singular} o fecha de la ${terminology.operation.singular.toLowerCase()}`
      }
      selectionSummaryLabel={
        props.selectionSummaryLabel ?? terminology.operation.plural.toLowerCase()
      }
    />
  );
}
