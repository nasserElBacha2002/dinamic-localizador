import { Button } from "@mantine/core";
import { useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { WorkTeamForm, type WorkTeamFormValues } from "../../components/work-teams/WorkTeamForm";
import { EntityEditPageLayout } from "../../components/navigation/EntityEditPageLayout";
import { UnsavedChangesDialog } from "../../components/navigation/UnsavedChangesDialog";
import { ErrorState, LoadingState } from "../../design-system";
import { useUnsavedChangesController } from "../../hooks/useUnsavedChangesController";
import {
  useReplaceWorkTeamMembers,
  useUpdateWorkTeam,
  useWorkTeam,
} from "../../hooks/useWorkTeams";
import { getApiErrorMessage } from "../../utils/errors";
import { getEntityDetailPath } from "../../utils/entity-routes";
import {
  executeWorkTeamSave,
  workTeamSaveErrorMessage,
} from "../../utils/work-team-save";

/**
 * `/work-teams/:id/edit` — profile + members form (temporary combined save).
 * Activate/deactivate and usage history live on WorkTeamDetailPage.
 * Future phase: split members into a dedicated admin surface.
 */
export function WorkTeamEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const unsaved = useUnsavedChangesController({ active: true });
  const teamQuery = useWorkTeam(id);
  const updateMutation = useUpdateWorkTeam(id ?? "");
  const replaceMembersMutation = useReplaceWorkTeamMembers(id ?? "");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const submitInFlight = useRef(false);

  if (!id) {
    return <ErrorState message="Grupo no encontrado." />;
  }

  if (teamQuery.isLoading) {
    return <LoadingState />;
  }

  if (teamQuery.isError || !teamQuery.data) {
    return <ErrorState message={getApiErrorMessage(teamQuery.error, "Grupo no encontrado.")} />;
  }

  const team = teamQuery.data;
  const existingMembers = team.members
    .map((member) => member.employee)
    .filter((employee): employee is NonNullable<typeof employee> => Boolean(employee));

  const initialValues: WorkTeamFormValues = {
    name: team.name,
    description: team.description ?? "",
    employeeIds: team.members.map((member) => member.employeeId),
  };

  const goToDetail = () => {
    navigate(getEntityDetailPath("work-teams", id), { state: location.state });
  };

  const handleCancel = () => {
    unsaved.requestNavigation(goToDetail);
  };

  const handleSaveSuccess = () => {
    unsaved.markClean();
    goToDetail();
  };

  const handleSubmit = async (values: WorkTeamFormValues) => {
    if (submitInFlight.current) {
      return;
    }
    submitInFlight.current = true;
    setErrorMessage(null);
    unsaved.setSubmitting(true);

    try {
      const result = await executeWorkTeamSave(initialValues, values, {
        updateProfile: (input) => updateMutation.mutateAsync(input),
        replaceMembers: (employeeIds) => replaceMembersMutation.mutateAsync(employeeIds),
      });

      if (result.status === "noop" || result.status === "success") {
        handleSaveSuccess();
        return;
      }

      if (result.status === "members_failed_after_profile") {
        await teamQuery.refetch();
      }

      setErrorMessage(workTeamSaveErrorMessage(result, getApiErrorMessage(result.error)));
    } finally {
      unsaved.setSubmitting(false);
      submitInFlight.current = false;
    }
  };

  return (
    <EntityEditPageLayout
      title={team.name}
      description="Editá nombre, descripción e integrantes. Activar/desactivar está en el detalle."
      action={
        <Button variant="default" onClick={handleCancel}>
          Cancelar
        </Button>
      }
    >
      <WorkTeamForm
        defaultValues={initialValues}
        existingMembers={existingMembers}
        submitLabel="Guardar cambios"
        loading={updateMutation.isPending || replaceMembersMutation.isPending}
        errorMessage={errorMessage}
        onDirtyChange={unsaved.setDirty}
        onCancel={handleCancel}
        onSubmit={handleSubmit}
      />
      <UnsavedChangesDialog
        open={unsaved.discardDialogOpen}
        onConfirm={unsaved.confirmDiscard}
        onCancel={unsaved.cancelDiscard}
      />
    </EntityEditPageLayout>
  );
}
