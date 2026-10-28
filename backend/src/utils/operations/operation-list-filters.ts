/** Whether the operations list query should exclude rows with status CANCELLED. */
export function shouldExcludeCancelledOperationsFromList(query: { status?: string }): boolean {
  return !query.status;
}
