import { Button } from "@mantine/core";
import { ActionMenu, type ActionMenuItem } from "../../design-system";

export function AbsenceReviewActions({
  canReview,
  insufficientBalance,
  approvePending,
  onApprove,
  onNeedsInfo,
  onCancel,
  onReject,
  onBack,
}: {
  canReview: boolean;
  insufficientBalance: boolean;
  approvePending: boolean;
  onApprove: () => void;
  onNeedsInfo: () => void;
  onCancel: () => void;
  onReject: () => void;
  onBack: () => void;
}) {
  const reviewMenuItems: ActionMenuItem[] = canReview
    ? [
        {
          key: "needs-info",
          label: "Requiere información",
          onClick: onNeedsInfo,
        },
        {
          key: "cancel",
          label: "Cancelar solicitud",
          destructive: true,
          onClick: onCancel,
        },
        {
          key: "reject",
          label: "Rechazar",
          destructive: true,
          onClick: onReject,
        },
      ]
    : [];

  return (
    <ActionMenu
      primary={
        canReview ? (
          <Button
            onClick={onApprove}
            disabled={approvePending || insufficientBalance}
            loading={approvePending}
          >
            Aprobar
          </Button>
        ) : (
          <Button variant="default" onClick={onBack}>
            Volver al listado
          </Button>
        )
      }
      items={
        canReview
          ? [...reviewMenuItems, { key: "back", label: "Volver al listado", onClick: onBack }]
          : []
      }
      menuLabel="Más acciones de la solicitud"
    />
  );
}
