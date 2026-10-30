# 15 — Plan maestro de la presentación

Documento de cierre. Consolida la auditoría estática del 2026-10-25. El detalle y la evidencia de archivos están en `01`–`14` de esta misma carpeta. No se ejecutó la aplicación ni se envió un WhatsApp durante la auditoría: el estado “operativo” significa que el código y la UI lo implementan, no que un entorno concreto lo tenga encendido.

## La respuesta

Si mañana se cierra un cliente, esto es lo que ocurre.

1. **Dinamic abre la empresa.** No hay registro self-serve. Un administrador de plataforma crea el tenant, elige módulos e invita al owner por email. El sistema deja settings, catálogo de ausencias, horario, zonas base y calendario. No deja clientes, lugares ni personas.
2. **El owner entra** por el link de invitación y define su contraseña. Puede invitar a un supervisor.
3. **Se revisan las reglas**, porque los defaults no sirven para cualquier negocio: timezone Argentina, radio 150 m, llegada temprana 60 min, llegada tarde 90 min, horario sugerido 20:30–03:00, alertas apagadas, margen de revisión vacío. Hay que dejarlos como opera ese cliente y encender alertas, destinatarios y reporte diario. Los workers del servidor también tienen que estar prendidos; el alta no los enciende.
4. **Se carga la estructura.** Clientes (opcionales, solo nombre). Lugares de trabajo, que en el producto se llaman **servicios**: dirección, pin y radio. Colaboradores con teléfono, que es la única identidad de WhatsApp. Opcional: categorías, zona de residencia, grupos, importación CSV/XLSX.
5. **Se crea la operación** sobre un lugar: un día o recurrente, un horario o varios turnos, tolerancias heredadas o propias. Se asignan personas. En ese momento no sale un WhatsApp de “te asignaron”.
6. **La jornada existe.** El recordatorio pide confirmar o avisar que no. El día del turno la persona escribe “Llegué”, comparte un punto, y el sistema mide horario y distancia al pin. Puede marcar “Me voy”. No hay app ni rastreo continuo.
7. **Lo que no cierra queda asentado:** tarde, apenas fuera del radio, lejos, sin llegada, sin salida, avisó que no va, confirmó y no fue, ubicación reenviada. El responsable lo ve en Inicio y, si las alertas están activas, recibe una parte por WhatsApp y el resto en el correo de la mañana.
8. **Si avisa que no puede**, el sistema propone hasta tres personas por historial de equipo, experiencia en ese lugar y cercanía. El responsable elige en WhatsApp y queda una cobertura. Eso no es un modelo de IA.
9. **Después**, el mismo dato está en el detalle de asistencia, en Estadísticas y en el Excel del día siguiente. El mensual existe como correo, sin pantalla propia.

## Qué mostrar, en qué orden

Presentación principal de unas 18 páginas, más anexos. Empezar por el día ya funcionando, no por la configuración. El setup largo es una guía aparte (`03`, `10`).

| # | Título | Objetivo | Contenido | Visual | Screenshot / video | Mensaje |
|---|---|---|---|---|---|---|
| 1 | Personas en lugares de clientes, sin una app más | Encajar el producto | Una frase y el diagrama empresa → lugar → persona → jornada | Diagrama | — | El colaborador usa WhatsApp. Quien administra usa el panel |
| 2 | Así se ve un día | Mostrar el producto en uso | Cuatro cifras del inicio | Screenshot anotado | SS-01, SS-02 | Al abrir el sistema ya se sabe quién está, quién faltó y quién llegó tarde |
| 3 | El lugar es un punto y un radio | Explicar la sucursal | En pantalla se llama Servicio. Es el lugar | Mapa | SS-06, VIDEO-01 | La asistencia se va a medir contra este círculo |
| 4 | El cliente agrupa lugares | Mostrar la cartera | Ficha de Hotel Central | Screenshot | SS-04 | Un cliente, varios lugares, varias personas |
| 5 | La persona es un teléfono | Identidad | Alta con teléfono ficticio | Screenshot | SS-08 | Si el teléfono está cargado, WhatsApp ya sabe quién es |
| 6 | El trabajo se planifica | Operación | Lugar, horario, equipo | Video + ficha | VIDEO-04, SS-09, SS-10 | No es una planilla: la jornada queda asignada |
| 7 | Llegué | El momento WOW | Chat real y la ficha que nace | Video | VIDEO-02, SS-12 | El punto enviado valida la llegada y deja hora y metros |
| 8 | Me voy | Cerrar la jornada | Salida con ubicación | Video corto | VIDEO-03 | También queda la salida, no solo la entrada |
| 9 | Tres resultados posibles | Confianza en la regla | Válida, para revisar, rechazada | Diagrama | SS-12, SS-13 | Lo dudoso no desaparece |
| 10 | Tarde no es lo mismo que no vino | Lectura operativa | Sofía tarde, Camila sin llegada, Pablo confirmó y faltó | Recorte del inicio y una fila | SS-11 | Cada falla tiene nombre |
| 11 | Avisó que no puede | Cobertura | WhatsApp del responsable con 3 opciones | Video | VIDEO-05, SS-10 | El hueco se cubre sin armar una cadena de llamados a ciegas |
| 12 | Alguien decide lo dudoso | Control | Aprobar un pendiente con motivo | Video | VIDEO-07 | La excepción cerca del radio tiene un responsable |
| 13 | A la mañana siguiente, el archivo | Hábito | Mail + hoja resumen | Screenshot | SS-21, SS-22 | El día anterior llega solo |
| 14 | El mes, por persona y por lugar | Gestión | Estadísticas General e Incidencias | Screenshot | SS-17, SS-18 | El patrón se ve sin exportar a mano |
| 15 | Cómo empieza | Bajar a tierra | Timeline de una página: abrir empresa, lugares, personas, prueba, correo | Timeline | — | No es un proyecto de meses. La primera operación se prueba en días |
| 16 | Qué necesitan ustedes | Cerrar el alcance | Teléfonos, direcciones, quién recibe alertas, reglas de tolerancia | Lista corta | — | El sistema no adivina el padrón ni el radio |
| 17 | Qué queda registrado | Confianza | Hora, distancia, origen WhatsApp o carga manual, motivo de revisión | Recorte de SS-12 | SS-12 | Una carga del panel no se disfraza de mensaje |
| 18 | Siguiente paso | Pedir la prueba | Una operación real, un lugar, cinco personas, una semana | — | — | Se mira el inicio y el primer correo |

Páginas 16–18 se acortan si la reunión es de media hora. No se recortan la 2, la 7, la 9 ni la 11.

## Dos historias

**A. Administrador.** Páginas 2–6, 10–14. Configuración fina en la guía de puesta en marcha.

**B. Colaborador.** Páginas 7–8 y 11. Anexo con menú, ausencia formal y “no hay operación para ahora”.

Convergen en la página 7: el mensaje de WhatsApp y la ficha con los metros son el mismo hecho.

## Clasificación comercial

| Clase | Qué es | En la principal |
|---|---|---|
| WOW | Fichaje con ubicación, salida, inicio del día, reemplazo en WhatsApp, “confirmó y no fue” | Sí, protagonistas |
| CORE | Lugar con mapa, teléfono, operación, asignación, confirmación, válida / revisión / rechazada | Sí |
| SUPPORT | Clientes, grupos, importación, recomendación, ausencias formales, Excel, estadísticas de período | Clientes y estadísticas sí. El resto, anexo |
| ADMIN | Usuarios, roles, settings, zonas, cuotas, 2FA, formatos | Una mención en “cómo empieza”. El resto, guía |
| OMITIR | Simulador, observabilidad, costos, logs, alta de plataforma, formulario de prueba, recibos salvo que los pidan, la palabra IA, GPS continuo, alta por chat | No |

## Arquitectura de piezas

| Documento | Cuándo se usa |
|---|---|
| Presentación principal | Reunión comercial y kickoff |
| Guía de puesta en marcha | Después del sí, con el admin del cliente. Fuente: `03` |
| Guía del administrador | Operación diaria. Fuente: `04`, `07` |
| Experiencia del colaborador | Una página para repartir, o el capítulo WhatsApp. Fuente: `05`, `06` |
| Guía de información | Gerencia. Fuente: `08` |

Un solo PDF de 80 páginas no se presenta. Se deja como carpeta.

## Qué capturar y qué dato preparar

Capturas indispensables: SS-01, SS-02, SS-04, SS-06, SS-08, SS-09, SS-10, SS-11, SS-12, SS-13, SS-17, SS-18, SS-21, SS-22.

Videos: VIDEO-01 lugar, VIDEO-02 llegada, VIDEO-03 salida, VIDEO-04 asignación, VIDEO-05 reemplazo, VIDEO-06 del número al caso, VIDEO-07 revisión. VIDEO-08 (dos turnos) solo si esa complejidad le importa al prospecto.

Datos: empresa Dinamic Demo, tres clientes, cuatro lugares, las personas y las jornadas del documento `13`. Teléfonos y mails ficticios. Pin real en el lugar donde se va a filmar.

## Qué evitar

- Entrar con platform admin.
- Mostrar el panel que dice “IA” o narrarlo como inteligencia artificial.
- Dejar el horario 20:30–03:00 y las tolerancias de 60/90 en cualquier captura de configuración.
- Filmar un fichaje feliz fuera del radio.
- Prometer aviso al colaborador que cubre un reemplazo: el código confirma al responsable; el aviso al que cubre no está evidenciado en ese servicio.
- Prometer detección de GPS falso. Solo se rechaza la ubicación reenviada.
- Prometer vacantes automáticas. No hay cupo en la operación.
- Llamar “localidad” a la sucursal. La sucursal es el servicio. La localidad es un texto y, aparte, una zona que no valida el fichaje.
- Mostrar recibos, simulador, logs o el formulario de prueba.

Detalle de bloqueos: `14`.

## Supuestos que el comercial tiene que tener resueltos antes de prometer fecha

- Número de WhatsApp de producción y teléfonos del cliente que no existan en otra empresa.
- SMTP para invitación y para el reporte.
- Workers de recordatorios, alertas y reporte diario encendidos en ese ambiente.
- Alguien del cliente con email para ser owner, y alguien con WhatsApp para recibir alertas.
- Un lugar donde se pueda hacer el fichaje de prueba dentro del radio.
- Decisión de módulos: asistencia, operaciones, ausencias y reportes. Recibos, aparte.

## Lectura recomendada

| Si se va a… | Leer |
|---|---|
| Entender qué existe | `01` |
| Dibujar el gráfico | `02` |
| Implementar al cliente | `03` |
| Guionar al administrador | `04` |
| Guionar WhatsApp | `05`, `06` |
| Hablar de fallas y reemplazo | `07` |
| Hablar de números | `08` |
| Escribir el texto de las páginas | `09` |
| Ordenar capítulos | `10` |
| Salir a fotografiar | `11`, `12`, `13`, `14` |
