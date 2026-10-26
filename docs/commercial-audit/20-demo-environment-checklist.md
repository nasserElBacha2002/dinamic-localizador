# 20 — Checklist del entorno demo

Preparar **Dinamic Demo** como tenant aparte. No usar la empresa productiva. Quien prepara el tenant puede usar la consola interna; quien graba y quien presenta, no.

Día D es el día en el que se abren el inicio y los videos de llegada. D−1 es el día del correo. La historia de recomendaciones necesita jornadas en las semanas anteriores a D.

Reloj de D: las capturas del inicio se hacen con Recepción y Guardia ya empezadas, y con Cobertura torre todavía por empezar (18:00).

## Empresa

| Dato | Estado esperado | Slides |
|---|---|---|
| Nombre Dinamic Demo, activa | Visible solo si alguna captura lo muestra. No hace falta en portada | Todas |
| Zona horaria Buenos Aires | El “hoy” del inicio coincide con el día de grabación | 02, 10, 13 |
| Radio 150 m, margen 80 m | Palermo y Clínica usan esa regla | 03, 09, 12 |
| Llegada temprana 30 min, tarde 15 min | Sofía puede quedar “tarde” y no “rechazada” | 09, 10 |
| Horario base 08:00–17:00, lunes a viernes 08:00–17:00, sábado 08:00–13:00 | Ninguna captura muestra 20:30–03:00 | 15, Setup |
| Salida con ubicación: sí | VIDEO-03 pide ubicación | 08 |
| Correcciones manuales: sí | El discurso de la slide 17 es verdadero | 17 |
| Alertas activas, modo en el que “no puede ir” y el reemplazo salen por WhatsApp | VIDEO-05 recibe opciones en el teléfono | 11 |
| Reporte diario activo, 08:00, destinatario `operaciones@demo.dinamic.test` | SS-21 es un correo real del día D−1 | 13 |
| Módulos: asistencia, operaciones, ausencias, reportes. Recibos apagados. Simulador apagado | El menú de Valeria no muestra simulador ni recibos | Todas |
| Workers de recordatorios, alertas y reporte diario encendidos en ese ambiente | Sin esto, 11 y 13 no tienen material | 11, 13 |

## Usuarios

| Dato | Estado esperado | Slides |
|---|---|---|
| Valeria Gómez, ADMIN u OWNER, mail `@demo.dinamic.test` | Única sesión de captura y de presentación | Todas las de panel |
| Su teléfono es el destinatario WhatsApp de alertas operativas | Recibe VIDEO-05 | 11 |
| Marina Ruiz, SUPERVISOR | Existe por si preguntan. No se usa en la presentación | Ninguna, salvo SS-27 en Setup |
| Nadie entra a la grabación como administrador de plataforma | No aparecen Observabilidad ni Simulador | Todas |

## Clientes

| Dato | Estado esperado | Slides |
|---|---|---|
| Hotel Central | Activo. Hilo principal | 03, 04, 06, 07 |
| Clínica Norte | Activo. Julián, Camila, Nina | 09, 10, 12 |
| Torre Corporativa | Activo. Diego y la cobertura | 11 |
| Sin otros clientes | La lista, si se abre, tiene tres filas | SS-03 |

## Servicios

Elegir direcciones públicas reales el día de locación y anotarlas en el parte de grabación. El nombre es ficticio. El pin tiene que cubrir el punto donde se para el teléfono.

| Lugar | Cliente | Estado esperado | Slides |
|---|---|---|---|
| Hotel Central Palermo | Hotel Central | Radio 150 m. El círculo cubre el punto de VIDEO-02 y VIDEO-03. Localidad Palermo | 03, 06, 07, 08 |
| Hotel Central Centro | Hotel Central | Se crea en VIDEO-01. No se ficha ahí, salvo VIDEO-08 si se graba aparte | 01 del video, 04 |
| Clínica Norte Belgrano | Clínica Norte | Radio 150 m. Sirve para el pendiente de Julián, aunque el punto se haya tomado en otro momento controlado | 09, 12 |
| Torre Corporativa Microcentro | Torre Corporativa | Radio 150 m. No hace falta pararse ahí para el video de reemplazo | 11 |

## Colaboradores

Todos activos. Teléfonos que no existan en otra empresa.

| Persona | Teléfono | Tipo | Cliente | Zona | Estado esperado | Slides |
|---|---|---|---|---|---|---|
| Lucía Fernández | +54 9 11 5555-0001 | Fijo | Hotel Central | Cerca de Palermo | Llega y se va en D. También trabajó ayer | 05, 07, 08, 13 |
| Mateo Álvarez | +54 9 11 5555-0002 | Fijo | Hotel Central | Cerca de Palermo | Llegó en D, sin salida | 06, 08 |
| Sofía Romero | +54 9 11 5555-0003 | Eventual | Hotel Central | Cerca de Palermo | Llegada tarde válida en D | 06, 10 |
| Julián Pereyra | +54 9 11 5555-0004 | Eventual | Clínica Norte | Cerca de Belgrano | Pendiente, 150–230 m, hasta VIDEO-07 | 09, 12 |
| Camila Duarte | +54 9 11 5555-0005 | Fijo | Clínica Norte | Cerca de Belgrano | Asignada en D, sin llegada | 10 |
| Diego Molina | +54 9 11 5555-0006 | Eventual | Torre Corporativa | Cerca de Microcentro | Avisa que no va al turno de las 18:00 | 02, 11 |
| Elena Vargas | +54 9 11 5555-0007 | Fijo | Torre Corporativa | Cerca de Microcentro | Historia en ese lugar. Candidata probable | 11 |
| Hugo Benítez | +54 9 11 5555-0008 | Eventual | Torre Corporativa | Cerca de Microcentro | Candidato probable | 11 |
| Bruno Salas | +54 9 11 5555-0009 | Fijo | Torre Corporativa | Cerca de Microcentro | Tercer candidato probable. Doble turno solo si se graba VIDEO-08, y en ese caso en Centro, no en la Torre a las 18:00 | 11 |
| Irene Costa | +54 9 11 5555-0010 | Fijo | Hotel Central | Cerca de Palermo | Equipo de recepción. No hace falta mostrarla | Ninguna |
| Pablo Núñez | +54 9 11 5555-0011 | Fijo | Hotel Central | Cerca de Palermo | Ayer confirmó y no fue | 10, 13 |
| Nina Acosta | +54 9 11 5555-0012 | Eventual | Clínica Norte | Cerca de Belgrano | Ausencia aprobada que cubre su guardia de D | Inicio, si la cifra de justificadas se ve. No es titular |

Irene y Bruno intercambian el papel respecto del borrador de `13`: Bruno queda en Torre para poder ser candidato real. Irene queda en Hotel Central. No poner a Irene en el discurso del reemplazo.

## Historia previa

Antes de D, cargar jornadas ya cerradas, en el mismo tenant:

- Elena, Hugo y Bruno con varias jornadas en Torre Corporativa Microcentro durante las últimas semanas, parte de ellas juntos con Diego.
- Lucía y Mateo con jornadas en Palermo, para que la semana de estadísticas no arranque en cero.
- Al menos una llegada tarde de Sofía en la semana, si se quiere que la pestaña por empleado no dependa de un solo día.
- Zonas de residencia cargadas. Sin zona, el criterio de cercanía no se ve, aunque el video de reemplazo igual puede funcionar por los otros dos criterios.

Esto alimenta la slide 14 y la calidad de las opciones de la slide 11. No se proyecta la historia previa como tal.

## Operaciones

| Operación | Cuándo | Lugar | Personas | Estado al congelar el inicio | Slides |
|---|---|---|---|---|---|
| Cierre de ayer | D−1, 09:00–17:00 | Palermo | Pablo, Lucía | Pablo confirmó, sin llegada. Lucía llegó y se fue | 10, 13 |
| Recepción mañana | D, 09:00–17:00 | Palermo | Lucía, Mateo, Sofía | Lucía completa. Mateo sin salida. Sofía tarde | 02, 06, 07, 08, 10 |
| Guardia clínica | D, 08:00–16:00 | Belgrano | Julián, Camila, Nina | Julián pendiente. Camila sin llegada. Nina justificada | 02, 09, 10, 12 |
| Cobertura torre | D, 18:00–23:00 | Microcentro | Diego, y después quien cubra | Antes del video: Diego asignado. Después: no disponible y cobertura | 02, 11 |
| Recepción recurrente | Lun–vie, Palermo | El mismo equipo | Existe para que haya horizonte. No se abre en la reunión | Ninguna |

No crear un cupo. No crear un responsable dentro de la operación.

## Asistencias

| Caso | Cómo obtenerlo | No hacer | Slides |
|---|---|---|---|
| Lucía en hora, &lt; 80 m, origen WhatsApp | VIDEO-02 en la puerta | Carga manual, formulario de prueba | 07, 17 |
| Lucía con salida | VIDEO-03 | — | 08 |
| Mateo en hora, sin salida | Fichaje real o, si no se filma, carga manual **solo si en la ficha se nota que no es WhatsApp**. No usar su ficha como prueba de la slide 07 | No darle salida | 08 |
| Sofía tarde, llegada válida | Fichaje dentro de los 15 min posteriores al inicio, o el resultado real equivalente | No dejar que pase a rechazo | 10 |
| Julián pendiente, 150–230 m | Un punto real en esa banda, antes de las fotos | No aprobarlo antes de SS-13 y SS-01 | 09, 12 |
| Camila sin registro | No fichar | No cargarle una llegada “para completar” | 10 |
| Pablo confirmó, sin llegada, D−1 | Confirmación real o el estado que el producto guarde al confirmar, y ninguna llegada | No marcarlo como “avisó que no” | 10, 13 |
| Rechazo lejano | Opcional, una fila, no hero | No usarlo como VIDEO-02 | 09, solo si existe |

## Ausencias

| Dato | Estado esperado | Slides |
|---|---|---|
| Nina, ausencia aprobada que cubre la guardia de D | La jornada no se cuenta como falta seca | Cifra de justificadas, si se ve. No es slide propia |
| Una solicitud pendiente, si se captura SS-15 | Solo anexo | Admin Guide |

Diego no es una solicitud de ausencia. Es no disponibilidad de ese turno.

## Reemplazos

| Dato | Estado esperado | Slides |
|---|---|---|
| Antes de VIDEO-05 | Diego asignado, turno no iniciado, sin cobertura | El video |
| Después | Diego no disponible, una cobertura real, SS-10B tomado | 11 |
| Nombres | Los que devuelva el producto. Verificar en el ensayo. No escribir Elena en la diapositiva | 11 |

## Estadísticas

| Dato | Estado esperado | Slides |
|---|---|---|
| Semana con días previos y con D | General no vacío | 14 |
| Incidencias con más de un tipo | SS-18 usable en el anexo | Reporting |
| Por empleado y por lugar | SS-19 y SS-20 | Reporting |

Capturar estadísticas después de los fichajes de D y antes o después de aprobar a Julián, pero no mezclar: anotar en el nombre del archivo si Julián ya estaba aprobado. Preferible antes, para que “revisión” siga existiendo si alguna cifra se cuela.

## Reportes

| Dato | Estado esperado | Slides |
|---|---|---|
| Correo real del reporte de D−1 en la casilla demo | SS-21 | 13 |
| XLSX de ese correo, hoja Resumen | SS-22 | 13 |
| Si el cuerpo del mail no nombra a Pablo | No se agrega. El Excel o la lista de asistencias de ayer muestran el caso | 13 |

Disparar el reporte de D−1 el día anterior, no en mitad de la grabación de fichajes.

## WhatsApp

| Prueba | Resultado | Si falla |
|---|---|---|
| Desde el teléfono de Lucía, un “hola” de ensayo | La nombra, o muestra el menú de una persona conocida | No grabar VIDEO-02 |
| El punto de ensayo cae dentro de Palermo | Distancia &lt; 150 m | Mover el pin o el equipo. Borrar o no usar esa llegada de ensayo en la jornada que se va a filmar |
| Diego puede avisar no disponibilidad | El turno de las 18:00 lo acepta | No filmar VIDEO-05 |
| Valeria recibe opciones | Mensaje real con hasta tres nombres | No escribir el mensaje a mano |
| Teléfonos únicos entre empresas | Ninguno de los `5555-00xx` está activo en otro tenant | Cambiar el número, no “elegir empresa” en el chat |

## Congelados que no se pueden rehacer sin perder la historia

1. SS-01, SS-02 y SS-13, antes de VIDEO-07.
2. SS-12, después de VIDEO-02 y antes de cualquier edición manual de esa fila.
3. SS-10, después de los tres estados de Recepción y antes de cargar una salida a Mateo.
4. SS-10B, inmediatamente después de VIDEO-05.
5. SS-21, cuando el correo de D−1 ya llegó. No regenerarlo si eso cambia el día que Pablo representa.

## Qué no cargar

Recibos, usuarios de plataforma en la lista, clientes reales de Dinamic, más de tres clientes, grupos a la vista en la presentación, panel de recomendación abierto.
