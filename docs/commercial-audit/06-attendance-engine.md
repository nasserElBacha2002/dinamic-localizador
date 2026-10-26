# 06 — Motor de asistencia

Cómo decide el sistema si una llegada o una salida cuentan. La misma primitiva sirve al bot, a la carga manual y al simulador: `evaluateAttendanceCheckIn` en `backend/src/utils/evaluate-attendance-check-in.ts`, geocerca en `evaluateGeofence` (`backend/src/utils/attendance-validation.ts`), distancia Haversine en `utils/haversine.ts`, radio y margen en `geofence-policy.resolver.ts`.

Persistencia de llegada: `employeeWorkdayAttendanceCommand.createAttendanceForEmployeeWorkday`.
Persistencia de salida: `employeeWorkdayCheckoutCommand` y `checkout-attendance.flow.ts`.

## Diagrama lógico

```text
La persona intenta fichar (texto, menú o ubicación directa)
        │
        ▼
¿El teléfono es un colaborador activo de una sola empresa?
        │ no → mensaje de desconocido o de empresa ambigua. Fin
        ▼
¿Hay una o más jornadas en las que este fichaje tiene sentido ahora?
        │ 0 → no hay operación. Fin
        │ varias → elige en una lista numerada
        ▼
Jornada elegida: operación + servicio + turno + horario
        │
        ├─ Llegada ─────────────────────────────────────────────┐
        │                                                        ▼
        │                              ¿La ubicación es un envío original?
        │                                 no (reenviada) → rechazo sin registro + alerta
        │                                 sí
        │                                        ▼
        │                              Distancia al pin del servicio
        │                                        │
        │                    ≤ radio ────────────┼──────── > radio + margen
        │                    │                   │              │
        │                    │            dentro del margen     │
        │                    │                   │              │
        │                 INSIDE            OUTSIDE          OUTSIDE
        │                 válido            revisión         rechazo
        │                    └─────────┬─────────┘              │
        │                              ▼                        ▼
        │                    ¿Hora dentro de la ventana
        │                    [inicio − tolerancia temprana,
        │                     inicio + tolerancia tardía]?
        │                         no → REJECTED por horario
        │                         sí → VALID, o PENDING_REVIEW si la geo fue margen
        │                              (tarde sigue siendo VALID si entra en la tolerancia;
        │                               punctuality = LATE)
        │                                        │
        │                                        ▼
        │                              Se guarda el registro
        │                              (también si fue REJECTED)
        │
        └─ Salida
              ¿Hay llegada previa? puede no haberla
              ¿La empresa exige ubicación? default sí
              Misma idea de radio
              Se guarda checkout, incluso si la ubicación se rechazó
```

## Reglas, con números de fábrica

Salen de `DEFAULT_COMPANY_OPERATIONAL_SETTINGS` y se pueden pisar por empresa y, en tolerancias de llegada, por operación.

| Regla | Default | Dónde se configura | Efecto |
|---|---|---|---|
| Radio | 150 m en el servicio; si el servicio no tiene radio válido, default de empresa o `BOT_DEFAULT_RADIUS_METERS` | Servicio y settings | Dentro: `INSIDE_GEOFENCE` + válido en la parte geográfica |
| Margen de revisión | null (no hay banda hasta configurarla) | `geofenceReviewMarginMeters` | Entre radio y radio+margen: `PENDING_REVIEW`, no rechazo seco |
| Más allá del margen | — | — | `REJECTED` por ubicación. El intento se guarda |
| Llegada temprana | 60 min antes del inicio | Empresa, o minutos propios de la operación | Antes de eso: fuera de ventana |
| Llegada tarde | 90 min después del inicio | Igual | Dentro de esos 90: se registra y queda `LATE`. Después: rechazo horario |
| Early dentro de ventana | — | — | `punctualityStatus = EARLY` |
| En hora | — | — | `ON_TIME` |
| Salida con ubicación | obligatoria | `requireCheckoutLocation` | Si es false, la salida puede cerrarse sin punto |
| Corrección manual | permitida | `allowManualAttendanceCorrections` | El panel puede cargar o editar sin mensaje de WhatsApp |
| Duplicado de llegada | bloqueado | `hasActiveRecordByEmployeeWorkday` + MessageSid | Mensaje de “ya registraste” |
| Ubicación reenviada | bloqueada | `location-message-metadata.ts` | No hay registro de asistencia |
| Varias jornadas el mismo día | soportado | selección numerada | No se fusionan en un solo fichaje |
| Ausencia aprobada y aun así ficha | se registra | conflicto operativo si la feature está activa | No se tira el fichaje |
| Hora autorizada | servidor, timezone de la empresa | `operationTimezone` | El reloj del teléfono no define la ventana |

`lateGraceMinutes` figura como deprecated, solo por compatibilidad. La regla vigente de tardanza es `defaultLateArrivalToleranceMinutes` / la tolerancia de la operación.

La tolerancia de salida temprana de settings (`earlyLeaveToleranceMinutes`, 15) existe como parámetro de empresa. No convertirla en un discurso de “penalización de salida” en la presentación hasta mostrar la pantalla que el cliente vería; el relato comercial seguro es: la salida se registra y, si se exige ubicación, también se mide contra el mismo lugar.

## Qué queda guardado como evidencia

En `attendance_records` (`backend/src/types/domain.ts`):

- Coordenadas recibidas y distancia en metros
- Hora de recepción
- `validationStatus`, `locationStatus`, `punctualityStatus`, motivo
- `sourceMessageSid` cuando vino de WhatsApp
- Origen de llegada y de salida: WhatsApp o manual (`attendance-registration-source.ts`)
- Salida: hora, coordenadas, distancia, `checkoutStatus`, sid del mensaje
- Revisión: quién, cuándo, motivo
- Marca de simulación, si salió del simulador (`isSimulation`)

La carga manual no inventa coordenadas ni un sid de WhatsApp. Si el diálogo de negocio no trae punto, el registro manual no se disfraza de fichaje telefónico.

## Estados que el administrador puede encontrarse

| validationStatus | Lectura de negocio |
|---|---|
| `VALID` | Llegada aceptada. Puede ser temprana, en hora o tarde |
| `PENDING_REVIEW` | Hay que mirarla. Caso típico: apenas fuera del radio |
| `REJECTED` | No cumplió radio u horario. Igual existe la fila |

| checkout | Lectura |
|---|---|
| Salida registrada | La jornada cerró |
| Salida rechazada por ubicación | Quedó constancia del intento |
| Sin salida | El inicio la cuenta como “sin cierre” |

## Caminos que no hay que simplificar de más

1. **Rechazado no es “no pasó nada”.** El colaborador ve que no se validó y el panel puede mostrar el intento. Eso es parte del valor: el fallo deja huella.
2. **Tarde no es rechazado**, mientras entre en la tolerancia. Es un `VALID` con puntualidad `LATE`. Por eso el inicio tiene un KPI aparte de “llegadas tarde”.
3. **Pendiente de revisión no existe** si el margen está vacío. En una demo del “casi fuera del local” hay que configurar el margen antes.
4. **Una persona, varias jornadas el mismo día** es un caso de primera clase (turnos). La presentación debería mostrarlo una vez, no esconderlo: es un diferencial frente a “un fichaje por día”.
5. **No hay GPS continuo.** Un punto voluntario al llegar y, si corresponde, otro al irse.
6. **El check-out existe.** El README viejo solo cuenta la llegada. El producto actual pide la salida.

## Dónde se ve cada decisión

| Decisión | Pantalla |
|---|---|
| Radio y pin | Alta o edición de servicio, mapa |
| Tolerancias heredadas | Configuración de empresa |
| Tolerancias de esta operación | Formulario de operación |
| Resultado | Lista y detalle de asistencias |
| Aprobar el margen | `ReviewAttendanceDialog`, motivo obligatorio |
| Cargar a mano porque no hubo WhatsApp | `ManualAttendanceDialog` |

## Uso en la presentación

- Video del camino feliz (dentro de radio, en hora).
- Diagrama de una sola pantalla con las tres salidas: válida, revisión, rechazada.
- Un screenshot del detalle con distancia en metros, sin mostrar JSON ni MessageSid.
- No mostrar el simulador como si fuera el producto.
