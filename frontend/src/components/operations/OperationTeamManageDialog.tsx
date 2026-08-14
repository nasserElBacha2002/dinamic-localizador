import { Badge, Divider, ScrollArea, Stack, Tabs, Text } from "@mantine/core";
import { useState } from "react";
import { ResponsiveModal } from "../../design-system";
import type { OperationKind } from "../../types/operation";
import { OperationAiRecommendationsPanel } from "./OperationAiRecommendationsPanel";
import { OperationInlineAiSuggestion } from "./OperationInlineAiSuggestion";
import {
  OperationIndividualAssignmentPanel,
  type AssignEmployeesResult,
} from "./OperationIndividualAssignmentPanel";
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
  }) => Promise<AssignEmployeesResult>;
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
  const assignedCount = excludeEmployeeIds.length;

  const handleClose = () => {
    setActiveTab("individual");
    onClose();
  };

  return (
    <ResponsiveModal
      opened={opened}
      onClose={handleClose}
      title="Administrar equipo"
      size="lg"
      bodyMode="scroll"
    >
      <Stack gap="md">
        <Stack gap={4}>
          <Text size="sm" c="dimmed">
            {assignedCount > 0
              ? `${assignedCount} colaborador${assignedCount === 1 ? "" : "es"} ya asignado${assignedCount === 1 ? "" : "s"}. La IA se adapta a ese contexto.`
              : "Todavía no hay colaboradores asignados. La IA puede sugerir por dónde empezar."}
          </Text>
          {assignedCount > 0 ? (
            <Badge color="gray" variant="light" w="fit-content">
              {assignedCount} en el equipo
            </Badge>
          ) : null}
        </Stack>

        <Tabs value={activeTab} onChange={setActiveTab}>
          <ScrollArea type="scroll" offsetScrollbars scrollbarSize={6}>
            <Tabs.List mb="md" style={{ flexWrap: "nowrap", minWidth: "max-content" }}>
              <Tabs.Tab value="individual">Individual</Tabs.Tab>
              <Tabs.Tab value="groups">Grupos</Tabs.Tab>
              <Tabs.Tab value="ai">Más sugerencias</Tabs.Tab>
            </Tabs.List>
          </ScrollArea>

          <Tabs.Panel value="individual">
            <Stack gap="md">
              <OperationInlineAiSuggestion
                operationId={operationId}
                operationKind={operationKind}
                excludeEmployeeIds={excludeEmployeeIds}
                enabled={opened && activeTab === "individual"}
                assignLoading={assignLoading}
                onAssign={onAssignEmployees}
                onSeeMore={() => setActiveTab("ai")}
              />
              <Divider
                label="O agregá manualmente"
                labelPosition="center"
              />
              <OperationIndividualAssignmentPanel
                key={`${operationKind}:${operationWorkDate}`}
                operationKind={operationKind}
                operationWorkDate={operationWorkDate}
                excludeEmployeeIds={excludeEmployeeIds}
                loading={assignLoading}
                onAssign={onAssignEmployees}
                onResult={(result) => {
                  if (result.status === "success") {
                    handleClose();
                  }
                }}
              />
            </Stack>
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

          <Tabs.Panel value="ai">
            <OperationAiRecommendationsPanel
              key={`ai:${operationKind}:${operationWorkDate}`}
              operationId={operationId}
              operationKind={operationKind}
              operationWorkDate={operationWorkDate}
              excludeEmployeeIds={excludeEmployeeIds}
              enabled={opened && activeTab === "ai"}
              assignLoading={assignLoading}
              onAssign={onAssignEmployees}
              onResult={(result) => {
                if (result.status === "success") {
                  handleClose();
                }
              }}
            />
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </ResponsiveModal>
  );
}
