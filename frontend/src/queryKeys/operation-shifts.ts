export const shiftTemplateKeys = {
  lists: (companyId: string | undefined) => ["shift-templates", companyId] as const,
  list: (companyId: string | undefined, filters?: unknown) =>
    filters === undefined
      ? shiftTemplateKeys.lists(companyId)
      : ([...shiftTemplateKeys.lists(companyId), filters] as const),
};

export const operationShiftKeys = {
  lists: (companyId: string | undefined, operationId: string | undefined) =>
    ["operation-shifts", companyId, operationId] as const,
  list: (
    companyId: string | undefined,
    operationId: string | undefined,
    filters?: unknown,
  ) =>
    filters === undefined
      ? operationShiftKeys.lists(companyId, operationId)
      : ([...operationShiftKeys.lists(companyId, operationId), filters] as const),
};
