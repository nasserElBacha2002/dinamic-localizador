# 03 — Flujo de onboarding de un cliente nuevo

Responde: una empresa contrata Dinamic Attendance. ¿Qué tiene que ocurrir desde el día 1 hasta que puede controlar operaciones y asistencia?

El orden de abajo sigue dependencias reales del código, no el orden del menú.

Leyenda: **Obligatorio** bloquea la operación. **Opcional** mejora el uso. **Automático** lo hace el sistema al crear la empresa o al asignar. **Configurable** tiene default usable y conviene revisarlo. **Interno** lo hace Dinamic, no el cliente.

## Fase A — Dinamic abre la empresa (interno)

| # | Paso | Tipo | Evidencia y nota |
|---|---|---|---|
| A1 | Crear la empresa desde plataforma: nombre, owner (nombre y email), módulos, estado ACTIVE | Obligatorio, interno | `POST /api/platform/companies`, `CreatePlatformCompanyDialog`. No hay self-serve |
| A2 | El sistema crea settings, catálogo de ausencias, horario base, zonas genéricas, calendario y módulos | Automático | `platformCompanyService.createCompany` |
| A3 | El sistema envía la invitación al owner | Automático | `userInvitationService`, origen `COMPANY_CREATE`. Requiere SMTP funcionando |
| A4 | Verificar número de WhatsApp de Twilio y que los teléfonos de este cliente no choquen con otra empresa | Obligatorio, interno | `whatsapp-company-context.service.ts`. Ambigüedad de teléfono bloquea el bot |
| A5 | Encender workers de recordatorios, alertas y reporte diario en el entorno | Obligatorio, interno | Flags `*_WORKER_ENABLED` / `*_JOB_ENABLED`. El alta de empresa no los enciende |
| A6 | Decidir módulos que el cliente va a ver | Configurable, interno | Default: todos, incluido recibos y simulador. Para un cliente de asistencia, evaluar apagar `bot_simulator` |

El cliente todavía no puede operar. Tiene un mail.

## Fase B — El administrador entra

| # | Paso | Tipo | Nota |
|---|---|---|---|
| B1 | Aceptar invitación y definir contraseña | Obligatorio | `/invitations/accept` |
| B2 | Iniciar sesión | Obligatorio | `/login` |
| B3 | Activar 2FA | Opcional | `/settings/security` |
| B4 | Invitar a otros administradores o supervisores | Opcional en el día 1, necesario antes de delegar | `/settings/users`, roles reales del documento 04 |

## Fase C — Reglas de la empresa

Pantalla: `/settings/company`.

| # | Paso | Tipo | Default actual | Recomendación de arranque |
|---|---|---|---|---|
| C1 | Timezone | Configurable | `America/Argentina/Buenos_Aires` | Confirmar país |
| C2 | Radio por defecto | Configurable | 150 m | Dejar 150 salvo locales muy grandes |
| C3 | Margen de revisión fuera del radio | Configurable | vacío | Definir una banda (por ejemplo 50–100 m) si se quiere “pendiente de revisión” en vez de rechazo seco |
| C4 | Tolerancia de llegada temprana | Configurable | 60 min | Ajustar al negocio |
| C5 | Tolerancia de llegada tarde | Configurable | 90 min | Ajustar. Ojo: es ancha para una demo de puntualidad |
| C6 | Horario base de operación | Configurable | 20:30–03:00 | Cambiarlo. El default es de inventario nocturno y confunde a un cliente diurno |
| C7 | Horario semanal de la empresa | Obligatorio si habrá operaciones recurrentes con horario `COMPANY` | Se crea un default al provisionar | Revisar días y horas reales |
| C8 | Salida con ubicación obligatoria | Configurable | sí | Dejar sí si el valor comercial es “también verificamos la salida” |
| C9 | Correcciones manuales | Configurable | sí | Dejar sí |
| C10 | Recordatorio de confirmación | Configurable | sí, 24 h antes | Dejar sí |
| C11 | Destinatarios de alertas (teléfono WhatsApp y email) | Obligatorio para alertas y reporte | lista vacía | Cargar al responsable operativo |
| C12 | Activar alertas admin | Obligatorio si se va a demostrar reacción | apagadas (`admin_alerts_enabled` default 0, migración 100) | Encender y elegir modo |
| C13 | Modo de entrega | Configurable | `WHATSAPP_LEGACY` o `DAILY_EMAIL` | Para la demo, WhatsApp en ausencias/reemplazos y email para el resumen. Documentar que en `DAILY_EMAIL` varios avisos dejan de ser urgentes |
| C14 | Reporte diario: activar y hora | Obligatorio para el cierre por mail | hora default 08:00 | Activar |
| C15 | Cuota WhatsApp | Opcional | según settings | No mostrar en la demo |
| C16 | Plantillas de turnos | Opcional | — | Solo si el cliente usa varios turnos el mismo día |
| C17 | Categorías de colaborador | Opcional | — | Útiles para filtrar, no bloquean |
| C18 | Zonas y geocodificación | Opcional | hay semillas genéricas y CABA/GBA | Hacen mejor la recomendación de cercanía. No validan el fichaje |
| C19 | Políticas de ausencia y calendario | Opcional el día 1 | catálogo automático | Necesario antes de vender vacaciones y saldos |

## Fase D — Estructura comercial y lugares

| # | Paso | Tipo | Nota |
|---|---|---|---|
| D1 | Cargar clientes | Opcional pero recomendado | Manual o `/imports` entidad `clients`. Solo nombre |
| D2 | Cargar formatos de lugar por cliente | Opcional | Si todos los lugares son “sucursal”, se puede omitir |
| D3 | Crear cada lugar de trabajo como **Servicio**: nombre, dirección, punto en el mapa, radio | Obligatorio | Sin lat/lng la API no crea el servicio |
| D4 | Asociar el servicio a un cliente | Opcional | Habilita afinidad de cliente en recomendaciones y filtros |
| D5 | Verificar en el mapa que el pin y el círculo cubren la puerta real | Obligatorio operativo | El fichaje usa ese pin, no la dirección postal por sí sola |

Import de servicios: CSV/XLSX con nombre, lat, lng, cliente, formato, radio (`imports/services`).

## Fase E — Personas

| # | Paso | Tipo | Nota |
|---|---|---|---|
| E1 | Alta de colaboradores con teléfono WhatsApp | Obligatorio | Panel o import. El import no les escribe por WhatsApp |
| E2 | Tipo fijo o eventual | Configurable | `EMPLOYEE_TYPES` |
| E3 | Categoría, zona de residencia, clientes habilitados | Opcional | La zona mejora recomendaciones. El vínculo con cliente también |
| E4 | Grupos de trabajo | Opcional | Atajo de asignación, no un requisito |
| E5 | Probar que el teléfono responde en el bot | Obligatorio de puesta en marcha | Escribir al número de la empresa desde ese teléfono. Si no hay jornada, el bot debe reconocer a la persona y decir que no hay operación. Eso valida identidad, no el fichaje |

No existe invitación al colaborador. No descarga una app. Su “onboarding” es: estar cargado con el teléfono correcto.

## Fase F — Primera operación

| # | Paso | Tipo | Nota |
|---|---|---|---|
| F1 | Crear operación sobre un servicio ya geolocalizado | Obligatorio | `/operations/new` |
| F2 | Elegir puntual o recurrente | Obligatorio | Recurrente con horario de empresa exige que el horario semanal exista |
| F3 | Elegir un horario o varios turnos | Obligatorio | Default `SINGLE` |
| F4 | Revisar tolerancias (heredan las de la empresa) | Configurable | Se pueden pisar por operación |
| F5 | Asignar personas: individual, lote, grupo o recomendación | Obligatorio | La recomendación no asigna sola |
| F6 | Confirmar que aparecen jornadas | Obligatorio | En recurrente las materializa el servicio post-alta y el job de horizonte |
| F7 | No esperar un WhatsApp “te asignaron” | Automático: no se envía | El aviso siguiente es el recordatorio de confirmación, si el job está activo |

## Fase G — Prueba de punta a punta

Hacerlo con un teléfono de prueba y un lugar real o un pin de oficina, antes de activar la operación del cliente.

| # | Paso | Resultado esperado |
|---|---|---|
| G1 | Desde el teléfono del colaborador de prueba, pedir el menú | Saludo y opciones según módulos |
| G2 | Confirmar asistencia cuando llegue el recordatorio, o usar “Confirmar asistencia” | La jornada queda confirmada |
| G3 | Escribir “Llegué” dentro del horario y compartir ubicación dentro del radio | Mensaje de llegada registrada. El panel muestra VALID, distancia y hora |
| G4 | Repetir fuera del radio (o con el simulador, solo interno) | Registro REJECTED o PENDING_REVIEW según margen. No “desaparece” |
| G5 | Escribir “Me voy” y compartir ubicación | Salida registrada |
| G6 | Con otro caso, avisar no disponibilidad | Alerta al responsable y, si hay candidatos, pedido de reemplazo |
| G7 | Abrir Inicio y la ficha de asistencia | Los casos de prueba se leen sin entrar a la base |
| G8 | Disparar o esperar el reporte diario | Mail con resumen y XLSX a los destinatarios |

G4 en producción deja un registro real. Para la demo comercial, preparar esos casos como datos, no improvisarlos en vivo si el margen todavía no está definido.

## Fase H — Operación normal

A partir de aquí el ciclo es diario, no de proyecto:

1. Cargar o importar operaciones y asignaciones.
2. El sistema pide confirmación y recuerda llegada y salida.
3. El responsable mira Inicio.
4. Corrige a mano lo que el terreno no pudo fichar.
5. Al día siguiente recibe el correo.
6. En el mes, mira Estadísticas (y el mensual, si el worker está activo).

## Qué puede esperar el cliente el día 1 vs. la semana 1

| Día 1 | Semana 1 |
|---|---|
| Empresa, owner, reglas, 1 cliente, 2–3 lugares con mapa, un puñado de colaboradores, 1 operación de prueba, un fichaje real | Import masivo, grupos, turnos, alertas afinadas, primera semana de reporte diario |

## Checklist corto para el equipo de implementación

- [ ] Empresa ACTIVE y owner aceptó
- [ ] Workers de WhatsApp, alertas y reporte diario encendidos
- [ ] Teléfonos sin colisión entre empresas
- [ ] Timezone, radio, tolerancias y horario semanal revisados (no dejar 20:30–03:00 si el cliente es diurno)
- [ ] Alertas activadas y al menos un destinatario con WhatsApp y email
- [ ] Servicios con pin verificado
- [ ] Colaboradores activos con teléfono
- [ ] Operación asignada y jornada visible
- [ ] Fichaje de prueba VALID dentro de radio
- [ ] Fichaje de prueba fuera de radio entendido (rechazo o revisión)
- [ ] Salida de prueba
- [ ] Inicio del día coherente con esos registros
- [ ] Un envío real de reporte diario comprobado (no darlo por hecho)

## Fuera de este onboarding

Recibos de sueldo, cuotas, observabilidad, simulador y reporte mensual sin UI no son pasos para dejar la asistencia funcionando.
