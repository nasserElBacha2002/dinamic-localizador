# 09 — Mapa de valor comercial

Traducción para las diapositivas. La columna técnica es lo que el código hace. La frase de valor es lo que se dice en voz alta. Si la frase promete algo que no está en las otras columnas, no se usa.

## Núcleo

| Funcionalidad | Problema | Valor | Cuidado al decirlo |
|---|---|---|---|
| Fichaje por WhatsApp, sin app | El personal eventual no instala ni actualiza una aplicación | La persona escribe desde el WhatsApp que ya tiene y la asistencia queda registrada | No decir “app” ni “rastreo” |
| Llegada y salida | Saber que entró no dice cuándo se fue | Queda la jornada abierta y cerrada, y se ve quién no marcó la salida | La salida es configurable; el default la exige con ubicación |
| Geocerca del lugar | Un mensaje “ya llegué” no prueba el lugar | Attendance comprueba que el punto enviado está en el lugar de trabajo antes de dar la llegada por válida | Es un punto voluntario, no GPS continuo. El rechazo también se guarda |
| Banda de revisión | El GPS del teléfono a veces cae a metros de la puerta | Lo que está apenas afuera no se pierde: queda para que una persona lo apruebe o lo rechace | Solo si la empresa configuró el margen. El default es vacío |
| Tolerancia de horario | El turno no empieza en el segundo exacto | Se distingue “llegó tarde” de “llegó cuando ya no correspondía fichar” | Los defaults (60 y 90 min) pueden ser demasiado laxos para mostrarlos como “la” política |
| Varias jornadas el mismo día | Hay gente con dos turnos o dos lugares | Cada jornada se ficha por separado. No se pisan en un único presente/ausente | Mostrarlo con dos turnos claros, no con una grilla técnica |
| Confirmación previa | El hueco se descubre cuando el turno ya empezó | El día anterior la persona confirma o avisa que no puede | El WhatsApp de asignación inmediata no existe. El aviso es el recordatorio de confirmación |
| Alerta al responsable | Alguien tiene que estar mirando el panel | El responsable se entera de una ausencia o de una llegada que no ocurrió sin recorrer la lista a mano | Hay que prender alertas y cargar destinatarios. Parte de los avisos pueden ir solo al mail |
| Reemplazo con candidatos | Cubrir un hueco es llamar a conocidos de memoria | El sistema propone hasta tres personas según equipo, experiencia en el lugar y cercanía, y el responsable elige en WhatsApp | No es IA generativa. No asigna solo. No hay prueba de que le avise al que cubre |
| Carga manual | El teléfono se quedó sin datos o el local no tenía señal | Un supervisor carga la llegada o la salida y queda claro que fue una carga del panel, no un WhatsApp | No se fabrican coordenadas |
| Inicio del día | La operación se entera a la tarde | Al abrir el sistema se ve quién está, quién falta, quién llegó tarde y qué operación está corta | Requiere módulo de reportes |
| Correo del día siguiente | El Excel se arma a mano | Cada mañana llega el día anterior, con el archivo | Requiere worker, SMTP y destinatarios |
| Estadísticas del período | La anécdota no muestra el hábito | Se puede ver presentismo, puntualidad e incidencias por persona, operación y lugar | No hay pestaña “por cliente”; el corte es por servicio |
| Lugares con mapa y radio | La dirección postal no alcanza para validar | Cada lugar tiene un punto y un radio que después usa el fichaje | En la UI el lugar se llama Servicio. En la presentación decir lugar o sucursal y mostrar la pantalla |
| Clientes | La operación se mezcla entre cuentas | Los lugares y las personas se pueden agrupar por cliente | El cliente no tiene mapa. Es opcional |
| Importación | La carga inicial de 200 personas no se tipea | Clientes, lugares, colaboradores y operaciones entran por planilla | La importación de personas no les escribe por WhatsApp |
| Roles | No todo el mundo debe corregir asistencia | Quien dirige configura, quien supervisa revisa, quien consulta solo mira | No mostrar la matriz de seis roles |
| Multi-empresa | Dinamic opera más de un cliente en el mismo producto | Cada empresa ve solo lo suyo | El enrutado de un único número de WhatsApp exige teléfonos que no se repitan entre empresas. Es una condición de implementación, no un slide |

## Módulos que suman si el cliente los pide

| Funcionalidad | Problema | Valor | Cuidado |
|---|---|---|---|
| Ausencias y vacaciones por WhatsApp | El pedido llega por un chat suelto | La solicitud queda tipificada y el responsable la aprueba en el panel | Calendario, saldos y adjuntos son profundidad de RR.HH., no el primer relato |
| Justificación de la jornada | Una ausencia aprobada no debería verse como falta | La jornada pasa a justificada y se separa del ausentismo | Si la persona igual ficha, el sistema lo marca |
| Grupos de trabajo | Siempre se asigna al mismo equipo, de a uno | Se previsualiza y se asigna el grupo a la operación | |
| Recomendación al armar el equipo | La primera vez no se sabe a quién llamar | Ordena candidatos con el mismo criterio del reemplazo | La etiqueta “IA” de la pantalla no debe decirse como inteligencia artificial |
| Recibos por WhatsApp | El recibo se manda por fuera | La persona lo consulta en el mismo número | Otro producto dentro del mismo login. No mezclar con el fichaje |
| 2FA | La cuenta de administrador es sensible | El acceso al panel puede exigir un segundo factor | Una línea, no un capítulo |

## Frases que no se pueden usar

| No decir | Por qué |
|---|---|
| “Inteligencia artificial asigna al personal” | El score es determinístico y un humano confirma |
| “Detectamos ubicación falsa / GPS simulado” | Solo se rechaza la ubicación reenviada de WhatsApp |
| “Controlamos la ubicación durante toda la jornada” | Hay uno o dos puntos voluntarios |
| “El colaborador se registra solo por WhatsApp” | Tiene que existir de antes, con teléfono |
| “La empresa se crea sola al contratar” | La crea Dinamic y el owner acepta una invitación |
| “Cada sucursal es una localidad del cliente” | La sucursal es un Servicio. La localidad es un texto o una zona |
| “Avisamos al instante cada excepción por WhatsApp” | Depende del modo. En email diario, varias excepciones esperan al correo |
| “Todo cliente recibe el reporte mensual desde la pantalla” | El mensual no tiene UI |
| “Hay una vacante por operación y el sistema la cubre” | No hay cupo persistido |

## Jerarquía para el relato (detalle en el documento 15)

| Clase | Piezas |
|---|---|
| WOW | Fichaje con ubicación, salida, día en el inicio, aviso de ausencia + reemplazo en WhatsApp, “confirmó y no fue” en el reporte |
| CORE | Lugar con mapa, colaborador con teléfono, operación, asignación, confirmación, tolerancias, estados válido / revisión / rechazado |
| SUPPORT | Clientes, grupos, importación, recomendación, ausencias formales, estadísticas por período, Excel |
| ADMIN | Usuarios, roles, settings, horario semanal, cuotas, formatos, zonas, 2FA |
| OMITIR | Simulador, observabilidad, costos Twilio, logs, alta de plataforma, formulario de prueba, recibos (salvo pedido), la palabra IA |
