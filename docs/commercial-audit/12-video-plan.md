# 12 — Plan de videos

Microdemos de 5 a 30 segundos. Un video, una idea. El final tiene que verse sin narración, aunque la pieza final lleve una frase encima.

Grabar con la empresa demo, usuario administrador común, y un teléfono cuyo contacto se llame como el colaborador ficticio.

| ID | Flujo | Duración | Inicio | Acciones | Final | Mensaje |
|---|---:|---|---|---|---|---|
| VIDEO-01 | Crear un lugar | 20–25 s | Lista de servicios del cliente Hotel Central | Nuevo servicio → dirección → el mapa centra el pin → se ve el radio → guardar | El lugar queda en la lista con el cliente | El lugar de trabajo queda geolocalizado |
| VIDEO-02 | Fichaje de llegada | 20–30 s | Chat de WhatsApp vacío de esa prueba | Escribir “Llegué” → el bot pide la ubicación → compartir ubicación → mensaje de llegada registrada | Corte al detalle de asistencia con la hora y los metros | Sin app: el punto valida la llegada |
| VIDEO-03 | Fichaje de salida | 12–18 s | El mismo chat, llegada ya hecha | “Me voy” → compartir ubicación → mensaje de salida | La jornada figura cerrada en el panel | También queda la salida |
| VIDEO-04 | Asignar una operación | 20–25 s | Operación recién creada, sin equipo | Abrir equipo → elegir dos colaboradores → guardar | Los dos aparecen asignados | El trabajo tiene caras, no solo un horario |
| VIDEO-05 | No puedo ir, y se cubre | 25–30 s | Jornada de mañana confirmable, alertas activas, 3 candidatos con datos | Desde el teléfono del colaborador, avisar no disponibilidad → en el teléfono del responsable aparecen las opciones → elegir la 1 | La operación muestra la cobertura | El hueco se entera y se cubre en el mismo canal |
| VIDEO-06 | El día en el inicio | 10–15 s | Inicio ya cargado | Recorrer con el cursor presentes, tarde y “avisó que no” → clic en llegadas tarde | Cae en estadísticas o asistencias filtradas | Del número se pasa al caso |
| VIDEO-07 | Aprobar un pendiente | 12–15 s | Un `PENDING_REVIEW` abierto | Abrir revisión → motivo corto → aprobar | El estado pasa a resuelto | Lo dudoso no se pierde ni se aprueba solo |
| VIDEO-08 | Dos turnos, una persona | 15–20 s | Operación multi-turno del día, la persona con dos jornadas | En WhatsApp, “Llegué” → el bot lista los dos turnos → elegir el primero | Queda fichado ese turno y el otro sigue pendiente | Un fichaje no se come el otro turno |

## Orden de filmación

1. VIDEO-04 y VIDEO-01, porque dejan datos.
2. VIDEO-02 y VIDEO-03, en el lugar real cuyo pin coincide con el teléfono.
3. VIDEO-07, con un segundo punto apenas fuera del radio (o un caso ya cargado si no se quiere depender del GPS el día de la toma).
4. VIDEO-05, el más frágil: exige workers de alerta, destinatario y candidatos. Ensayar una vez y grabar la toma limpia.
5. VIDEO-06 al final, cuando el día demo ya tiene de todo.
6. VIDEO-08 solo si el capítulo de turnos entra. Si la reunión es corta, se omite.

## No filmar

- El simulador como sustituto del teléfono. Sirve para ensayar, no como metraje del cliente.
- Un rechazo por “ubicación reenviada”: es un caso de borde técnico.
- La importación completa: es un archivo, no un gesto.
- Crear la empresa en plataforma.
- El recorrido de los seis roles.
- Un video único de tres minutos que concatene todo. Se edita después con estas piezas.

## Pieza compuesta (opcional, en edición)

**VIDEO-09 — Un día en 45 s**, armado con cortes, no grabado de un saque:

asignación (4 s) → “Llegué” y ubicación (12 s) → ficha con metros (6 s) → inicio (8 s) → “no voy” y opción de reemplazo (15 s).

Esa pieza abre o cierra la reunión. Los videos 01–08 quedan por capítulo.

## Condiciones para que el metraje no mienta

- El radio cubre el punto desde donde se graba VIDEO-02. Probar el mismo teléfono cinco minutos antes.
- El margen existe antes de VIDEO-07.
- VIDEO-05 se graba con alertas ya activas. Si el WhatsApp del responsable no llega, no se simula con un mensaje escrito a mano.
- En VIDEO-08 los dos turnos tienen horarios que el bot considera elegibles en ese momento. Si la ventana no los incluye, el bot no va a listarlos y el video no sale.
