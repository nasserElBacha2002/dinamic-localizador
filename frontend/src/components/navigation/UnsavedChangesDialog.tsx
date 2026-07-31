import { ConfirmDialog } from "../../design-system";

export interface UnsavedChangesDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

/**
 * Shared discard confirmation for edit pages. One dialog instance per page —
 * do not duplicate per form field.
 */
export function UnsavedChangesDialog({
  open,
  onConfirm,
  onCancel,
  title = "Cambios sin guardar",
  description = "Tenés cambios sin guardar. Si salís ahora, se perderán.",
  confirmLabel = "Descartar cambios",
  cancelLabel = "Continuar editando",
}: UnsavedChangesDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      destructive
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
