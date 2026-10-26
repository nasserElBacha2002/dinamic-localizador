# 02 — Mapa de dominio

Cómo se relacionan las entidades que el código persiste. Sirve para el gráfico simple de la presentación. El gráfico comercial no debería mostrar tablas ni jobs.

## Diagrama para clientes

```text
Empresa
├── Usuarios internos (quién administra)
├── Configuración (reglas, alertas, reportes)
├── Clientes                          ← agrupador comercial, opcional
│     ├── Formatos de lugar
│     └── Colaboradores habilitados para ese cliente
├── Servicios (lugares de trabajo)    ← mapa, radio, dirección
│     └── pueden pertenecer a un cliente
├── Colaboradores                     ← teléfono de WhatsApp
│     └── pueden pertenecer a varios clientes y a grupos
├── Grupos de trabajo                 ← atajo para asignar varias personas
└── Operaciones                       ← siempre sobre un servicio
      └── Asignaciones
            └── Jornadas del colaborador
                  ├── Confirmación (voy / no voy)
                  ├── Llegada (WhatsApp o manual)
                  ├── Salida (WhatsApp o manual)
                  ├── Ausencia que justifica la jornada
                  └── Reemplazo, si avisó que no puede
                        └── Nueva asignación de cobertura

Las jornadas alimentan:
Inicio del día → Estadísticas → Reporte diario → Reporte mensual
```

## Cardinalidades que importan

| Relación | Cardinalidad | Obligatoria para operar |
|---|---|---|
| Empresa → usuarios | 1:N | Sí, al menos el owner |
| Empresa → clientes | 1:N | No |
| Cliente → servicios | 1:N | No. Un servicio puede no tener cliente |
| Cliente → colaboradores | N:M (`employee_clients`) | No |
| Servicio → operaciones | 1:N | La operación no existe sin servicio |
| Operación → cliente | No hay FK directa | El cliente se hereda leyendo el servicio |
| Operación → asignaciones | 1:N | Sí, si se espera fichaje |
| Asignación → jornadas (`employee_workdays`) | 1:N en recurrentes; 1 en una operación de un día | Automática |
| Jornada → registro de asistencia | 0..1 activo | Nace vacía hasta el fichaje o la ausencia |
| Colaborador → zona geográfica | N:1 opcional | No. Solo mejora recomendaciones |
| Servicio → zona | N:1 derivada de barrio/localidad | No interviene en el fichaje |

## Entidades y para qué existen

### Empresa (`companies`)

Tenant. Estado `ACTIVE | INACTIVE | SUSPENDED`. Todo query operativo lleva `company_id`.

Evidencia: `database/migrations/015_multi_company_foundation.sql`, `resolveCompanyContext`.

### Usuario interno (`users` + `user_company_memberships`)

Persona que entra al panel. No es un colaborador. Puede coincidir en la vida real, pero el sistema no los unifica. El colaborador no tiene login.

Rol de membresía: `OWNER | ADMIN | HR | SUPERVISOR | OPERATOR | READ_ONLY`.

### Cliente (`clients`)

Nombre comercial. Activo o inactivo. No tiene dirección ni mapa.

Migración: `141_clients_migration.sql`. Servicio: `client.service.ts`.

### Formato de lugar (`company_location_types`)

Catálogo por cliente (por ejemplo el “formato” de un local). El servicio solo puede usar un formato activo de su cliente. Migración `143_company_location_types_client.sql`.

### Servicio (`operational_locations`)

Lugar donde se trabaja y contra el cual se mide la distancia.

Campos que la presentación debe conocer: nombre, dirección, barrio, localidad (texto), formato, latitud, longitud, radio en metros, cliente opcional, activo, `google_place_id` opcional.

Evidencia: `service.service.ts`, `frontend/src/pages/services/*`.

### Zona geográfica (`location_zones`)

Barrio/localidad con centroide. Residencia aproximada del colaborador y señal de proximidad para recomendar personas. Semilla CABA/GBA en `110_seed_caba_gba_location_zones.sql`.

No es el geofence.

### Colaborador (`employees`)

Identidad de WhatsApp. Teléfono único en la práctica operativa: si el mismo número existe activo en dos empresas, el bot no sabe con cuál hablar (`AMBIGUOUS_COMPANY_MESSAGE`).

Tipos: `fijo`, `eventual`.

### Categoría (`employee_categories`)

Etiqueta de la empresa (rol operativo del colaborador, no el rol del panel). Opcional.

### Grupo de trabajo

Conjunto reutilizable de colaboradores para asignar de una vez.

### Operación (`scheduled_operations`)

Trabajo planificado en un servicio.

| Campo | Valores |
|---|---|
| `operationKind` | `ONE_TIME`, `RECURRING` |
| `scheduleMode` | `SINGLE`, `MULTI_SHIFT` |
| `scheduleSource` (recurrente) | `COMPANY`, `CUSTOM` |
| `status` | `SCHEDULED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED` |
| Tolerancias | minutos de llegada temprana y tardía, propias o `COMPANY_DEFAULT` |

La operación puntual guarda `scheduledStart` / `scheduledEnd`. La recurrente guarda vigencia (`validFrom` / `validUntil`) y un horario semanal; las fechas concretas aparecen como jornadas materializadas.

### Turno (`operation_shifts`)

Solo si la operación es `MULTI_SHIFT`. La asignación debe indicar `operationShiftId`. Dos turnos solapados del mismo colaborador en la misma operación se rechazan.

### Asignación (`operation_assignments`)

Une colaborador y operación en un período.

Origen: `MANUAL | WORK_TEAM | SYSTEM | COVERAGE`.

Confirmación de la jornada: pendiente, confirmada o no disponible. La ventana de confirmación llega hasta el inicio programado, exclusivo (`attendance-confirmation-validity.ts`).

### Jornada

- `operation_workdays`: el día (y turno) de la operación. `ACTIVE | CANCELLED`.
- `employee_workdays`: lo que se espera de una persona ese día. `EXPECTED | JUSTIFIED | CANCELLED`.

Aquí se apoyan el fichaje, la ausencia justificada, el “avisó que no va” y el reemplazo.

### Asistencia (`attendance_records`)

Evidencia de llegada y, si existe, de salida.

Llegada: estado de validación, ubicación, puntualidad, coordenadas recibidas, distancia, hora, `sourceMessageSid`, origen WhatsApp o manual.

Salida: hora, coordenadas opcionales según configuración, estado de checkout.

Validación de llegada: `VALID | PENDING_REVIEW | REJECTED`.

Ubicación: `INSIDE_GEOFENCE | OUTSIDE_GEOFENCE | INVALID_LOCATION`.

Puntualidad: `EARLY | ON_TIME | LATE | OUTSIDE_TIME_WINDOW`.

### Ausencia

Solicitud (`absence_requests`), tipo, calendario laboral, saldo y movimientos, adjuntos. Una ausencia aprobada puede justificar la jornada y chocar con una asignación ya hecha (`absence-operational-conflict.service.ts`).

### Reemplazo (`replacement_requests`)

Estados: `PENDING | COVERED | EXPIRED | FAILED` (migración `150_whatsapp_replacement_requests.sql`).

Candidatos rankeados y notificación a responsables operativos.

### Alertas y reportes

- Outbox de alertas admin (`whatsapp_admin_alert_notifications`)
- Destinatarios (`company_alert_recipients`)
- Corridas de reporte diario y mensual

No son entidades que el cliente configure como “datos maestros”. Son consecuencia de las jornadas.

## Qué depende de qué (orden de carga)

```text
Empresa activa
  → usuario owner
  → (opcional) clientes y formatos
  → servicios con coordenadas          [bloqueante]
  → colaboradores con teléfono         [bloqueante para WhatsApp]
  → (opcional) categorías, zonas, grupos, vínculo colaborador-cliente
  → operación sobre un servicio        [bloqueante]
  → asignación                         [bloqueante]
  → jornada materializada              [automática]
  → mensajes de confirmación y fichaje [requiere Twilio y teléfono]
  → asistencia / incidencia
  → inicio, estadísticas, mails
```

No se puede crear una operación útil sin servicio. No se puede fichar por WhatsApp sin colaborador activo con ese teléfono y sin jornada asignada para ese momento.

## Dos relojes distintos

| Reloj | Quién lo usa |
|---|---|
| Hora del servidor / timezone de la empresa (`operationTimezone`) | Ventanas de fichaje, recordatorios, “hoy” del inicio, reportes |
| Coordenada que la persona envía en ese instante | Solo el punto de llegada o de salida. No hay rastreo posterior |

## Aislamiento

Un usuario de la empresa A no lee datos de la empresa B. El platform admin entra a cualquier empresa activa con permisos equivalentes a OWNER (`company-context.service.ts`). Eso es una herramienta interna de Dinamic, no un rol del cliente.

## Cómo contarlo en una diapositiva

Una frase:

> La empresa carga los lugares donde se trabaja, las personas y las operaciones. Cada persona asignada tiene una jornada. Esa jornada se confirma, se ficha al llegar y al irse, y todo lo que no cierra queda visible para quien administra.

El gráfico no necesita zonas, formatos, saldos de ausencia ni recibos. Esos van a un anexo si el cliente pregunta.
