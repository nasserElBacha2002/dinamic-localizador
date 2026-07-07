import { Button, Group, Stack, Text } from "@mantine/core";
import { StatusBadge } from "../../design-system/components/StatusBadge";
import type { OperationEmployeeAssignment } from "../../types/operation";
import { formatDateInputDisplay } from "../../utils/date-range";
import { getRelatedName } from "../../utils/display-safe";
import { employeeTypeLabels } from "../../utils/labels";
import {
  assignmentActionLabel,
  displayStateLabels,
  displayStateTone,
  resolveAssignmentAction,
  resolveAssignmentDisplayState,
} from "./operation-assignment-display";

export interface OperationAssignmentListProps {
  assignments: OperationEmployeeAssignment[];
  operationWorkDate: string;
  canAssign: boolean;
  cancelPending?: boolean;
  endPending?: boolean;
  onCancel: (assignment: OperationEmployeeAssignment) => void;
  onEnd: (assignment: OperationEmployeeAssignment) => void;
}

function formatValidity(assignment: OperationEmployeeAssignment): string {
  const from = formatDateInputDisplay(assignment.validFrom);
  if (!assignment.validUntil || assignment.validUntil === assignment.validFrom) {
    return from;
  }
  return `${from} — ${formatDateInputDisplay(assignment.validUntil)}`;
}

export function OperationAssignmentList({
  assignments,
  operationWorkDate,
  canAssign,
  cancelPending = false,
  endPending = false,
  onCancel,
  onEnd,
}: OperationAssignmentListProps) {
  return (
    <Stack gap={0}>
      {assignments.map((assignment) => {
        const employee = assignment.employee;
        const displayState = resolveAssignmentDisplayState(assignment);
        const action = canAssign ? resolveAssignmentAction(assignment, operationWorkDate) : null;

        return (
          <Group
            key={assignment.id}
            justify="space-between"
            align="flex-start"
            wrap="nowrap"
            py="xs"
            style={{ borderBottom: "1px solid var(--mantine-color-gray-2)" }}
          >
            <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
              <Group gap="xs" wrap="wrap">
                <Text size="sm" fw={500}>
                  {employee ? getRelatedName(employee) : "—"}
                </Text>
                <StatusBadge
                  label={displayStateLabels[displayState]}
                  tone={displayStateTone(displayState)}
                />
              </Group>
              <Text size="xs" c="dimmed">
                {employee?.employeeType ? employeeTypeLabels[employee.employeeType] : "—"} · Vigencia:{" "}
                {formatValidity(assignment)}
              </Text>
            </Stack>

            {action === "end" ? (
              <Button
                size="compact-sm"
                variant="light"
                loading={endPending}
                onClick={() => onEnd(assignment)}
              >
                {assignmentActionLabel(action)}
              </Button>
            ) : null}

            {action === "cancel-current" || action === "cancel-future" ? (
              <Button
                size="compact-sm"
                color="danger"
                variant="light"
                loading={cancelPending}
                onClick={() => onCancel(assignment)}
              >
                {assignmentActionLabel(action)}
              </Button>
            ) : null}
          </Group>
        );
      })}
    </Stack>
  );
}
