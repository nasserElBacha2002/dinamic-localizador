# 25 — Índice de las guías complementarias

No son el deck. No se diseñan todavía. Cada capítulo dice qué tiene que lograr, qué pasos incluye, qué captura usa y qué no debe afirmar.

La presentación principal no enlaza estas guías en voz alta, salvo la de puesta en marcha, mencionada una vez en la slide 15.

---

## Setup Guide

Para quien va a dejar la primera operación funcionando, del lado de Dinamic y del cliente. Fuente: `03` y `20`. Lenguaje de tareas, no de pantallas internas de plataforma.

### 1. Qué hace Dinamic y qué hace el cliente

- Objetivo: separar responsabilidades antes de pedir datos.
- Pasos: abrir la empresa y el acceso; el cliente junta lugares, teléfonos y responsables.
- Capturas: ninguna de la consola de plataforma.
- Advertencia: no decir que la empresa se crea sola.
- Resultado: el cliente sabe que va a recibir un acceso, no un alta pública.

### 2. Entrar por primera vez

- Objetivo: el owner acepta la invitación y entra.
- Pasos: abrir el correo, definir contraseña, entrar. Segundo factor, como opción, no como obligación del día 1.
- Capturas: una de la aceptación, si se produce con el mail demo. No es material comercial.
- Advertencia: no mostrar recuperación de contraseña ni 2FA como capítulo largo.
- Resultado: Valeria, o el equivalente del cliente, está adentro.

### 3. Dejar las reglas del día

- Objetivo: que el horario y el radio no queden en los valores de fábrica si no sirven.
- Pasos: zona horaria, radio, banda de revisión, minutos de llegada temprana y tarde, horario semanal, salida con ubicación, quién recibe avisos, correo de la mañana.
- Capturas: SS-23 y SS-24, ya con los valores de la demo (150 m, 80 m, 30 y 15 min, 08:00–17:00). Nunca una captura con 20:30–03:00.
- Advertencia: la banda de revisión viene vacía si nadie la carga. Sin banda, lo de afuera se rechaza. Las alertas vienen apagadas hasta que se encienden. Parte de los avisos puede ir al correo y no al WhatsApp.
- Resultado: un fichaje de prueba puede salir válida, para revisar, o rechazada de forma explicable.

### 4. Cargar clientes y lugares

- Objetivo: tener al menos un lugar con pin en la puerta.
- Pasos: cliente (recomendado), lugar con dirección, mapa, radio, cliente asociado.
- Capturas: SS-03, SS-05, SS-06, y el gesto de VIDEO-01 si se quiere un anexo en movimiento.
- Advertencia: en la pantalla el lugar se llama servicio. El cliente no tiene mapa. Sin coordenadas el lugar no sirve para fichar.
- Resultado: Hotel Central Palermo guardado, círculo entero, pin donde se puede parar una persona.

### 5. Cargar personas

- Objetivo: que WhatsApp reconozca el teléfono.
- Pasos: nombre, teléfono, fijo o eventual, cliente. Zona de residencia solo si van a usar sugerencias de cercanía.
- Capturas: SS-08 y SS-07.
- Advertencia: no se les envía un WhatsApp al cargarlos. No hay invitación al colaborador. El teléfono no puede estar activo en otra empresa.
- Resultado: desde el teléfono de Lucía, un mensaje de prueba la reconoce por el nombre.

### 6. Armar el primer turno y asignar

- Objetivo: una jornada real, no un fichaje suelto.
- Pasos: lugar, fecha, horario, personas. Decir explícitamente que asignar no avisa en el acto.
- Capturas: SS-28 (formulario, sin duplicar turnos), SS-09, SS-10, VIDEO-04.
- Advertencia: no mostrar varios turnos ni recurrencia en el camino feliz. Mencionarlos en una nota: se puede repetir el horario semanal, y se puede tener más de un turno el mismo día.
- Resultado: Recepción mañana con Lucía, Mateo y Sofía, antes de fichar.

### 7. Probar WhatsApp en la puerta

- Objetivo: un fichaje válida y, si se puede, una salida.
- Pasos: “Llegué”, compartir ubicación, ver la ficha, “Me voy”.
- Capturas: VIDEO-02, VIDEO-03, SS-12.
- Advertencia: ensayar el punto antes. Si cae fuera, se mueve el pin o la persona, no el discurso. No usar el simulador con el cliente.
- Resultado: la ficha muestra hora, distancia y origen WhatsApp.

### 8. Mirar el inicio y esperar el correo

- Objetivo: cerrar la prueba de punta a punta.
- Pasos: abrir el inicio al día siguiente de un turno de prueba, o disparar el correo del día ya cerrado y esperar el mensaje real.
- Capturas: SS-01, SS-21.
- Advertencia: no dar el correo por enviado si no llegó a la casilla. No hace falta el reporte del mes para dar por buena la puesta en marcha.
- Resultado: el responsable reconoce en el inicio, o en el correo, el fichaje de prueba.

### Fuera de esta guía

Cuotas, observabilidad, costos, logs, simulador, recibos, alta de la empresa en cámara.

---

## Admin Guide

Para Valeria, o para quien abre el sistema cada día. Organizada por tarea. Fuentes: `04` y `07`.

### 1. Abrir el día

- Objetivo: saber si hay que actuar antes de recorrer listas.
- Tarea: leer presentes, tarde, avisó que no, sin cierre. Abrir solo la cifra que no sea cero.
- Capturas: SS-02, VIDEO-06.
- Advertencia: no todas las cifras son “problemas”. Presentes es el camino normal. Un aviso de “no voy” no es lo mismo que una falta.
- Resultado: una lista corta de lo que hay que mirar hoy.

### 2. Mirar un turno

- Objetivo: ver quién está asignado y qué pasó con cada uno.
- Tarea: abrir Recepción mañana, leer el equipo.
- Capturas: SS-10.
- Advertencia: no hay una vacante escrita en el turno. La cobertura es la gente asignada.
- Resultado: se distingue quién llegó, quién llegó tarde y quién no cerró.

### 3. Revisar un fichaje

- Objetivo: entender hora, distancia y origen.
- Tarea: abrir la ficha de Lucía o la de Julián.
- Capturas: SS-12, SS-13.
- Advertencia: no se muestra el recorrido del día. Se muestra el punto.
- Resultado: se puede explicar el fichaje sin salir de la ficha.

### 4. Decidir lo que quedó cerca

- Objetivo: aprobar o rechazar con motivo.
- Tarea: el camino de VIDEO-07.
- Capturas: VIDEO-07, SS-13.
- Advertencia: sin motivo no se presenta como decisión. Quien solo mira el panel puede no tener este permiso. En la guía se dice que hace falta permiso de revisión, sin nombrar la matriz de seis roles. Una frase: “quien administra y quien supervisa el lugar pueden hacerlo; quien solo consulta, no”.
- Resultado: Julián deja de estar pendiente y el motivo queda.

### 5. Cargar a mano si no hubo teléfono

- Objetivo: no perder la jornada por falta de señal.
- Tarea: abrir el diálogo vacío, explicar que no se envía en la demo, mostrar que es distinto de un WhatsApp.
- Capturas: SS-14, sin enviar.
- Advertencia: no fabricar coordenadas ni un mensaje. No usar el formulario de prueba.
- Resultado: el lector sabe que existe la carga y que se nota.

### 6. Cubrir a quien avisó que no va

- Objetivo: separar este caso de una ausencia de varios días.
- Tarea: recibir el WhatsApp, elegir una opción, ver el turno actualizado. Alternativa, nombrada y no filmada: asignar la cobertura desde el turno.
- Capturas: VIDEO-05, SS-10B.
- Advertencia: elige una persona. No decir que el sistema asigna solo ni que le avisa al que cubre. No abrir el panel que diga IA. El criterio se explica en una frase: equipo, conocimiento del lugar, cercanía.
- Resultado: el turno de las 18:00 muestra la cobertura.

### 7. Tratar una ausencia pedida

- Objetivo: aprobar, rechazar o pedir información, y ver si choca con un turno.
- Tarea: lista de ausencias y ficha de Nina. Esto es anexo, no el “no voy” de Diego.
- Capturas: SS-15, SS-16.
- Advertencia: vacaciones y licencias no se explican como el reemplazo de la slide 11.
- Resultado: una ausencia aprobada justifica la jornada y no se mezcla con “no fichó”.

### 8. Cerrar el día y leer el correo

- Objetivo: saber qué mira al día siguiente quien no entró al sistema.
- Tarea: reconocer el correo y la hoja resumen.
- Capturas: SS-21, SS-22.
- Advertencia: el correo es del día anterior. No incluye, por sí solo, la promesa de que cada alerta fue un WhatsApp.
- Resultado: Pablo y Lucía se pueden encontrar en el material del día cerrado.

### 9. Mirar la semana

- Objetivo: salir del caso y ver si se repite.
- Tarea: abrir General y, si hace falta, incidencias. Una frase sobre por persona y por lugar.
- Capturas: SS-17, SS-18. SS-19 y SS-20 en un apéndice.
- Advertencia: no hay vista “por cliente”.
- Resultado: se puede señalar un patrón sin exportar.

---

## Employee Experience

Pieza de una o dos páginas, para imprimir o mandar por el mismo WhatsApp el primer día. Sin panel, sin clientes, sin roles.

### Página 1 — Cómo fichás

- Objetivo: que la persona haga el camino feliz sin capacitación.
- Contenido:
  - No instalás una aplicación.
  - Te tienen que haber cargado con este teléfono. Si el chat dice que no te encuentra, avisale a tu responsable. No te des de alta por el mensaje.
  - Cuando te pidan confirmar, respondé si vas o si no podés.
  - Para llegar: escribí `Llegué` y compartí la ubicación cuando te la pidan. Es la de ese momento, no un envío reenviado.
  - Si hay más de un turno, elegí el que corresponde.
  - Para irte: escribí `Me voy` y, si te lo pide, compartí de nuevo la ubicación.
- Capturas: tres recortes reales del teléfono de Lucía (pedido de ubicación, llegada registrada, salida). Sin el panel al lado: eso es la slide 07, no esta pieza.
- Advertencia: no prometer el texto exacto de los recordatorios si esa plantilla no se fotografió en el teléfono. Usar los textos que sí salieron en VIDEO-02 y VIDEO-03.
- Resultado: una persona nueva sabe qué escribir.

### Página 2 — Si algo no sale

- Objetivo: que no insista ni reenvíe una ubicación vieja.
- Contenido:
  - Si dice que no hay un turno para ahora, no insistas: consultá con quien arma los horarios.
  - Si dice que no pudo validar la llegada, no estás dentro del lugar o ya no es horario. Avisale a tu responsable. No reenvíes una ubicación anterior.
  - Si quedó “para revisar”, no es que no se haya guardado. Alguien lo va a mirar.
  - Si llegaste tarde y te lo aclara, la llegada puede estar registrada igual.
  - Si no podés ir: avisalo por el mismo chat. No elijas vos al reemplazo.
  - Si el chat se trabó: escribí cancelar y volvé a empezar. Si ya te dijo que la llegada quedó registrada, no la repitas.
  - Si no tenés señal, no se puede fichar en ese momento. Tu responsable puede cargarlo después.
- Capturas: ninguna de error, salvo que se haya fotografiado un mensaje real. No se redactan burbujas de ejemplo “parecidas”.
- Advertencia: no explicar geocerca, metros ni tolerancias con números de fábrica. Se puede decir “el lugar” y “el horario”.
- Resultado: sabe cuándo avisar a una persona y cuándo volver a escribir.

No incluir: mapa del radio, estadísticas, ausencias de varios días en detalle, recibos.

---

## Reporting Guide

Para gerencia y operaciones, después de la venta o si la reunión de 30 minutos se queda en la slide 14. Fuente: `08`.

### 1. Qué veo hoy

- Objetivo: leer el día sin exportar.
- Contenido: las cifras del inicio y qué pregunta responde cada una de las cuatro que mostramos. El resto existe y no se lista entero.
- Capturas: SS-02.
- Advertencia: el inicio de hoy no es el correo de ayer.
- Resultado: se distingue presente, tarde, avisó que no, y sin cierre.

### 2. Qué recibo mañana

- Objetivo: saber qué llega solo.
- Contenido: correo del día anterior, con archivo. Qué tipo de casos trae: tarde, sin llegada, sin salida, avisó que no, confirmó y no fue, pendientes de revisión.
- Capturas: SS-21, SS-22.
- Advertencia: hay que tener destinatario y el envío activo. No se promete la hora 08:00 en todos los clientes; en la demo es esa. No se promete que el mismo contenido haya salido antes por WhatsApp.
- Resultado: se reconoce el mail como cierre operativo, no como tablero de gerencia.

### 3. Qué analizo en el período

- Objetivo: mirar la semana o el mes dentro del panel.
- Contenido: pestaña General. Se puede bajar a persona, a turno y a lugar. Filtro por fechas.
- Capturas: SS-17, SS-19, SS-20.
- Advertencia: no hay pestaña “por cliente”. El mensual por correo no se abre desde aquí.
- Resultado: se puede preguntar si el problema es una persona o un lugar.

### 4. Qué incidencias puedo detectar

- Objetivo: usar los nombres correctos.
- Contenido: tarde; sin llegada; sin salida; para revisar; rechazada por estar lejos; confirmó y no fue; avisó que no va; ausencia justificada.
- Capturas: SS-18 y las filas de SS-11.
- Advertencia: no incluir “GPS falso” ni “vacante sin cubrir” como tipo de incidencia. La ubicación reenviada no crea un fichaje.
- Resultado: gerencia no llama “falta” a las cinco cosas distintas.

### 5. Qué archivo puedo obtener

- Objetivo: saber qué se exporta y qué llega solo.
- Contenido: el Excel del correo de la mañana; el archivo del mes, si ese envío está activo, con resumen, personas, lugares, incidencias y horas; exportación desde estadísticas para quien tenga permiso de exportar.
- Capturas: SS-22. El mensual solo si se generó un archivo real en la demo. Si no se generó, el capítulo dice que existe el envío y no muestra una hoja de ejemplo dibujada.
- Advertencia: no mostrar una pantalla de “configurar mensual”. No prometer exportación a quien solo consulta, si su acceso no exporta. En la guía se dice: “quien administra puede exportar; quien solo mira, consulta en pantalla”.
- Resultado: se sabe cuál archivo es automático y cuál es una descarga.
