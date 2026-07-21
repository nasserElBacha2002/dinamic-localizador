import { useMemo, useState } from "react";
import { useUpdateCompanySettings } from "../../../hooks/useCompanySettings";
import type { CompanySettings } from "../../../types/company-settings";
import {
  operationalSettingsEqual,
  toOperationalSettingsFormValues,
  toOperationalSettingsUpdateInput,
  validateOperationalSettingsForm,
  type OperationalSettingsFormValues,
} from "../../../utils/company-settings-validation";
import { getApiErrorMessage } from "../../../utils/errors";
import { OperationalSettingsForm } from "./OperationalSettingsForm";
import { SettingsDialog } from "./SettingsDialog";

interface CompanyOperationalSettingsDialogProps {
  opened: boolean;
  onClose: () => void;
  settings: CompanySettings;
  canUpdate: boolean;
  onSaved: (message: string) => void;
}

export function CompanyOperationalSettingsDialog({
  opened,
  onClose,
  settings,
  canUpdate,
  onSaved,
}: CompanyOperationalSettingsDialogProps) {
  const updateMutation = useUpdateCompanySettings();
  const baseline = useMemo(() => toOperationalSettingsFormValues(settings), [settings]);
  const [formValues, setFormValues] = useState<OperationalSettingsFormValues>(baseline);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const validationErrors = useMemo(
    () => validateOperationalSettingsForm(formValues),
    [formValues],
  );
  const hasChanges = !operationalSettingsEqual(formValues, baseline);
  const isValid = validationErrors.length === 0;
  const disabled = !canUpdate || updateMutation.isPending;

  const discardAndClose = () => {
    setFormValues(baseline);
    setSubmitError(null);
    onClose();
  };

  const handleClose = () => {
    if (updateMutation.isPending) {
      return;
    }

    if (hasChanges) {
      const confirmed = window.confirm(
        "Hay cambios sin guardar. ¿Querés cerrar y descartarlos?",
      );
      if (!confirmed) {
        return;
      }
    }

    discardAndClose();
  };

  const handleSave = async () => {
    if (!canUpdate || !hasChanges || !isValid || updateMutation.isPending) {
      return;
    }

    setSubmitError(null);
    try {
      await updateMutation.mutateAsync(toOperationalSettingsUpdateInput(formValues));
      onSaved("Configuración operativa guardada correctamente.");
      setSubmitError(null);
      onClose();
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    }
  };

  return (
    <SettingsDialog
      opened={opened}
      onClose={handleClose}
      title="Configuración operativa"
      subtitle="Defaults usados por operaciones, importaciones y validaciones del bot."
      onSave={handleSave}
      saving={updateMutation.isPending}
      saveDisabled={!canUpdate || !hasChanges || !isValid}
      saveLabel="Guardar configuración"
      submitError={submitError}
      size="xl"
    >
      <OperationalSettingsForm
        values={formValues}
        onChange={setFormValues}
        disabled={disabled}
        validationErrors={validationErrors}
      />
    </SettingsDialog>
  );
}
