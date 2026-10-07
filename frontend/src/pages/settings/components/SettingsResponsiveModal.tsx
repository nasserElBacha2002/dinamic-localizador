import type { ResponsiveModalProps } from "../../../design-system";
import { ResponsiveModal } from "../../../design-system";

const settingsModalStyles = {
  title: {
    color: "var(--mantine-color-brand-7)",
    fontWeight: 600,
  },
  header: {
    borderBottom: "1px solid var(--mantine-color-gray-3)",
    marginBottom: 0,
    paddingBottom: "var(--mantine-spacing-sm)",
  },
  body: {
    paddingTop: "var(--mantine-spacing-md)",
  },
} as const;

/** ResponsiveModal con jerarquía visual de Configuración (título ink, borde de cabecera). */
export function SettingsResponsiveModal({ styles, ...props }: ResponsiveModalProps) {
  const mergedStyles =
    typeof styles === "function"
      ? styles
      : {
          ...settingsModalStyles,
          ...styles,
        };

  return <ResponsiveModal {...props} styles={mergedStyles} />;
}
