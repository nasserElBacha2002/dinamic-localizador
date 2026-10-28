# Árbol propuesto

Objetivo de carpetas. Los nombres de archivo no cambian. Controllers, routes, schemas, types, constants, jobs y middleware no se redibujan: siguen planos.

`Service` (producto) es la ubicación operativa. Vive en `services/locations/service.service.ts` para no crear `services/services/`.

## Backend

```text
backend/src/
  routes/                          # plano, index.ts sigue siendo el composition root
  controllers/                     # plano
  schemas/                         # plano
  types/                           # plano
  constants/                       # plano
  jobs/                            # plano
  middleware/                      # plano
  domain/                          # políticas puras; no crecer con IO
  services/
    audit.service.ts
    client.service.ts
    email.service.ts
    lookup.service.ts
    rate-limit-store.ts
    rate-limit-cleanup.service.ts
    replacement-request.service.ts
    server-status.service.ts
    statistics.service.ts
    system-logs.service.ts
    whatsapp/
      whatsapp-bot.service.ts
      twilio-outbound.service.ts
      whatsapp-usage-quota.service.ts
      whatsapp-message-cost-*.ts
      whatsapp-observability.service.ts
      whatsapp-retention.service.ts
      whatsapp-turn-*.ts
      whatsapp-lifecycle.service.ts
      ...                          # el resto de whatsapp-* y twilio-* de la raíz
      router/                      # hoy services/whatsapp-router/
        whatsapp-router.service.ts
        attendance.handler.ts
        absence.handler.ts
        checkout.handler.ts
        ...
    bot/                           # ya existe; se completan sesión y simulador
      bot-session.service.ts
      bot-runtime-settings.service.ts
      bot-simulator.service.ts
      contextual-session-retry.service.ts
      check-in-attendance.flow.ts
      checkout-attendance.flow.ts
      bot-intent.parser.ts
      ...
    absence/
      absence-request.service.ts
      absence-balance.service.ts
      absence-calendar.service.ts
      absence-operational-conflict.service.ts
      absence-operational-impact-query.service.ts
      absence-bot.service.ts
      ...
    operations/
      operation.service.ts
      operation-assignment.service.ts
      operation-assignment-core.service.ts
      operation-shift.service.ts
      operation-lifecycle.service.ts
      operation-import.service.ts
      recurring-schedule.service.ts
      ...
    workdays/
      employee-workday.service.ts
      recurring-workday-materialization.service.ts
      recurring-workday-sync.service.ts
      workday-materialization.service.ts
      ...
    attendance/
      attendance.service.ts
      manual-attendance.service.ts
      attendance-reminder.service.ts
      employee-workday-attendance.command.ts
      ...
    companies/
      company.service.ts
      company-user.service.ts
      company-lifecycle.service.ts
      platform-company.service.ts
      ...
    locations/
      service.service.ts           # ubicación operativa / "Servicio"
      location-zone.service.ts
      location-zone-geocoding.service.ts
      geolocation.service.ts
      geofence-policy.resolver.ts
    employees/
    work-teams/
    payroll/
    reports/                       # diario y mensual juntos
    admin-alerts/
    identity/                      # auth, two-factor, invitation, password-reset
    recommendation/                # ya existe; entran los dos services de entrada
    attachments/
      attachment-upload.service.ts
      attachment-policy.service.ts
      attachment-download.service.ts
      attachment-cleanup.service.ts
      attachment-deletion.service.ts
      storage/                     # hoy services/attachment-storage/
        index.ts
        gcs-attachment-storage.ts
        ...
  repositories/
    attendance/
    operations/                    # incluye operation-workday.repository.ts
    workdays/                      # employee-workday*.repository.ts
    whatsapp/
    absence/
    companies/
    employees/
    identity/
    reports/
    admin-alerts/
    payroll/
    locations/
    work-teams/
    client.repository.ts           # se queda en la raíz (un archivo)
    ...                            # audit / system-runtime también se quedan
  utils/
    sql-*.ts
    pagination.ts
    phone.ts
    row-mappers.ts
    csv.ts
    absence-date.ts                # primitiva compartida; se queda en la raíz
    log-redaction.ts
    safe-transaction.ts
    ...
    absence/                       # helpers sueltos; absence-attachments/ se conserva aparte
    attendance/
    operations/
    workdays/
    whatsapp/
    bot/
    employees/
    locations/
    statistics/
    identity/
    reports/
    work-teams/
    admin-alert/                   # ya existe
    payroll-receipts/              # ya existe
    geocoding/                     # ya existe
    system-logs/                   # ya existe
    absence-attachments/           # ya existe
    service-fix/                   # scripts de mantenimiento; se quedan
    service-reconciliation/        # se quedan
```

Tests colocados (`*.test.ts`, `*.integration.test.ts`) bajan con el archivo que cubren. No hay carpeta `tests/` nueva.

## Frontend

El árbol de `pages/` y `components/` se mantiene. El único cambio recomendado dentro de un feature:

```text
frontend/src/pages/settings/components/
  SettingsDialog.tsx
  SettingsDialogSection.tsx
  SettingsFormField.tsx
  SettingsResponsiveModal.tsx
  SettingsSummaryCard.tsx
  absence/
    CompanyAbsenceSettingsDialog.tsx
    CompanyAbsenceCalendarDialog.tsx
    CompanyAbsenceTypePolicyDialog.tsx
    CompanyAbsenceOperationalIntegrationDialog.tsx
  locations/
    LocationZonesDialog.tsx
    LocationZonesDialogContent.tsx
    CompanyLocationTypesDialog.tsx
    CompanyLocationTypesDialogContent.tsx
    location-zone-edit-payload.ts
  whatsapp/
    CompanyWhatsAppAlertsDialog.tsx
    CompanyWhatsAppAlertsDialogContent.tsx
    CompanyWhatsAppQuotaSettingsDialog.tsx
  schedule/
    CompanyWeeklyScheduleDialog.tsx
    CompanyWeeklyScheduleDialogContent.tsx
    CompanyShiftTemplatesDialog.tsx
    CompanyOperationalSettingsDialog.tsx
    OperationalSettingsForm.tsx
    OperationTimeInput.tsx
  reports/
    CompanyDailyAttendanceReportDialog.tsx
  employees/
    EmployeeCategoriesDialog.tsx
    EmployeeCategoriesDialogContent.tsx
```

Opcional, misma ficha de operación, sin nuevo feature:

```text
frontend/src/components/operations/
  OperationForm.tsx
  OperationTeamSection.tsx
  OperationEmployeeTable.tsx
  ...
  ai/
    OperationAiRecommendationsPanel.tsx
    OperationAiTeamRecommendationPanel.tsx
    OperationInlineAiSuggestion.tsx
  shifts/
    OperationShiftsPanel.tsx
  assignment/
    OperationAssignmentList.tsx
    EndAssignmentDialog.tsx
    OperationIndividualAssignmentPanel.tsx
    WorkTeamAssignmentPanel.tsx
```

`hooks/`, `api/`, `types/`, `queryKeys/` y el design system quedan como están.

## Lo que el árbol no hace

- No hay `modules/attendance/controllers|services|repositories`.
- No hay `features/` paralelo a `pages/` y `components/`.
- No hay `reports/daily` ni `whatsapp/quota` hasta que ese subconjunto supere, por responsabilidad real, al resto del dominio.
- No se renombra `service.service.ts`.
- No se parten los repositorios de más de 1000 líneas en archivos nuevos como parte de este árbol.
