# 01 — Inventario funcional

Auditoría estática del repositorio `dinamic-localizador` (Dinamic Attendance). Fecha de lectura: 2026-10-25.

Una capacidad figura como existente solo si hay ruta, servicio, job o pantalla que la implementa. El README todavía describe “tiendas” e “inventarios”; el producto vigente usa **Servicio**, **Operación** y **Colaborador** (`frontend/src/domain/terminology.ts`).

## Leyenda de estado

| Estado | Significado |
|---|---|
| OPERATIVO | Implementado en backend y expuesto en la UI o en WhatsApp de producción |
| PARCIAL | Existe, pero con hueco de producto, configuración o canal |
| IMPLEMENTADO_NO_EXPUESTO | Hay código o API sin pantalla equivalente |
| EXPERIMENTAL | Solo plataforma / simulador / observabilidad interna |
| LEGACY | Sigue en el repo pero el flujo vigente ya no lo usa como camino principal |
| INFERIDO | Conclusión a partir de ausencia de código; no hay prueba en runtime |

## Corrección de modelo (leer antes del resto)

La jerarquía **Empresa → Cliente → Localidad/Sucursal** no coincide con el código.

| Lo que se espera comercialmente | Lo que existe |
|---|---|
| Localidad o sucursal | **Servicio** (`operational_locations`): nombre, dirección, lat/lng, radio |
| Inventario | **Operación** (`scheduled_operations`) |
| Empleado | **Colaborador** (`employees`) |
| Localidad como entidad hija del cliente | No. “Localidad” es texto del servicio y campo de una **zona geográfica** |
| Cliente obligatorio | No. `clientId` del servicio es opcional |

El fichaje valida coordenadas del **servicio**, no del cliente ni de la zona del colaborador.

---

## 1. Plataforma y empresa

Alta de empresa solo por administrador de plataforma. No hay registro self-serve.

| Capacidad | Estado | Evidencia | Uso en presentación |
|---|---|---|---|
| Crear empresa e invitar OWNER | OPERATIVO | `POST /api/platform/companies`, `platformCompanyService.createCompany`, UI `/platform/companies` | Diagrama de puesta en marcha. No grabar la consola de plataforma delante del cliente |
| Aceptar invitación y definir contraseña | OPERATIVO | `POST /api/invitations/accept`, `/invitations/accept` | Screenshot del mail + pantalla de aceptación, en la guía de setup |
| Desactivar / reactivar empresa | OPERATIVO | `platform-company.routes.ts` | Omitir |
| Módulos por empresa | OPERATIVO en el alta; escritura posterior solo API | `company_modules`, `PATCH /companies/:id/modules` exige platform admin y no tiene UI | Mencionar que se activan al contratar. No mostrar el toggle técnico |
| Login, recuperación de contraseña, 2FA TOTP | OPERATIVO | `auth.routes.ts`, `/login`, `/settings/security` | Login sí. 2FA como nota de seguridad, no como capítulo |
| Selección de empresa si el usuario tiene varias | OPERATIVO | `CompanyGate` | Omitir salvo que el comprador sea un grupo |

**Módulos** (`backend/src/constants/company-modules.ts`): `attendance`, `operations`, `absences`, `payroll_receipts`, `reports`, `bot_simulator`. En el alta, el default habilita todos. Al menos uno de attendance / operations / absences debe quedar activo.

**Bootstrap automático al crear la empresa:** settings, catálogo de ausencias, horario semanal, zonas genéricas, calendario, módulos, invitación del owner. No crea clientes, servicios, colaboradores ni operaciones.

## 2. Usuarios internos y permisos

Roles reales (`backend/src/types/company.ts`): `OWNER`, `ADMIN`, `HR`, `SUPERVISOR`, `OPERATOR`, `READ_ONLY`.

Permisos resueltos solo por rol, sin overrides por usuario (`backend/src/constants/company-permissions.ts`).

| Rol | Qué habilita de verdad | Presentación |
|---|---|---|
| OWNER | Todo, incluida gestión de usuarios | El “administrador del cliente” |
| ADMIN | Igual que OWNER salvo `users:manage` | Se puede fundir con OWNER en el relato |
| HR | Colaboradores, ausencias, recibos, lectura de reportes. Sin operaciones ni settings | Anexo, si el comprador tiene RR.HH. separado |
| SUPERVISOR | Lectura operativa, revisión y carga manual de asistencia, reportes | El responsable de turno |
| OPERATOR | Lectura de empresa, operaciones y asistencia | Omitir |
| READ_ONLY | Lecturas | Omitir |

Invitación, reenvío, revocación, desactivación y protección contra auto-desactivación o cambio de rol propio: OPERATIVO (`company-user.routes.ts`, `company-user.guards.ts`).

El script `npm run admin:create` crea un usuario `ADMIN` global y **no** marca `is_platform_admin`. El acceso a `/platform/*` depende de ese flag en base.

## 3. Configuración de empresa

Ruta: `/settings/company`. Permiso de escritura: `company:settings:update`.

| Bloque | Estado | Dónde |
|---|---|---|
| Timezone, radio default, tolerancias de llegada, salida con ubicación, correcciones manuales | OPERATIVO | `OperationalSettingsForm`, `DEFAULT_COMPANY_OPERATIONAL_SETTINGS` |
| Horario semanal de la empresa | OPERATIVO | `CompanyWeeklyScheduleDialog` |
| Plantillas de turnos | OPERATIVO | `CompanyShiftTemplatesDialog` (módulo operations) |
| Alertas WhatsApp y umbrales | OPERATIVO, apagadas por defecto en migración 100 | `CompanyWhatsAppAlertsDialog` |
| Reporte diario por email + hora | OPERATIVO | settings + `daily-attendance-report.job.ts` |
| Cuotas WhatsApp (`OFF` / `SHADOW` / `ENFORCE`) | OPERATIVO | `CompanyWhatsAppQuotaSettingsDialog` |
| Categorías de colaborador | OPERATIVO | `EmployeeCategoriesDialog` |
| Zonas geográficas y geocodificación | OPERATIVO | `LocationZonesDialog` |
| Tipos/formatos de ubicación por cliente | OPERATIVO | `CompanyLocationTypesDialog` |
| Políticas, calendario y adjuntos de ausencias | OPERATIVO | diálogos de ausencias en settings |
| Reporte mensual | IMPLEMENTADO_NO_EXPUESTO | job y servicio; sin toggle propio en UI. Usa el mismo flag que el reporte diario |

Defaults que importan a una demo (`backend/src/constants/company-settings.ts`):

- Timezone `America/Argentina/Buenos_Aires`
- Radio default 150 m (rango 10–5000)
- Llegada temprana default 60 min; llegada tarde default 90 min
- Horario sugerido de operación `20:30`–`03:00` (sesgo de inventario nocturno)
- Confirmación 24 h antes, activada
- Salida exige ubicación: sí
- Correcciones manuales: sí
- Margen de revisión de geocerca: null hasta que la empresa lo configure

## 4. Clientes

Estado: OPERATIVO.

| Acción | API | UI |
|---|---|---|
| Alta, edición de nombre, activar/desactivar | `POST/PATCH /clients`, `POST .../activate|deactivate` | `/clients` (alta en modal, no hay `/clients/new`) |
| Formatos de ubicación | rutas anidadas `location-types` | ficha `/clients/:id` |
| Colaboradores del cliente | `GET/PUT/DELETE .../clients/:id/employees` | tab de la ficha |
| Servicios del cliente | filtro `clientId` en servicios | tab de la ficha |
| Import CSV/XLSX | `/imports/clients` | `/imports` |
| Borrado físico | no hay DELETE | — |

Campos: nombre, estado activo, unicidad por nombre normalizado dentro de la empresa (`141_clients_migration.sql`). Permiso: reutiliza `employees:read` / `employees:manage`. No existe `clients:*`.

## 5. Servicios (el lugar de trabajo)

Estado: OPERATIVO. Es la entidad que el comprador va a entender como sucursal.

| Acción | Evidencia |
|---|---|
| Crear con lat/lng obligatorios y radio default 150 | `POST /services`, `ServiceCreatePage` |
| Editar, desactivar | `PUT`, `DELETE` → `active=false` |
| Mapa y radio | `ServiceLocationMapView`, location picker |
| Filtros: cliente, formato, localidad, barrio, búsqueda, activo | `GET /services`, `GET /services/facets` |
| Cliente opcional; formato validado contra tipos activos de ese cliente | `service.service.ts` |
| Zona geográfica derivada de barrio + localidad | `locationZoneService.findOrCreateByNameLocality` |
| Import | `/imports/services` |
| Redirect legacy `/stores` → `/services` | `AppRoutes.tsx` |

No hay entidad “sucursal” distinta del servicio. En la plantilla de importación de operaciones, “Sucursal” resuelve al nombre del servicio.

## 6. Zonas geográficas

Estado: OPERATIVO como catálogo de residencia / proximidad. **No participan de la geocerca de fichaje.**

- Asociación empresa + catálogo global (`109_global_location_zones.sql`)
- Geocodificación de centroide (`location-zone-geocoding.service.ts`)
- El colaborador puede tener `location_zone_id` (residencia aproximada, oculta sin `employees:manage`)
- El algoritmo de recomendación usa esa zona contra las coordenadas del servicio
- No hay import de zonas

## 7. Colaboradores

Estado: OPERATIVO como alta administrativa. No hay invitación ni alta por WhatsApp.

| Acción | Estado | Evidencia |
|---|---|---|
| Alta con teléfono obligatorio (mín. 8, normalización) | OPERATIVO | `createEmployeeSchema`, `EmployeeCreatePage` |
| Tipos `fijo` y `eventual` | OPERATIVO | `backend/src/constants/employee-types.ts` |
| Categoría, zona, clientes N:M | OPERATIVO | `EmployeeForm`, `employee_clients` |
| Desactivar (impacta asignaciones) | OPERATIVO | `POST .../deactivate` |
| Import sin side-effect de WhatsApp | OPERATIVO | `imports/employees` |
| Identificación en el bot por teléfono activo | OPERATIVO | `employeeRepository.findByPhone` |
| Autogestión / app del colaborador | No existe | — |

Ficha `/employees/:id`: resumen, operaciones, ausencias, estadísticas, asistencias.

## 8. Grupos de trabajo

Estado: OPERATIVO.

CRUD en `/work-teams`. Asignación masiva a una operación con preview y confirmación (`POST /operations/:id/work-teams/assign-preview|assign`). Motivos de omisión: ya asignado, duplicado, solape de período, inactivo, no encontrado.

## 9. Operaciones

Estado: OPERATIVO. Profundidad en `04` y en el mapa de dominio.

Variantes reales:

- `ONE_TIME` o `RECURRING`
- `SINGLE` (un horario) o `MULTI_SHIFT` (turnos)
- Horario recurrente `COMPANY` o `CUSTOM`
- Tolerancias propias o heredadas de la empresa
- Estados `SCHEDULED | IN_PROGRESS | COMPLETED | CANCELLED`

No hay cupo de personal ni responsable persistido en la operación. La cobertura es la cantidad de asignaciones que el administrador decide cargar.

Jobs: `operation-lifecycle.job.ts`, `recurring-workday-materialization.job.ts`.

## 10. Asignaciones y recomendación

Estado: OPERATIVO.

| Camino | Qué hace | Qué no hace |
|---|---|---|
| Individual y lote (hasta 100) | Crea `operation_assignments` y jornadas | No envía WhatsApp al asignar |
| Grupo de trabajo | Preview + confirmación, origen `WORK_TEAM` | |
| Cobertura manual `asCoverage` | Cancela la asignación reemplazada, origen `COVERAGE` | |
| Recomendación individual | Score determinístico `workforce-recommendation-v1` | No asigna sola. No es un modelo de ML |
| Recomendación de equipo | `workforce-team-recommendation-v1`, tamaño pedido en la consulta | El tamaño no queda guardado como necesidad |
| Conflicto mismo turno solapado | Bloquea | |
| Solape con otra operación | Warning, no bloquea | |

La UI rotula paneles como recomendación “IA” (`OperationAiRecommendationsPanel.tsx`). El backend no llama a un LLM. En una demo hay que decir “recomendación según historial”, no “inteligencia artificial”.

## 11. WhatsApp del colaborador

Estado: OPERATIVO sobre Twilio.

Webhook: `POST /api/webhooks/twilio/whatsapp`.

Menú real (según módulos): marcar llegada, marcar salida, avisar ausencia o vacaciones, consultar jornada de hoy, ver próximos turnos, confirmar asistencia, avisar no disponibilidad, consultar recibo.

Check-in y check-out existen. No hay alta de colaborador por chat ni seguimiento continuo de GPS.

Detalle de mensajes y ramas: documento `05` y `06`.

Simulador `/bot-simulator`: EXPERIMENTAL, solo platform admin y módulo `bot_simulator`.

## 12. Asistencia (panel)

Estado: OPERATIVO.

| Pantalla | Pregunta |
|---|---|
| `/attendance` | Quién fichó, con qué validación, en qué operación y turno |
| `/attendance/:id` y `/attendance/workdays/:id` | Qué evidencia quedó (coords, distancia, origen, revisión) |
| Alta manual y edición | Corregir sin fabricar evidencia de WhatsApp |
| Revisión aprobar/rechazar | Cerrar un `PENDING_REVIEW` con motivo |

Filtros: operación, colaborador, servicio, turno, validación, ubicación, puntualidad, checkout, fechas. Export CSV con `attendance:export`.

`AttendanceCreatePage` / formulario de prueba: herramienta técnica. No mostrarla.

## 13. Ausencias

Estado: OPERATIVO si el módulo `absences` está activo.

Solicitud por panel o por WhatsApp, tipos, calendario laboral, saldos, adjuntos (GCS), aprobación / rechazo / pedido de información, impacto sobre jornadas y conflictos operativos. Job `absence-workday-sync.job.ts`.

## 14. Reemplazos

Estado: OPERATIVO en WhatsApp hacia responsables; PARCIAL como experiencia web.

El colaborador marca no disponibilidad → `replacement_requests` → hasta 3 candidatos → el responsable elige con respuesta rápida → nueva asignación `COVERAGE`. No hay evidencia de aviso automático al colaborador que cubre, dentro de `replacement-request.service.ts`.

## 15. Inicio, estadísticas y reportes

| Capacidad | Estado |
|---|---|
| Inicio `/` con KPIs del día | OPERATIVO si el módulo `reports` está activo. Si no, el inicio queda reducido a operaciones |
| Estadísticas: General, Por empleado, Por operación, Por servicio/ubicación, Incidencias | OPERATIVO |
| Export CSV/XLSX de estadísticas | OPERATIVO con `reports:export` |
| Email diario + XLSX | OPERATIVO si el worker y el flag de empresa están activos |
| Email mensual + XLSX (5 hojas) | OPERATIVO en backend, sin UI propia, atado al flag del diario |
| Alertas admin | OPERATIVO, default apagado, worker por env |

## 16. Recibos de sueldo

Estado: OPERATIVO como módulo opcional `payroll_receipts`, no como parte del núcleo de asistencia. Carga por lote, ficha, notificación WhatsApp y consulta desde el menú del bot.

Para una presentación de control de asistencia: anexo o una sola mención. No mezclarlo con el fichaje.

## 17. Importación

Estado: OPERATIVO para `operations`, `services`, `employees`, `clients`. UI `/imports`. No incluye zonas.

## 18. Observabilidad interna

EXPERIMENTAL / omitir en cualquier material de cliente:

- `/platform/servers`
- `/platform/observability/whatsapp` (conversaciones, errores, costos)
- `/platform/observability/system-logs`
- Simulador de bot

## 19. Restricciones de plataforma que sí afectan al onboarding

- El número de WhatsApp de Twilio no está modelado como “un número por cliente” de forma completa. La empresa se resuelve por sesión, teléfono único de colaborador, número receptor o defaults (`whatsapp-company-context.service.ts`). Dos empresas con el mismo teléfono de colaborador quedan bloqueadas por ambigüedad.
- Varios workers nacen apagados por variable de entorno (alertas, reporte diario, reporte mensual). Contratar el producto no los enciende solo.
- El horario default `20:30`–`03:00` delata el origen de inventarios nocturnos. Hay que reconfigurarlo en la empresa demo y en el cliente real.

## 20. Qué no existe (no vender)

- App móvil del colaborador
- GPS continuo o geocerca pasiva
- Alta de colaborador por WhatsApp
- Registro self-serve de la empresa
- Cupo o “vacantes” en la operación
- Responsable asignado a la operación como dato
- Inteligencia artificial generativa o modelo entrenado
- Localidad/sucursal como entidad distinta del servicio
- Check-in que se descarte sin dejar registro: el rechazo de radio u horario **sí persiste** el intento. La ubicación reenviada no persiste asistencia
- Selección de reemplazo equivalente, pulida, solo en la web
