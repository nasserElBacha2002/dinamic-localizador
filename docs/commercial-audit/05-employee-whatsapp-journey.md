# 05 — Recorrido del colaborador por WhatsApp

No hay app. El colaborador existe en el sistema cuando un administrador lo carga con teléfono, y habla con el número de WhatsApp de Dinamic Attendance (Twilio).

Webhook: `POST /api/webhooks/twilio/whatsapp` → `whatsappBotService.handleWebhook` → `whatsapp-router.service.ts`.

Los textos salientes de recordatorios programados viven en plantillas de Twilio Content (SID por entorno). El texto exacto de esas plantillas **no está en el repositorio**. Los textos de abajo son los que el backend arma en código y sí se pueden citar.

## Antes del primer mensaje

| Hecho | Consecuencia |
|---|---|
| No está cargado, está inactivo, o el teléfono no coincide | *No encontramos un empleado activo asociado a este número…* (`UNKNOWN_EMPLOYEE_MESSAGE`) |
| El mismo teléfono está activo en dos empresas | El bot no elige. Mensaje de empresa ambigua |
| Está cargado y activo | El bot lo saluda y le ofrece el menú que corresponda a los módulos |

No hay alta, DNI ni invitación por chat. `employee.service.ts` documenta que el alta interactiva no dispara WhatsApp.

Resolución de empresa (`whatsappCompanyContextService.resolve`): sesión vigente → teléfono único → número Twilio si hay una sola empresa → otros fallbacks de plataforma. Para un cliente nuevo, el caso sano es teléfono único.

## Menú

Si escribe algo que no es una orden, cae al menú (`handleMenuFallback`, sesión `WAITING_MENU_SELECTION`).

Opciones que el código construye, cada una si el módulo está activo (`bot-menu-options.ts`, `whatsapp-module-gate.ts`):

| Opción | Para qué |
|---|---|
| Marcar llegada | Check-in |
| Marcar salida | Check-out |
| Avisar ausencia o vacaciones | Solicitud de ausencia |
| Consultar jornada de hoy | Qué tiene hoy |
| Ver próximos turnos | Agenda |
| Confirmar asistencia | Voy |
| Avisar no disponibilidad | No voy a esa jornada |
| Consultar recibo de sueldo | Módulo aparte |

También entiende frases sueltas, sin pasar por el número del menú (`backend/src/utils/intent.ts`): “Llegué”, “ya llegué”, “estoy acá”, “Me voy”, “salí”, “ya terminé”, pedidos de ausencia, etc.

Comandos globales: ayuda, menú, cancelar. Cancelar responde *Flujo cancelado. Ahora podés iniciar otra operación.*

Saludo base (`GREETING_MESSAGE`): pide compartir ubicación o decir “Llegué” o “Me voy”.

Sesión conversacional: TTL `BOT_SESSION_TTL_MINUTES` (default 15). Si vence: *La solicitud anterior venció…* (`EXPIRED_SESSION_USER_MESSAGE`). No es lo mismo que la ventana de confirmación de asistencia, que dura hasta el horario de inicio.

## Historia B — de la asignación al fichaje

### 1. Le asignan una jornada

El administrador asigna en el panel. **El colaborador no recibe un WhatsApp en ese momento.** Test de producto: la asignación no genera outbox de WhatsApp.

### 2. Le piden que confirme

Si el recordatorio está activo (default sí, 24 h antes) el job `attendance-reminder` envía la plantilla de confirmación. La persona responde en ese hilo.

| Respuesta | Resultado | Texto en código |
|---|---|---|
| Confirma (opción 1 o intent) | Jornada confirmada | *✅ Participación confirmada.* (`attendance-confirmation-response.handler.ts`) |
| No puede (opción 2) | No disponible y se abre reemplazo | *Registramos que no vas a poder asistir…* |

También puede confirmar desde el menú, hasta el inicio del turno (exclusivo). Textos de servicio: *Confirmamos tu asistencia para:* / *Entendido. Registramos que no estás disponible…* (`employee-workday.service.ts`).

### 3. Llega el horario

Recordatorios salientes (plantilla Twilio, texto no versionado): aviso de llegada ~15 min, aviso de salida, aviso de que no hubo llegada al inicio.

### 4. Marca llegada

```text
"Llegué" o menú "Marcar llegada"
  → el sistema busca jornadas en las que puede fichar ahora
  → 0: no hay operación asignada para este momento
  → 1: pide la ubicación
  → varias: lista numerada y espera que elija
  → la persona comparte la ubicación de WhatsApp (un punto, no rastreo)
  → motor de asistencia (documento 06)
  → mensaje de resultado
  → queda el registro
```

Pedido de ubicación (`buildLocationRequestMessage`): indica la jornada y pide compartir la ubicación.

Si manda la ubicación sin texto previo, el sistema intenta inferir si es llegada o salida (`direct-attendance-location.service.ts`).

### 5. Mensajes de resultado de la llegada

| Situación | Qué se le dice | Qué queda guardado |
|---|---|---|
| Dentro de radio y de horario | *Tu llegada fue registrada correctamente.* Puede aclarar si fue tarde | `VALID` + distancia + hora + coords |
| Cerca, fuera del radio pero dentro del margen | Queda pendiente de revisión (`buildReviewRequiredMessage`) | `PENDING_REVIEW` |
| Lejos | *❌ No pudimos validar tu llegada.* (`buildOutsideRadiusMessage`) | `REJECTED`, igual persiste |
| Fuera de la ventana horaria | Rechazo por horario | `REJECTED` temporal |
| Ya había fichado esa jornada | *Ya registraste tu llegada para este trabajo.* | No duplica |
| Ubicación reenviada | *No podemos usar una ubicación reenviada…* | No crea asistencia. Alerta de seguridad |
| No hay jornada | Mensaje de que no hay operación para ahora | Nada |
| Había una ausencia aprobada y aun así llegó | Aviso de llegada durante ausencia | El registro se crea y puede abrir conflicto operativo |

Después de una llegada válida, el bot puede recordar la salida (`CHECKOUT_REMINDER`): cuando termine, que vuelva a compartir la ubicación.

### 6. Marca salida

“Me voy” / menú “Marcar salida”.

| Caso | Comportamiento |
|---|---|
| Hay llegada y `requireCheckoutLocation` es true (default) | Pide ubicación y valida geocerca |
| No hay llegada | Puede registrar salida sin llegada |
| La empresa no exige ubicación de salida | Cierra sin punto |
| Ubicación de salida rechazada | Persiste con estado de checkout rechazado |

Varias jornadas abiertas: lista numerada, igual que en la llegada.

### 7. Avisa que no va a una jornada

Menú “Avisar no disponibilidad” o la respuesta al recordatorio.

Efecto: la jornada queda `UNAVAILABLE`, el responsable recibe alerta (si las alertas están activas) y el sistema arma un pedido de reemplazo con hasta 3 candidatos. El colaborador no elige al reemplazo.

### 8. Pide una ausencia o vacaciones

Menú o frases del tipo “quiero pedir vacaciones”.

Estados: tipo de pedido → tipo de ausencia → fechas → motivo → confirmación.

Tres clases (`absence-kind-options.ts`): *No voy a una jornada*, *Informar una ausencia*, *Solicitar vacaciones* (esta última se oculta si el tipo no está activo).

Al quedar pendiente, puede alertar al administrador. La aprobación sigue en el panel.

### 9. Consulta

Jornada de hoy y próximos turnos: solo lectura. Recibo de sueldo: solo si ese módulo está contratado.

## Errores y cómo se recupera

| Qué pasa | Qué ve | Cómo sigue |
|---|---|---|
| Sesión de 15 min vencida | La solicitud anterior venció | Vuelve a escribir “Llegué” o abre el menú. La confirmación de asistencia no depende de esos 15 min |
| Demasiados intentos inválidos | El flujo se cancela por máximo de intentos | Empieza de nuevo |
| Error no clasificado | Mensaje genérico | Reintentar |
| Mensaje duplicado de Twilio | Respuesta de duplicado | No se ficha dos veces |
| Manda ubicación en el momento equivocado | El router la encaja en llegada, salida o pide que aclare | |
| Escribe “cancelar” | Flujo cancelado | Puede empezar otro |

## Lo que el colaborador no puede hacer

- Registrarse
- Ver el mapa del radio
- Corregir un fichaje rechazado (lo ve el administrador)
- Elegir reemplazo
- Ser rastreado después de enviar el punto
- Entrar al panel

## Secuencia mínima para filmar

Teléfono de demo, colaborador cargado, una sola jornada de hoy, pin del servicio en el lugar donde se graba, margen ya definido.

1. Mensaje “Hola” → menú.
2. “Llegué”.
3. Compartir ubicación.
4. Mensaje verde de llegada registrada, con lugar y hora.
5. Corte. La salida puede ser otro video de 10 segundos.

No filmar el caso de rechazo como si fuera el camino feliz. Ese caso va en el capítulo de incidencias, con el panel al lado mostrando que el intento quedó asentado.
