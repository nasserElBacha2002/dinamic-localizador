export const logAuditSafe = async (
  label: string,
  action: () => Promise<void>,
): Promise<void> => {
  try {
    await action();
  } catch (error) {
    console.error(`[audit-post-commit] ${label}`, error);
  }
};
