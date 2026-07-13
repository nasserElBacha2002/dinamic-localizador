import { Modal, Tabs } from "@mantine/core";
import { useState } from "react";
import type { OperationKind } from "../../types/operation";
import { OperationIndividualAssignmentPanel } from "./OperationIndividualAssignmentPanel";
import { WorkTeamAssignmentPanel } from "./WorkTeamAssignmentPanel";

interface OperationTeamManageDialogProps {
  opened: boolean;
  onClose: () => void;
  operationId: string;
  operationKind: OperationKind;
  operationWorkDate: string;
  excludeEmployeeIds: string[];
  assignLoading?: boolean;
  onAssignEmployees: (input: {
    employeeIds: string[];
    validFrom?: string;
    validUntil?: string | null;
  }) => Promise<void>;
  onCompleted: (message: string, severity: "success" | "error") => void;
}

export function OperationTeamManageDialog({
  opened,
  onClose,
  operationId,
  operationKind,
  operationWorkDate,
  excludeEmployeeIds,
  assignLoading = false,
  onAssignEmployees,
  onCompleted,
}: OperationTeamManageDialogProps) {
  const [activeTab, setActiveTab] = useState<string | null>("individual");

  const handleClose = () => {
    setActiveTab("individual");
    onClose();
  };

  return (
    <Modal opened={opened} onClose={handleClose} title="Administrar equipo" size="lg" centered>
      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List mb="md">
          <Tabs.Tab value="individual">Agregar individualmente</Tabs.Tab>
          <Tabs.Tab value="groups">Agregar desde grupos</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="individual">
          <OperationIndividualAssignmentPanel
            operationKind={operationKind}
            operationWorkDate={operationWorkDate}
            excludeEmployeeIds={excludeEmployeeIds}
            loading={assignLoading}
            onAssign={onAssignEmployees}
          />
        </Tabs.Panel>

        <Tabs.Panel value="groups">
          <WorkTeamAssignmentPanel
            operationId={operationId}
            operationKind={operationKind}
            operationWorkDate={operationWorkDate}
            enabled={opened && activeTab === "groups"}
            onCompleted={onCompleted}
            onFinished={handleClose}
          />
        </Tabs.Panel>
      </Tabs>
    </Modal>
  );
}
