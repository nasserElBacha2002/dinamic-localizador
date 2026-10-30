import { Divider, Group, Stack, Text } from "@mantine/core";
import { EntityLink } from "../entity-link";
import { DetailFieldGrid, SectionCard, StatusBadge } from "../../design-system";
import type { AbsenceAttachmentPolicy, AbsenceRequestDetail } from "../../types/absence";
import type { AbsenceOperationalImpact } from "../../types/absence-operational-impact";
import { terminology } from "../../domain/terminology";
import {
  absenceRequestedViaLabels,
  absenceStatusLabels,
  formatAbsenceDate,
} from "../../utils/absence-labels";
import { formatDateTime } from "../../utils/dates";
import { absenceStatusTone } from "../../utils/absence-status-display";
import { shouldOfferCoverageAction } from "../../pages/absences/absence-detail-planning";
import type { deriveAbsenceOperationalSummary } from "../../pages/absences/absence-detail-planning";
import { AbsenceAttachmentsSection } from "./AbsenceAttachmentsSection";

type OperationalSummary = ReturnType<typeof deriveAbsenceOperationalSummary>;

interface AbsenceRequestSummarySectionProps {
  detail: AbsenceRequestDetail;
  absenceTypeLabel: string;
  operationalSummary: OperationalSummary;
  impact: AbsenceOperationalImpact | undefined;
  canManageOperations: boolean;
  attachmentPolicy: AbsenceAttachmentPolicy;
  canViewAttachments: boolean;
  canManageAttachments: boolean;
}

export function AbsenceRequestSummarySection({
  detail,
  absenceTypeLabel,
  operationalSummary,
  impact,
  canManageOperations,
  attachmentPolicy,
  canViewAttachments,
  canManageAttachments,
}: AbsenceRequestSummarySectionProps) {
  return (
    <SectionCard title="Resumen de la solicitud">
      <Stack gap="md">
        <Stack gap="sm">
          <Group gap="sm" wrap="wrap">
            <StatusBadge
              label={absenceStatusLabels[detail.status]}
              tone={absenceStatusTone(detail.status)}
              variant="light"
            />
            <StatusBadge
              label={operationalSummary.label}
              tone={operationalSummary.tone}
              variant="light"
            />
          </Group>
          <Text size="sm">{operationalSummary.nextStep}</Text>
          {shouldOfferCoverageAction(detail.status, impact) && !canManageOperations ? (
            <Text size="sm" c="dimmed">
              Hay jornadas sin cubrir. Un responsable con permisos operativos debe asignar la
              cobertura desde la operación afectada.
            </Text>
          ) : null}
        </Stack>

        <DetailFieldGrid
          fields={[
            {
              label: terminology.worker.singular,
              value: (
                <EntityLink
                  entityType="employee"
                  entityId={detail.employee?.id ?? detail.employeeId}
                  label={`${detail.employee.name} (${detail.employee.phoneNumber})`}
                />
              ),
            },
            { label: "Tipo", value: absenceTypeLabel },
            {
              label: "Período",
              value: `${formatAbsenceDate(detail.startDate)} – ${formatAbsenceDate(detail.endDate)}`,
            },
            { label: "Días", value: detail.totalDays },
            { label: "Motivo", value: detail.reason },
            { label: "Origen", value: absenceRequestedViaLabels[detail.requestedVia] },
            { label: "Creada", value: formatDateTime(detail.createdAt) },
          ]}
        />

        <Divider />

        <Stack gap="xs">
          <Text size="sm" fw={500}>
            Documentación adjunta
          </Text>
          <AbsenceAttachmentsSection
            requestId={detail.id}
            requestStatus={detail.status}
            attachmentPolicy={attachmentPolicy}
            canView={canViewAttachments}
            canManage={canManageAttachments}
            variant="embedded"
          />
        </Stack>

        {(detail.reviewerName || detail.reviewedAt || detail.reviewComment) && (
          <>
            <Divider />
            <DetailFieldGrid
              fields={[
                { label: "Revisada por", value: detail.reviewerName ?? "—" },
                {
                  label: "Revisada el",
                  value: detail.reviewedAt ? formatDateTime(detail.reviewedAt) : "—",
                },
                { label: "Comentario de revisión", value: detail.reviewComment ?? "—" },
              ]}
            />
          </>
        )}
      </Stack>
    </SectionCard>
  );
}
