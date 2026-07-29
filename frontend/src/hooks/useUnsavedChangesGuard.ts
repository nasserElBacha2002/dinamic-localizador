import { useEffect } from "react";

export interface UseUnsavedChangesGuardOptions {
  /**
   * When true, registers `beforeunload` for browser refresh/close/tab leave.
   */
  enabled: boolean;
  /**
   * Custom browser prompt message. Most browsers ignore custom text and show a generic dialog.
   */
  message?: string;
}

const DEFAULT_MESSAGE =
  "Tenés cambios sin guardar. Si salís ahora, se perderán.";

/**
 * Progressive unsaved-changes guard for edit forms.
 *
 * **Current support (BrowserRouter):**
 * - Browser leave/refresh/close via `beforeunload`.
 *
 * **Not available yet:**
 * - In-app React Router navigation blocking requires a data router
 *   (`createBrowserRouter` / `RouterProvider`) so `useBlocker` can run.
 *   The app still mounts with `BrowserRouter` (`main.tsx`). When that migrates,
 *   extend this hook to call `useBlocker(enabled)` without changing call sites.
 *
 * Mount only on edit surfaces; do not enable globally.
 */
export function useUnsavedChangesGuard({
  enabled,
  message = DEFAULT_MESSAGE,
}: UseUnsavedChangesGuardOptions): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = message;
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [enabled, message]);
}
