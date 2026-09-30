import { createContext, createElement, useContext, type ReactNode } from "react";

/**
 * Marks content rendered inside a desktop DataTable cell.
 *
 * Entity references in a table are informational: their click belongs to the
 * row, while entity navigation remains available in non-table contexts.
 */
const TableEntityReferenceContext = createContext(false);

export function TableEntityReferenceProvider({ children }: { children: ReactNode }) {
  return createElement(
    TableEntityReferenceContext.Provider,
    { value: true },
    children,
  );
}

export function useIsTableEntityReference(): boolean {
  return useContext(TableEntityReferenceContext);
}
