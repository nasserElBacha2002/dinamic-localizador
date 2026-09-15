import { Badge, Divider, ScrollArea, Select, Stack, Tabs, Text } from "@mantine/core";
import { useMemo, useState } from "react";
import { ResponsiveModal } from "../../design-system";
import type { OperationKind } from "../../types/operation";
import type { ScheduleMode } from "../../types/operation-shift";
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
  scheduleMode?: ScheduleMode;
  operationWorkDate: string;
  excludeEmployeeIds: string[];
  shiftOptions?: Array<{ value: string; label: string }>;
  assignLoading?: boolean;
  onAssignEmployees: (input: {
    employeeIds: string[];
    validFrom?: string;
    validUntil?: string | null;
    operationShiftId?: string | null;
    asCoverage?: boolean;
    replacedAssignmentId?: string;
    replacedEmployeeId?: string;
  }) => Promise<AssignEmployeesResult>;
  onCompleted: (message: string, severity: "success" | "error") => void;
}

export function OperationTeamManageDialog({
  opened,
  onClose,
  operationId,
  operationKind,
  scheduleMode = "SINGLE",
  operationWorkDate,
  excludeEmployeeIds,
  shiftOptions = [],
  assignLoading = false,
  onAssignEmployees,
  onCompleted,
}: OperationTeamManageDialogProps) {
  const [activeTab, setActiveTab] = useState<string | null>("individual");
  const isMultiShift = scheduleMode === "MULTI_SHIFT";
  const defaultShiftId =
    isMultiShift && shiftOptions.length === 1 ? shiftOptions[0]!.value : null;
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(defaultShiftId);
  const assignedCount = excludeEmployeeIds.length;

  const effectiveShiftId = useMemo(() => {
    if (!isMultiShift) {
      return null;
    }
    if (selectedShiftId && shiftOptions.some((option) => option.value === selectedShiftId)) {
      return selectedShiftId;
    }
    return defaultShiftId;
  }, [defaultShiftId, isMultiShift, selectedShiftId, shiftOptions]);

  const selectedShiftLabel = useMemo(
    () => shiftOptions.find((option) => option.value === effectiveShiftId)?.label ?? null,
    [shiftOptions, effectiveShiftId],
  );

  const handleClose = () => {
    setActiveTab("individual");
    onClose();
  };

  const handleAssignEmployees = async (input: {
    employeeIds: string[];
    validFrom?: string;
    validUntil?: string | null;
    operationShiftId?: string | null;
    asCoverage?: boolean;
    replacedAssignmentId?: string;
    replacedEmployeeId?: string;
  }): Promise<AssignEmployeesResult> => {
    const operationShiftId =
      input.operationShiftId ?? (isMultiShift && !input.asCoverage ? effectiveShiftId : null);

    if (isMultiShift && !input.asCoverage && !operationShiftId) {
      return {
        status: "error",
        added: [],
        skipped: [
          {
            employeeId: input.employeeIds[0] ?? "unknown",
            code: "SHIFT_REQUIRED_FOR_MULTI_SHIFT_MODE",
            reason: "Seleccioná el turno antes de asignar.",
          },
        ],
      };
    }

    return onAssignEmployees({
      ...input,
      ...(operationShiftId ? { operationShiftId } : {}),
    });
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
          {isMultiShift ? (
            <Badge color="blue" variant="light" w="fit-content">
              Multi-turno · elegí el turno al asignar
            </Badge>
          ) : null}
        </Stack>

        {isMultiShift ? (
          <Select
            label="Turno"
            description="Obligatorio. Aplica a recomendaciones de IA, asignación manual y grupos."
            data={shiftOptions}
            value={effectiveShiftId}
            onChange={setSelectedShiftId}
            placeholder={
              shiftOptions.length === 0 ? "No hay turnos activos" : "Seleccioná el turno"
            }
            required
            disabled={shiftOptions.length === 0 || assignLoading}
            error={
              !effectiveShiftId && shiftOptions.length > 0
                ? "Seleccioná un turno para continuar"
                : undefined
            }
          />
        ) : null}

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
                scheduleMode={scheduleMode}
                selectedShiftId={effectiveShiftId}
                selectedShiftLabel={selectedShiftLabel}
                excludeEmployeeIds={excludeEmployeeIds}
                enabled={opened && activeTab === "individual"}
                assignLoading={assignLoading}
                onAssign={handleAssignEmployees}
                onSeeMore={() => setActiveTab("ai")}
              />
              <Divider label="O agregá manualmente" labelPosition="center" />
              <OperationIndividualAssignmentPanel
                key={`${operationKind}:${operationWorkDate}:${scheduleMode}`}
                operationKind={operationKind}
                scheduleMode={scheduleMode}
                operationWorkDate={operationWorkDate}
                excludeEmployeeIds={excludeEmployeeIds}
                shiftOptions={shiftOptions}
                selectedShiftId={effectiveShiftId}
                onSelectedShiftIdChange={setSelectedShiftId}
                hideShiftSelect={isMultiShift}
                loading={assignLoading}
                onAssign={handleAssignEmployees}
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
              scheduleMode={scheduleMode}
              operationWorkDate={operationWorkDate}
              shiftOptions={shiftOptions}
              selectedShiftId={effectiveShiftId}
              onSelectedShiftIdChange={setSelectedShiftId}
              hideShiftSelect={isMultiShift}
              enabled={opened && activeTab === "groups"}
              onCompleted={onCompleted}
              onFinished={handleClose}
            />
          </Tabs.Panel>

          <Tabs.Panel value="ai">
            <OperationAiRecommendationsPanel
              key={`ai:${operationKind}:${operationWorkDate}:${effectiveShiftId ?? "none"}`}
              operationId={operationId}
              operationKind={operationKind}
              scheduleMode={scheduleMode}
              selectedShiftId={effectiveShiftId}
              selectedShiftLabel={selectedShiftLabel}
              operationWorkDate={operationWorkDate}
              excludeEmployeeIds={excludeEmployeeIds}
              enabled={opened && activeTab === "ai"}
              assignLoading={assignLoading}
              onAssign={handleAssignEmployees}
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
