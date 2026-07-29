import { useCallback, useRef, useState } from "react";
import { useUnsavedChangesGuard } from "./useUnsavedChangesGuard";

export interface UseUnsavedChangesControllerOptions {
  /**
   * When false, navigation is never blocked (create pages, transient `/:id` edit, clean forms).
   */
  active: boolean;
  message?: string;
}

export interface UseUnsavedChangesControllerResult {
  /** Form reports dirty state via this setter. */
  setDirty: (dirty: boolean) => void;
  /** Call around async submit so the guard stays off during/after success navigation. */
  setSubmitting: (submitting: boolean) => void;
  /** Clears dirty immediately (call before navigating after successful save). */
  markClean: () => void;
  /**
   * Run an in-app navigation. If dirty, opens the shared confirm dialog first.
   * Does not intercept React Router `<Link>` / sidebar clicks (requires a data router + useBlocker).
   */
  requestNavigation: (navigate: () => void) => void;
  discardDialogOpen: boolean;
  confirmDiscard: () => void;
  cancelDiscard: () => void;
  /** True when beforeunload / discard prompts should arm. */
  isArmed: boolean;
}

const DEFAULT_MESSAGE =
  "Tenés cambios sin guardar. Si salís ahora, se perderán.";

/**
 * Shared dirty-navigation controller for `/edit` pages.
 *
 * Supported:
 * - `beforeunload` (refresh / close / external leave)
 * - Explicit cancel / programmed navigations via `requestNavigation` + ConfirmDialog
 *
 * Not supported under current `BrowserRouter` (see `main.tsx`):
 * - Automatic blocking of arbitrary in-app `<Link>` / sidebar navigations (`useBlocker` needs a data router).
 */
export function useUnsavedChangesController({
  active,
  message = DEFAULT_MESSAGE,
}: UseUnsavedChangesControllerOptions): UseUnsavedChangesControllerResult {
  const [dirty, setDirty] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const pendingRef = useRef<(() => void) | null>(null);

  const isArmed = active && dirty && !submitting;

  useUnsavedChangesGuard({ enabled: isArmed, message });

  const requestNavigation = useCallback(
    (navigate: () => void) => {
      if (!isArmed) {
        navigate();
        return;
      }
      pendingRef.current = navigate;
      setDiscardDialogOpen(true);
    },
    [isArmed],
  );

  const confirmDiscard = useCallback(() => {
    const action = pendingRef.current;
    pendingRef.current = null;
    setDiscardDialogOpen(false);
    setDirty(false);
    action?.();
  }, []);

  const cancelDiscard = useCallback(() => {
    pendingRef.current = null;
    setDiscardDialogOpen(false);
  }, []);

  const markClean = useCallback(() => {
    setDirty(false);
  }, []);

  return {
    setDirty,
    setSubmitting,
    markClean,
    requestNavigation,
    discardDialogOpen,
    confirmDiscard,
    cancelDiscard,
    isArmed,
  };
}
