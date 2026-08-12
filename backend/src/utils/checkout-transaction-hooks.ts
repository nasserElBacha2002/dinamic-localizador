/**
 * Minimal test seam for proving checkout-without-location transaction atomicity
 * and post-commit outbound isolation.
 * Production callers never set these hooks. Cleared after each test via restore.
 */
type BeforeCommitHook = () => Promise<void>;
type AfterCommitOutboundHook = () => Promise<void>;

let checkoutWithoutLocationBeforeCommitHook: BeforeCommitHook | undefined;
let outboundPersistAfterCommitHook: AfterCommitOutboundHook | undefined;

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

/** Invoked from outbound persist path after durable work has already committed. */
export const setOutboundPersistAfterCommitHookForTests = (
  hook: AfterCommitOutboundHook | undefined,
): void => {
  outboundPersistAfterCommitHook = hook;
};

export const runOutboundPersistAfterCommitHookForTests = async (): Promise<void> => {
  if (outboundPersistAfterCommitHook) {
    await outboundPersistAfterCommitHook();
  }
};
