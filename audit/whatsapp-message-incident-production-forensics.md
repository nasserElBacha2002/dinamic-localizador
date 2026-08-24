# WhatsApp message incident — production forensics (Caso B)

**Mode:** READ ONLY  
**Date:** 2026-08-24  
**Investigator environment:** local developer machine (`DB_HOST=localhost:1435`, `dinamic_attendance`)  
**Classification:** **B6 — NO CONCLUYENTE** para el incidente de producción (faltan filas DB prod + Twilio Console + Content SIDs runtime)

---

## 1. Executive Summary

| Pregunta | Respuesta |
|----------|-----------|
| ¿Hubo duplicación real del mismo reminder? | **NO DEMOSTRADO** — no hay filas de producción del incidente en la DB accesible. |
| ¿Qué produjo Msg1 / Msg2? | **NO DEMOSTRADO** (sin `providerMessageSid` / `notificationType` del incidente). |
| ¿NotificationType de cada mensaje? | **NO DEMOSTRADO** en DB. Por **forma del texto** del mensaje citado: patrón 4-var con hora pegada al serviceRef + fecha tras “comienza a las” → compatible con `ATTENDANCE_CONFIRMATION_REMINDER` o `EVENTUAL_OPERATION_ASSIGNED` + body Twilio mal armado; **no** con un ARRIVAL 3-var bien mapeado. |
| ¿TemplateSid / provider SIDs? | **NO DEMOSTRADO** — Content SIDs **vacíos** en `.env` local; Twilio auth **ausente**; Twilio Console **no consultada**. |
| ¿Confirmation template mal? | **Hipótesis fuerte (texto + contrato backend)**; **body publicado NO DEMOSTRADO** sin Console. |
| ¿Assignment worker intervino? | **NO DEMOSTRADO** para el incidente. En DB local: **0** filas `whatsapp_operation_assignment_notifications` recientes. |
| ¿Se puede cerrar Caso B en esta sesión? | **No.** Falta acceso a producción (o export) + Twilio Content bodies. |

**Labels**

```text
CASO B NO DEMOSTRADO (producción)
HIPÓTESIS TRABAJO: B1 (eventos distintos + confirmation/assignment body incorrecto)
PRODUCCIÓN NO ACCEDIDA
CONTRATO BACKEND CONFIRMADO EN CÓDIGO
```

---

## 2. Incident identifiers

Referencia del usuario (captura / copy):

| Campo | Valor observado | Resuelto en DB local |
|-------|-----------------|----------------------|
| Empleado (display) | `Nasser El Bacha` | **No encontrado.** Solo `nasser-prueba`, `yibril el bacha`. |
| Lugar (serviceRef) | `Tienda Formosa 456 - Buenos Aires` | **No encontrado** como `name`. Existe `prueba-casa` con address `Formosa 456, C1424BZJ…` (serviceRef distinto). |
| Fecha/hora | `24/08/2026` `20:00` | No hay operación Formosa con `scheduled_start` ≈ 24/08 20:00 ART asignada a Nasser. Closest Formosa ops: test/Phase0A, sin notificaciones. |
| `companyId` | — | **NO DEMOSTRADO** para el incidente |
| `employeeId` | — | **NO DEMOSTRADO** |
| `operationId` | — | **NO DEMOSTRADO** |
| `operationAssignmentId` | — | **NO DEMOSTRADO** |
| `scheduledStart` | — | **NO DEMOSTRADO** |

### Acceso forense disponible

| Fuente | Resultado |
|--------|-----------|
| DB local `localhost:1435` / `dinamic_attendance` | Conectada; datos de integración/prueba, no incidente prod |
| Content SIDs en env | Todos **vacíos** |
| Twilio Account/Auth | **Ausentes** |
| Logs `WHATSAPP_NOTIFICATION_SENT` del incidente | **No disponibles** en esta máquina |
| Twilio Content Template Builder | **No revisado** (sin credenciales / sesión Console) |

---

## 3. Timeline

**Timeline del incidente de producción:** **NO DEMOSTRADO** (sin filas).

### Hallazgos negativos DB local (Formosa location `1B62266A-…` / ops Aug 20–28)

| Hora (ops) | Producer | NotificationType | Template SID | Provider SID | Resultado |
|------------|----------|------------------|--------------|--------------|-----------|
| (varios ops Formosa) | — | — | — | — | **0** attendance notifications |
| (varios ops Formosa) | — | — | — | — | **0** assignment notifications |
| (assignees Formosa) | — | — | — | — | **0** outbound correlacionados Aug20+ |

Notificaciones “SENT” recientes en DB local usan SIDs ficticios de tests (`SM_RECOVERY_INTEGRATION`, `SM_V2_CYCLE`, …) — **no** evidencia de WhatsApp real del incidente.

---

## 4. Attendance notifications

Para ops Formosa Aug 20–28 en DB local:

```text
(empty result set)
```

Config compañía (incl. `A0ECDC4C-…` de Formosa local):

```text
confirmation_reminder_enabled = true
confirmation_reminder_hours_before = 24
```

→ Un confirmation reminder teórico saldría ~24h antes de `scheduledStart` (comportamiento de código/repo). **No demuestra** el send del incidente.

---

## 5. Assignment notifications

```text
(empty for Formosa ops; empty recent assignment notifs last 14d)
```

---

## 6. Outbound correlation

Sin `notificationId` / `providerMessageSid` del incidente → correlación **NO DEMOSTRADA**.

Outbound con `Formosa` en body/vars en DB local: solo fixtures de integración (`HX_CONFIRMATION` / `ATTENDANCE_CONFIRMATION_REMINDER`, SIDs fake).

---

## 7. Twilio Content SIDs (runtime local)

| Tipo | ENV | Runtime SID (local) | Collision |
|------|-----|---------------------|-----------|
| ARRIVAL | `TWILIO_ARRIVAL_REMINDER_CONTENT_SID` | *(empty)* | N/A |
| EXIT | `TWILIO_EXIT_REMINDER_CONTENT_SID` | *(empty)* | N/A |
| NO_CHECKIN | `TWILIO_TEMPLATE_NO_CHECKIN_SID` | *(empty)* | N/A |
| CONFIRMATION | `TWILIO_ATTENDANCE_CONFIRMATION_CONTENT_SID` | *(empty)* | N/A |
| ASSIGNMENT | `TWILIO_EVENTUAL_OPERATION_ASSIGNED_CONTENT_SID` | *(empty)* | N/A |

**Colisión ARRIVAL==CONFIRMATION / etc.:** **NO DEMOSTRADO** (SIDs no configurados aquí).  
Dev log local: `[attendance-reminder] job not started because Twilio reminder configuration is incomplete`.

---

## 8. Twilio Content bodies

| Tipo | Variables backend (código) | Body actual Twilio | Correcto |
|------|----------------------------|--------------------|----------|
| ARRIVAL | 1=nombre, 2=serviceRef, 3=**hora** | **NO DEMOSTRADO** | — |
| CONFIRMATION | 1=nombre, 2=serviceRef, 3=**fecha**, 4=**hora** | **NO DEMOSTRADO** | — |
| ASSIGNMENT | 1=firstName, 2=serviceRef, 3=**fecha**, 4=**hora** | **NO DEMOSTRADO** | — |

`serviceRef` (código): `name - address - locality` — **nunca** incluye hora (`format-service-reference.ts` + tests de contrato).

---

## 9. Analysis of malformed message (textual + backend contract)

Mensaje citado:

```text
Hola Nasser El Bacha, te recordamos que tu inventario en la
Tienda Formosa 456 - Buenos Aires - 20:00 comienza a las 24/08/2026.

Cuando llegues a la tienda, enviá "Llegué" y compartí tu ubicación...
```

### Qué demuestra el texto (sin DB)

1. **Nombre completo** en saludo → encaja con `{{1}} = employeeName` (ARRIVAL/CONFIRMATION), **no** con assignment (`firstName` solo).
2. Fragmento `Tienda Formosa 456 - Buenos Aires` → encaja con `{{2}} = serviceRef` (sin hora dentro del builder).
3. Luego aparece `- 20:00` **antes** de `comienza a las 24/08/2026`.
4. Backend **nunca** pone `20:00` dentro de `{{2}}`. Por tanto `20:00` **debe** venir de **otro placeholder** del body Meta (p.ej. `{{4}}`) o de copy fijo (improbable).
5. `24/08/2026` tras “comienza a las” encaja con un slot pensado para **hora** pero alimentado con **fecha** (`{{3}}` en CONFIRMATION/ASSIGNMENT).

### Reconstrucción más parsimoniosa (hipótesis)

Si el body publicado fuera conceptualmente:

```text
... inventario en {{2}} - {{4}} comienza a las {{3}}.
```

y el backend enviara CONFIRMATION/ASSIGNMENT:

```text
{{2}} = Tienda Formosa 456 - Buenos Aires
{{3}} = 24/08/2026   (fecha)
{{4}} = 20:00        (hora)
```

entonces el render es **exactamente**:

```text
... Tienda Formosa 456 - Buenos Aires - 20:00 comienza a las 24/08/2026
```

| Slot | Valor backend (4-var) | Rol semántico correcto | Rol aparente en el body citado |
|------|------------------------|------------------------|--------------------------------|
| {{1}} | Nasser El Bacha | nombre | saludo |
| {{2}} | Tienda Formosa 456 - Buenos Aires | serviceRef | local |
| {{3}} | 24/08/2026 | **fecha** | usado como si fuera hora tras “comienza a las” |
| {{4}} | 20:00 | **hora** | pegado al serviceRef con `-` |

**ARRIVAL 3-var** (`{{3}}=hora` solamente) **no explica** por sí solo la presencia simultánea de `20:00` y `24/08/2026` en esa posición relativa **salvo** que el body invente fecha fija o use variables no enviadas por el builder.

### Copy “Llegué”

```text
COPY DESALINEADO CON PRODUCTO
```

El producto soporta ubicación directa; el template aún instruye “enviá Llegué”. **No corregir en esta etapa.**

---

## 10. Duplicate analysis

```text
DUPLICATE:        NO DEMOSTRADO (sin dos filas same type+key+two provider SIDs)
NOT DUPLICATE:    NO DEMOSTRADO (falta prueba positiva con SIDs)
NO DEMOSTRADO:    SÍ — estado formal de esta etapa
```

**Hipótesis de trabajo (no cierre):** mensajes visualmente similares = **eventos distintos** (ARRIVAL vs CONFIRMATION/ASSIGNMENT) + body Twilio desalineado → alineado a **B1**, no a **B3**.

---

## 11. Root cause

```text
ROOT CAUSE PRODUCCIÓN: NO DEMOSTRADO

WORKING HYPOTHESIS (text + code contracts only):
ROOT-B1-candidate —
Un evento 4-var (muy probablemente ATTENDANCE_CONFIRMATION_REMINDER
dado {{1}}=nombre completo) usó Content Template cuyo body mezcla
{{4}} junto al servicio y {{3}} tras "comienza a las", invirtiendo
la semántica fecha/hora esperada por el backend.
```

No afirmar “confirmation template incorrecto” como **confirmado** hasta abrir Twilio Console + filas DB.

---

## 12. Next-stage corrections (solo si se confirma)

Pendientes **después** de evidencia prod:

1. Abrir Twilio Content de `TWILIO_ATTENDANCE_CONFIRMATION_CONTENT_SID` (y ARRIVAL / ASSIGNMENT) y corregir body a:
   - CONFIRMATION: `{{3}}=fecha`, `{{4}}=hora`, copy de **confirmación de participación** (no “te recordamos / comienza a las” de arrival).
2. Diferenciar copy ARRIVAL vs CONFIRMATION (UX).
3. Actualizar instrucción de ubicación (quitar obligatoriedad de “Llegué” si se mantiene location-first).
4. Verificar que Content SIDs no estén colisionados en env prod.
5. **No** desactivar jobs / cambiar ventanas hasta cerrar forense.

### Datos que faltan (checklist para cerrar B)

En **producción** (o dump):

1. Resolver `employeeId` por nombre/teléfono del colaborador.
2. Resolver `operationId` por serviceRef + `scheduled_start` 24/08/2026 20:00 ART.
3. Ejecutar `audit/sql/whatsapp-notification-incident-forensics.sql` con esos IDs y ventana `[start-48h, start+1h]`.
4. Listar filas `whatsapp_attendance_notifications` / `whatsapp_operation_assignment_notifications` / `whatsapp_messages`.
5. Pegar Content SIDs runtime (HX…) y bodies desde Twilio Console.
6. Correlacionar cada mensaje WhatsApp del teléfono con `providerMessageSid`.

---

## Appendix A — Queries ejecutadas (local)

Ver `audit/sql/whatsapp-message-incident-result.txt`.

## Appendix B — Semantic verdict on observed text only

| Claim | Status |
|-------|--------|
| El fragmento defectuoso requiere **fecha y hora** en slots distintos | **SUPPORTED** by text |
| Backend 4-var confirmation/assignment supplies fecha en `{{3}}` y hora en `{{4}}` | **CONFIRMED** in code |
| Body Twilio es `{{2}} - {{4}} comienza a las {{3}}` | **PLAUSIBLE / NOT CONFIRMED** (Console missing) |
| Es el mismo ARRIVAL duplicado dos veces | **NOT SUPPORTED** by text shape; **NOT PROVEN** either way without DB |
