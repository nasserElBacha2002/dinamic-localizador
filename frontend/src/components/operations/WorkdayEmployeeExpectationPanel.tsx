import { Alert, Button, Stack, Text } from "@mantine/core";
import { Link as RouterLink } from "react-router-dom";
import { StatusBadge } from "../../design-system/components/StatusBadge";
import type { OperationWorkdayEmployeeSummary } from "../../types/operation-workday";
import { formatDate } from "../../utils/dates";
import {
  employeeWorkdayStateLabels,
  employeeWorkdayStateTones,
} from "./operation-workday-display";

interface WorkdayEmployeeExpectationPanelProps {
  employee: OperationWorkdayEmployeeSummary;
}

export function WorkdayEmployeeExpectationPanel({ employee }: WorkdayEmployeeExpectationPanelProps) {
  return (
    <Stack gap={4}>
      <StatusBadge
        label={employeeWorkdayStateLabels[employee.effectiveState]}
        tone={employeeWorkdayStateTones[employee.effectiveState]}
        variant="light"
      />
      {employee.absenceContext && employee.effectiveState === "JUSTIFIED" ? (
        <Text size="xs" c="dimmed">
          {employee.absenceContext.absenceTypeName}
          {" · "}
          {formatDate(employee.absenceContext.absenceStartDate)} →{" "}
          {formatDate(employee.absenceContext.absenceEndDate)}
          {employee.absenceContext.absenceRequestId ? (
            <>
              {" · "}
              <Button
                component={RouterLink}
                to={`/absences/${employee.absenceContext.absenceRequestId}`}
                variant="subtle"
                size="compact-xs"
                p={0}
                h="auto"
              >
                Ver ausencia
              </Button>
            </>
          ) : null}
        </Text>
      ) : null}
      {employee.hasAttendanceConflict ? (
        <Alert color="yellow" p="xs">
          Existe una asistencia registrada para esta jornada. La ausencia aprobada no modificó
          automáticamente el registro.
        </Alert>
      ) : null}
    </Stack>
  );
}
