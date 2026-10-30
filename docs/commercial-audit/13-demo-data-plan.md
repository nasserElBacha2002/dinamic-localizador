# 13 — Datos de demo

Dataset ficticio para capturas y videos. Ningún nombre, teléfono, mail ni dirección de una persona real. Los teléfonos son de la forma +54 9 11 5555-00xx y los mails `nombre.apellido@demo.dinamic.test`.

La empresa de grabación tiene que ser un tenant aparte, no la empresa productiva de Dinamic Systems.

## Empresa

| Campo | Valor |
|---|---|
| Nombre visible | Dinamic Demo |
| Timezone | America/Argentina/Buenos_Aires |
| Radio default | 150 m |
| Margen de revisión | 80 m |
| Llegada temprana | 30 min |
| Llegada tarde | 15 min |
| Horario base | 08:00–17:00 (no dejar el default 20:30–03:00) |
| Horario semanal | Lunes a viernes 08:00–17:00, sábado 08:00–13:00 |
| Salida con ubicación | sí |
| Alertas admin | activas |
| Modo | el que se vaya a filmar. Si el video de reemplazo es por WhatsApp, las alertas urgentes no pueden estar solo en email |
| Reporte diario | activo, 08:00, destinatario `operaciones@demo.dinamic.test` |
| Módulos | attendance, operations, absences, reports. Recibos apagado salvo un anexo. Simulador apagado |
| Usuario de grabación | Valeria Gómez, rol ADMIN u OWNER. No usar platform admin |

Supervisora adicional, solo si se captura la lista de usuarios: Marina Ruiz, SUPERVISOR.

## Clientes

| Cliente | Para qué está |
|---|---|
| Hotel Central | El hilo principal de la demo |
| Clínica Norte | Segundo cliente, para que la lista no tenga una sola fila |
| Torre Corporativa | Tercero, puede quedar sin operación del día para mostrar cartera |

## Lugares (servicios)

Cargar con pin real de una dirección pública, radio 150 m. Elegir para el video un lugar donde el equipo pueda pararse dentro del radio. Los nombres son ficticios; la coordenada tiene que ser verdadera para que el mapa y el fichaje coincidan.

| Servicio | Cliente | Localidad (texto) | Uso en la historia |
|---|---|---|---|
| Hotel Central Palermo | Hotel Central | Palermo | Lugar del fichaje filmado |
| Hotel Central Centro | Hotel Central | San Nicolás | Segundo lugar del mismo cliente, sin video |
| Clínica Norte Belgrano | Clínica Norte | Belgrano | Llegada tarde y pendiente de revisión |
| Torre Corporativa Microcentro | Torre Corporativa | San Nicolás | Operación de mañana, reemplazo |

Formato de lugar, si se quiere mostrar el campo: “Hotel”, “Clínica”, “Oficina”. No es obligatorio para los videos.

## Colaboradores

Todos eventuales o fijos, activos, con teléfono del rango demo. Zona de residencia cargada cerca del lugar donde se los va a recomendar; si no, el ranking de cercanía sale vacío y el panel de recomendación se ve pobre.

| Persona | Tipo | Cliente | Lugar habitual | Rol en la demo |
|---|---|---|---|---|
| Lucía Fernández | Fijo | Hotel Central | Palermo | Ficha en VIDEO-02, llegada válida |
| Mateo Álvarez | Fijo | Hotel Central | Palermo | Segundo asignado, presente en hora |
| Sofía Romero | Eventual | Hotel Central | Palermo | Llegada tarde (dentro de 15 min) |
| Julián Pereyra | Eventual | Clínica Norte | Belgrano | Pendiente de revisión (punto en el margen) |
| Camila Duarte | Fijo | Clínica Norte | Belgrano | No fichó. Es el “nunca llegó” |
| Diego Molina | Eventual | Torre Corporativa | San Nicolás | Avisó que no puede. Dispara el reemplazo |
| Elena Vargas | Fijo | Torre Corporativa | San Nicolás | Candidata 1 del reemplazo. Tiene historia en ese lugar |
| Hugo Benítez | Eventual | Torre Corporativa | San Nicolás | Candidato 2 |
| Irene Costa | Fijo | Hotel Central | Palermo | Candidata 3, o persona del segundo turno |
| Pablo Núñez | Fijo | Hotel Central | Palermo | Confirmó y no fue, en una jornada de ayer |
| Nina Acosta | Eventual | Clínica Norte | Belgrano | Ausencia aprobada (justificada) |
| Bruno Salas | Fijo | Torre Corporativa | San Nicolás | Dos turnos el mismo día, solo si se filma VIDEO-08 |

Hace falta historia previa (jornadas ACTIVE de las últimas semanas) para Elena en Torre Corporativa y para el equipo de Diego, si se quiere que la recomendación no arranque en cero. El algoritmo mira co-presencia, experiencia en el servicio y zona. Sin pasado, el orden existe pero el relato “conoce el lugar” no se ve.

## Operaciones del día D (día de captura)

Fecha relativa: “hoy” es el día que se abre el inicio en cámara. “Ayer” alimenta el mail. “Mañana” es la cobertura que todavía se puede elegir.

| Operación | Lugar | Horario | Personas | Qué tiene que verse |
|---|---|---|---|---|
| Recepción mañana | Hotel Central Palermo | hoy 09:00–17:00 | Lucía, Mateo, Sofía | Lucía válida en hora. Mateo válida. Sofía LATE válida |
| Guardia clínica | Clínica Norte Belgrano | hoy 08:00–16:00 | Julián, Camila, Nina | Julián PENDING_REVIEW. Camila sin llegada. Nina JUSTIFIED por ausencia |
| Cobertura torre | Torre Corporativa Microcentro | mañana 09:00–18:00 | Diego, y luego Elena | Diego UNAVAILABLE. Reemplazo COVERED por Elena si el video ya se tomó; si se va a filmar en vivo, dejar el pedido PENDING |
| Cierre de ayer | Hotel Central Palermo | ayer 09:00–17:00 | Pablo, Lucía | Pablo CONFIRMED sin llegada (`CONFIRMED_BUT_ABSENT`). Lucía válida, para que el mail no sea solo falla |
| Doble turno (opcional) | Hotel Central Centro | hoy, dos turnos que estén abiertos a la hora de grabar | Bruno | VIDEO-08 |

Una operación recurrente de lunes a viernes en Hotel Central Palermo, con el mismo equipo, sirve para la frase “no se carga cada día” y para que el horizonte de jornadas no esté vacío. No hace falta mostrarla si el tiempo es corto.

## Asistencias que tienen que existir antes de capturar el inicio

| Caso | Persona | Resultado |
|---|---|---|
| Normal | Lucía, Mateo | VALID, ON_TIME, dentro del radio, distancia creíble (menos de 80 m) |
| Tarde | Sofía | VALID, LATE |
| Revisión | Julián | PENDING_REVIEW, OUTSIDE_GEOFENCE, distancia entre 150 y 230 m |
| Rechazo (opcional, una fila) | se puede omitir en la lista principal | REJECTED lejos. Si se muestra, que sea una fila, no el hero |
| Sin llegada | Camila | jornada esperada, sin registro |
| Justificada | Nina | ausencia aprobada |
| Avisó que no | Diego | UNAVAILABLE |
| Confirmó y faltó | Pablo, ayer | CONFIRMED + sin llegada |
| Salida hecha | Lucía | checkout registrado, para el video de salida y para que “sin cierre” no sean todos |
| Sin salida | Mateo | llegada sí, salida no, para el KPI “Sin cierre” |

Estas filas se pueden generar con fichajes reales de prueba y, las que no dependan del GPS, con carga manual **solo si en la captura se distingue el origen**. Para SS-12 (evidencia WhatsApp) el origen tiene que ser WhatsApp de verdad. No usar el formulario de prueba.

## Grupos

“Recepción Palermo”: Lucía, Mateo, Sofía, Irene. Sirve si se muestra asignación masiva. No es indispensable.

## Qué no cargar

- Recibos, salvo anexo
- Conversaciones de observabilidad
- Usuarios platform admin en la lista visible
- Clientes o lugares con nombres de cuentas reales de Dinamic
- Más de tres clientes. Con tres se entiende; con quince la lista parece un entorno de test

## Comprobación antes de fotografiar

- [ ] Inicio de “hoy” muestra presentes, tarde, avisó que no, sin cierre y al menos una justificada
- [ ] El menú lateral no incluye Simulador ni Observabilidad
- [ ] El mapa del lugar filmado contiene el punto desde donde se va a grabar el WhatsApp
- [ ] Un envío de prueba al teléfono de Lucía la reconoce por el nombre
- [ ] El mail de ayer llegó a la casilla demo, o se dispara el trigger y se espera el correo real antes de capturarlo
- [ ] El panel de recomendación, si se va a capturar, no está titulado de un modo que obligue a decir “IA” en la reunión; si el título sigue así, esa captura no entra en la principal
