import {
  ConfirmDialog as DesignSystemConfirmDialog,
  type ConfirmDialogProps as DesignSystemConfirmDialogProps,
} from "../../design-system";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  loading = false,
  destructive = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const props: DesignSystemConfirmDialogProps = {
    open,
    title,
    description,
    confirmLabel,
    cancelLabel,
    loading,
    destructive,
    onConfirm,
    onCancel,
  };

  return <DesignSystemConfirmDialog {...props} />;
}
