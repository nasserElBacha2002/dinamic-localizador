/**
 * Minimal test seam for proving checkout-without-location transaction atomicity.
 * Production callers never set this hook. Cleared after each test via restore.
 */
type BeforeCommitHook = () => Promise<void>;

let checkoutWithoutLocationBeforeCommitHook: BeforeCommitHook | undefined;

export const setCheckoutWithoutLocationBeforeCommitHookForTests = (
  hook: BeforeCommitHook | undefined,
): void => {
  checkoutWithoutLocationBeforeCommitHook = hook;
};

export const runCheckoutWithoutLocationBeforeCommitHookForTests = async (): Promise<void> => {
  if (checkoutWithoutLocationBeforeCommitHook) {
    await checkoutWithoutLocationBeforeCommitHook();
  }
};
