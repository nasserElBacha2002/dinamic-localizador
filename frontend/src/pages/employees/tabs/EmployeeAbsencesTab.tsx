import { Stack } from "@mantine/core";
import { EmployeeAbsenceBalanceCard } from "../../../components/absences/EmployeeAbsenceBalanceCard";
import { EmployeeAbsenceHistoryTable } from "../../../components/absences/EmployeeAbsenceHistoryTable";
import { SectionCard } from "../../../design-system";

interface EmployeeAbsencesTabProps {
  employeeId: string;
  canUpdateBalance: boolean;
}

export function EmployeeAbsencesTab({ employeeId, canUpdateBalance }: EmployeeAbsencesTabProps) {
  const currentYear = new Date().getFullYear();

  return (
    <Stack gap="md">
      <SectionCard title={`Saldos ${currentYear}`}>
        <EmployeeAbsenceBalanceCard
          employeeId={employeeId}
          year={currentYear}
          showEdit={canUpdateBalance}
        />
      </SectionCard>

      <SectionCard title={`Historial ${currentYear}`}>
        <EmployeeAbsenceHistoryTable employeeId={employeeId} year={currentYear} />
      </SectionCard>
    </Stack>
  );
}
