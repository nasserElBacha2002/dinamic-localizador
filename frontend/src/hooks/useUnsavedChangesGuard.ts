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
 * Registers `beforeunload` while `enabled` is true.
 * Prefer {@link useUnsavedChangesController} on edit pages so cancel also confirms.
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
