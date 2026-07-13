import { useState } from "react";
import { useListBackNavigation } from "../../hooks/useListBackNavigation";
import { WorkTeamForm } from "../../components/work-teams/WorkTeamForm";
import { PageHeader } from "../../design-system";
import { useCreateWorkTeam } from "../../hooks/useWorkTeams";
import { getApiErrorMessage } from "../../utils/errors";

export function WorkTeamCreatePage() {
  const { goBackToList } = useListBackNavigation("/work-teams");
  const createMutation = useCreateWorkTeam();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  return (
    <>
      <PageHeader
        title="Nuevo grupo de trabajo"
        description="Creá una plantilla reutilizable de colaboradores."
      />
      <WorkTeamForm
        defaultValues={{ name: "", description: "", employeeIds: [] }}
        submitLabel="Crear grupo"
        loading={createMutation.isPending}
        errorMessage={errorMessage}
        onCancel={goBackToList}
        onSubmit={async (values) => {
          setErrorMessage(null);
          try {
            await createMutation.mutateAsync({
              name: values.name,
              description: values.description || null,
              employeeIds: values.employeeIds,
            });
            goBackToList();
          } catch (error) {
            setErrorMessage(getApiErrorMessage(error));
          }
        }}
      />
    </>
  );
}
