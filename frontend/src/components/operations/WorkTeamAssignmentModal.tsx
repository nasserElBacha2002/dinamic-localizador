import { Modal } from "@mantine/core";
import type { OperationKind } from "../../types/operation";
import { WorkTeamAssignmentPanel } from "./WorkTeamAssignmentPanel";

interface WorkTeamAssignmentModalProps {
  opened: boolean;
  onClose: () => void;
  operationId: string;
  operationKind: OperationKind;
  operationWorkDate: string;
  onCompleted: (message: string, severity: "success" | "error") => void;
}

export function WorkTeamAssignmentModal({
  opened,
  onClose,
  operationId,
  operationKind,
  operationWorkDate,
  onCompleted,
}: WorkTeamAssignmentModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title="Asignar desde grupos" size="lg">
      <WorkTeamAssignmentPanel
        operationId={operationId}
        operationKind={operationKind}
        operationWorkDate={operationWorkDate}
        enabled={opened}
        onCompleted={onCompleted}
        onFinished={onClose}
      />
    </Modal>
  );
}
