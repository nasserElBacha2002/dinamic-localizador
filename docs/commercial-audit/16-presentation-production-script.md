# 16 — Guion de producción de la presentación principal

Fuente: auditoría `01`–`15`, en especial `15-presentation-master-plan.md`. Este documento no reabre el producto. Define la presentación que hay que producir.

La presentación principal se entiende sola. Los anexos (índice en `25`) se entregan después del cierre, no se proyectan.

## Decisión de arquitectura

Se mantiene la estructura de 18 páginas del plan maestro. No se convierte en un manual.

| Pieza | Uso |
|---|---|
| Presentación principal, 18 slides | Reunión de venta y primer entendimiento |
| Setup Guide | Después del sí, con quien va a cargar datos |
| Admin Guide | Responsable que va a operar el día |
| Employee Experience | Una o dos páginas para repartir al personal |
| Reporting Guide | Gerencia, cuando pregunten por el período y el archivo |

Cambio respecto del orden literal del plan maestro, y por qué:

1. La página 10 no promete una sola lista con “tarde + no vino + confirmó y no fue”. Pablo es de ayer. Camila, si el turno sigue abierto, puede verse como pendiente y no como falta cerrada. La página se arma con tres casos con fecha, no con un KPI inventado.
2. “Cobertura torre” pasa a **hoy 18:00–23:00**, no a mañana. Así el inicio del mismo día puede mostrar “Avisó que no asistiría” y el reemplazo sigue siendo elegible porque el turno no empezó. El dato de `13` decía “mañana” para poder elegir todavía; esta hora cumple esa condición y une la historia.
3. La página 3 muestra el mapa ya guardado de Palermo (el lugar del fichaje). El video de “crear un lugar” crea **Hotel Central Centro**, para no rehacer el pin donde se va a fichar. Son el mismo gesto, dos lugares del mismo cliente.
4. La página 17 no reabre el motor. Solo distingue un fichaje de WhatsApp de una carga hecha por una persona. El cierre sigue siendo la prueba de una semana.

Posicionamiento, no es un titular obligatorio:

> Attendance ordena dónde tiene que estar cada persona, a qué hora, y si el punto que envió está en ese lugar. El colaborador usa WhatsApp. Quien administra ve qué cerró y qué hay que mirar.

## Hilo de la historia

```text
Hay gente que debería estar en un lugar.
        ↓
Al abrir el sistema, ese día ya se lee.
        ↓
El lugar es un punto y un radio. El cliente agrupa lugares.
        ↓
La persona existe porque tiene un teléfono cargado.
        ↓
El turno tiene horario y nombres.
        ↓
La persona escribe “Llegué” y comparte un punto.
        ↓
Ese punto sale válida, para revisar, o rechazada.
        ↓
También puede marcar que se va.
        ↓
Tarde, sin llegada, o “confirmó y no fue” no son la misma cosa.
        ↓
Si avisa que no puede, el responsable elige una cobertura.
        ↓
Si el punto cayó cerca, una persona lo aprueba.
        ↓
Al día siguiente llega el archivo. En el mes se ve el patrón.
        ↓
Para empezar hacen falta lugares, teléfonos y una prueba. No un proyecto de meses.
```

Empresa única en todo el material: **Dinamic Demo**. Responsable en cámara: **Valeria Gómez**. Colaboradora del fichaje: **Lucía Fernández**, en **Hotel Central Palermo**.

## Reglas de discurso

En voz alta no se dicen: endpoint, tabla, worker, Twilio, migración, job, radio en sentido técnico de red, ni “IA”.

En pantalla el lugar se llama Servicio. El comercial dice “lugar” o “sucursal” y, una sola vez, “en el sistema lo van a ver como servicio”.

No se promete aviso al reemplazante, GPS continuo, alta por chat, vacante automática ni detección de ubicación simulada.

---

## Slide 01 — Para qué existe

### Objetivo

Que el prospecto entienda el problema en una frase, antes de ver pantallas: gente que trabaja en lugares de clientes, y un responsable que no debería enterarse a la tarde.

### Mensaje principal

La asistencia se comprueba en el lugar, no con un mensaje suelto.

### Headline

Quién tiene que estar, y si está ahí

### Supporting copy

El colaborador usa el WhatsApp que ya tiene. Quien administra ve el día en un panel. No hay una aplicación para instalar.

### Visual principal

Diagrama.

### Material fuente

Diagrama nuevo, `DG-01`. No usa screenshot.

### Composición sugerida

Cuatro nodos en una sola línea, con flechas finas:

Lugar → Turno → WhatsApp → Panel

Debajo, una sola línea: “Dinamic Demo · Hotel Central · Recepción de hoy”.

Sin logos de Twilio. Sin teléfono todavía.

### Qué destacar visualmente

Las cuatro palabras. Nada más.

### Qué ocultar

Módulos, roles, mapa, menú, la palabra Servicio.

### Narración del comercial

“La situación es concreta. Hay una persona que tiene que estar en un lugar, a una hora, para un cliente. Hoy eso se entera tarde: un mensaje, una llamada, una planilla. Attendance hace dos cosas. La persona avisa desde WhatsApp, y el sistema comprueba que el punto que envió cae en ese lugar. Quien administra abre un panel y ve el día. No le pedimos al equipo que instale una aplicación.”

### Transición

“Antes de mostrar cómo se carga, les muestro cómo se ve un día que ya está pasando.”

### Riesgos

Si esta página lista funciones, la siguiente pierde fuerza. No adelantar el reemplazo ni el Excel.

---

## Slide 02 — El día, al abrirlo

### Objetivo

Ver el producto en uso antes de ver la carga. El prospecto tiene que poder señalar un número y decir qué pregunta responde.

### Mensaje principal

Al abrir el sistema, el día ya está resumido.

### Headline

El día se lee al abrir

### Supporting copy

Quién ya está, quién llegó tarde, quién avisó que no va y quién todavía no cerró la salida.

### Visual principal

Screenshot anotado.

### Material fuente

`SS-02`, tomado de `SS-01`. Video de apoyo en la versión de 20 minutos: `VIDEO-06`.

### Composición sugerida

Captura del inicio, recortada a las cifras. Cuatro llamadas, no doce:

- Presentes
- Llegadas tarde
- Avisó que no asistiría
- Sin cierre

Una nota al pie, chica: “Dinamic Demo · hoy”.

### Qué destacar visualmente

Esos cuatro números. El cursor no debe estar encima.

### Qué ocultar

Menú lateral, resto de tarjetas, operaciones de más abajo, cualquier ítem Simulador u Observabilidad.

### Narración del comercial

“Esto es el inicio de hoy, en una empresa de demostración. No hace falta recorrer la lista para saber cómo va el día. Hay gente que ya llegó. Hay una llegada tarde. Hay alguien que avisó que no va a poder. Y hay una jornada que todavía no tiene salida. Cada una de estas cifras se puede abrir. Ahora les muestro de dónde sale: el lugar, la persona y el turno.”

### Transición

“Nada de esto existe si el lugar no tiene un punto en el mapa.”

### Riesgos

Los cuatro números tienen que ser reales en la captura. Si “Avisó que no” está en cero, no se anota: la cobertura de Diego tiene que ser hoy, antes de las 18:00. No anotar “Cobertura incompleta” salvo que el número sea mayor a cero. No decir que Camila ya figura como falta si en pantalla sigue pendiente.

---

## Slide 03 — El lugar

### Objetivo

Entender que la sucursal es un punto y un círculo. Ese círculo es el que después acepta o no la llegada.

### Mensaje principal

El lugar de trabajo queda marcado en el mapa.

### Headline

Un punto y un radio de 150 metros

### Supporting copy

Hotel Central Palermo. La llegada se va a medir contra este círculo, no contra la dirección escrita.

### Visual principal

Screenshot anotado.

### Material fuente

`SS-06`. En la versión de 20 minutos se puede pasar antes `VIDEO-01`, que muestra el alta de Hotel Central Centro. No sustituye esta captura.

### Composición sugerida

Mapa ocupando la mayor parte. El círculo entero entra en el recorte. Callout sobre el círculo: “150 m”. Nombre del lugar arriba: “Hotel Central Palermo”.

Una línea secundaria, no un título: “En el sistema este lugar figura como servicio.”

### Qué destacar visualmente

Pin, círculo, nombre, 150 m.

### Qué ocultar

Coordenadas numéricas, identificadores, botón de guardar si ya está guardado, menú.

### Narración del comercial

“Este es el lugar donde vamos a fichar. Hotel Central, en Palermo. En el mapa hay un punto y un círculo de 150 metros. Cuando la persona comparta su ubicación, Attendance mide la distancia a este punto. Si está dentro, la llegada puede valer. Si cayó cerca, afuera del círculo, queda para que alguien la mire. Si está lejos, no se valida. En la pantalla ustedes lo van a ver con el nombre servicio. Es el lugar de trabajo.”

### Transición

“Palermo no está suelto. Pertenece a un cliente, que puede tener más de un lugar.”

### Riesgos

Si el círculo se corta, la página no se entiende. Si el video de alta se proyecta en lugar de esta foto, el prospecto ve Centro y el fichaje es en Palermo: decirlo, o no pasar el video en la versión corta.

---

## Slide 04 — El cliente

### Objetivo

Ver que el cliente agrupa lugares y personas. No es el mapa.

### Mensaje principal

Un cliente puede tener varios lugares.

### Headline

Hotel Central tiene dos lugares

### Supporting copy

Palermo y Centro. Las personas de ese cliente se ven en la misma ficha. El cliente no reemplaza al mapa.

### Visual principal

Screenshot.

### Material fuente

`SS-04`.

### Composición sugerida

Ficha de Hotel Central. A la vista: los dos lugares. Si entra sin apretar, los nombres de Lucía, Mateo y Sofía. No hace falta mostrar Clínica Norte en esta página.

### Qué destacar visualmente

El nombre del cliente y los dos lugares.

### Qué ocultar

Formularios de formato, identificadores, pestañas vacías.

### Narración del comercial

“Hotel Central es el cliente. Tiene dos lugares: Palermo, que es donde vamos a fichar, y Centro. En la misma ficha están las personas habilitadas para ese cliente. El cliente ordena la cartera. El punto y el radio siguen estando en cada lugar.”

### Transición

“Esas personas no se registran solas. Alguien las carga, y lo que importa es el teléfono.”

### Riesgos

No decir que el cliente tiene dirección o geocerca. No abrir la lista de los tres clientes salvo que pregunten: eso es `SS-03`, anexo.

---

## Slide 05 — La persona

### Objetivo

Entender que el colaborador no tiene usuario ni aplicación. El teléfono cargado es lo que WhatsApp reconoce.

### Mensaje principal

Si el teléfono está cargado, WhatsApp sabe quién escribe.

### Headline

La persona entra con su teléfono

### Supporting copy

Lucía Fernández ya está cargada. Desde ese número puede fichar. No se da de alta por chat.

### Visual principal

Screenshot.

### Material fuente

`SS-08`.

### Composición sugerida

Ficha o formulario de Lucía, recortado. Visibles: nombre, teléfono `+54 9 11 5555-0001`, tipo Fijo, cliente Hotel Central. Nada más.

### Qué destacar visualmente

Teléfono y nombre.

### Qué ocultar

Zona, categoría, pestañas de estadísticas, historial, identificadores.

### Narración del comercial

“Lucía no descarga nada y no crea una cuenta. La cargamos nosotros, con el teléfono desde el que va a escribir. A partir de ahí, cuando escribe al número de Attendance, el sistema la reconoce. Si el teléfono no está, o está mal, la respuesta es que no hay una persona asociada a ese número. No hay un registro por WhatsApp.”

### Transición

“Lucía ya está. Falta el turno en el que tiene que estar hoy.”

### Riesgos

No mostrar un teléfono real del equipo. No implicar que el alta le envía un mensaje: no lo envía.

---

## Slide 06 — El turno

### Objetivo

Ver que el trabajo es un lugar, un horario y personas asignadas. La asignación no les escribe en el acto.

### Mensaje principal

El turno queda armado antes de que nadie llegue.

### Headline

Hoy, de 9 a 17, en Palermo

### Supporting copy

Recepción mañana. Lucía, Mateo y Sofía están asignados. El aviso para confirmar llega aparte, no en el momento de asignar.

### Visual principal

Video.

### Material fuente

`VIDEO-04` como gesto de asignar. Congelado final o apoyo: `SS-10` de Recepción mañana, ya con estados del día. `SS-09` solo si hace falta mostrar que hay más de un turno en la lista.

### Composición sugerida

Se reproduce el video (asignar a Lucía y a Mateo). Al terminar, se deja `SS-10`: el mismo turno, más tarde, con Lucía presente, Mateo sin salida y Sofía tarde. Un rótulo chico: “El mismo turno, después de las llegadas.”

### Qué destacar visualmente

Lugar, horario, tres nombres.

### Qué ocultar

Tolerancias, modo recurrente, turnos múltiples, panel de recomendación, la palabra IA.

### Narración del comercial

“Este es el turno de hoy en Palermo, de 9 a 17. Se elige el lugar, el horario y las personas. En el video se asigna a Lucía y a Mateo. Sofía entra en el mismo turno. Asignar no les manda un WhatsApp en ese instante. Lo que reciben después, si está activo, es el pedido de confirmación: voy, o no voy a poder. En la ficha de la derecha ya es más tarde: Lucía llegó, Sofía llegó tarde, Mateo todavía no marcó la salida.”

### Transición

“Ahora vemos qué hace Lucía desde el teléfono.”

### Riesgos

Si `SS-10` se toma antes de los fichajes, no muestra estados y el rótulo “después de las llegadas” miente. El video de asignar se graba antes; la foto del equipo, después. No decir que pueden tener dos turnos el mismo día salvo pregunta: eso es `VIDEO-08`, fuera de la versión corta.

---

## Slide 07 — Llegué

### Objetivo

Ver el mismo hecho en el teléfono y en el panel. Es el momento central de la reunión.

### Mensaje principal

Un punto enviado desde el lugar deja la llegada registrada.

### Headline

Llegué, y el lugar queda comprobado

### Supporting copy

Lucía escribe desde WhatsApp, comparte su ubicación y la llegada queda con hora y distancia.

### Visual principal

Composición WhatsApp + panel.

### Material fuente

`VIDEO-02` y `SS-12`.

### Composición sugerida

Izquierda: teléfono con la conversación real de Lucía. Derecha: detalle de esa asistencia. Entre ambos, una flecha fina: “el mismo evento”.

En el teléfono tienen que leerse, como mínimo, “Llegué”, el pedido de ubicación y la confirmación de llegada registrada. En el panel: hora, distancia en metros, Hotel Central Palermo, origen por WhatsApp.

### Qué destacar visualmente

El botón de compartir ubicación en el momento en que se usa. En el panel, la distancia y la hora.

### Qué ocultar

Identificadores de mensaje, coordenadas crudas, menú del panel, otros fichajes.

### Narración del comercial

“Lucía está en Palermo. Escribe Llegué. Attendance le pide la ubicación, una sola vez, la de ese momento. Ella la comparte como se comparte cualquier ubicación en WhatsApp. No la seguimos después. Del otro lado, la misma llegada aparece con la hora y los metros hasta el lugar. Si el punto está dentro del círculo y dentro del horario, la llegada queda registrada. Esto es lo que ve el colaborador y lo que ve el responsable. Es el mismo hecho.”

### Transición

“Llegar no cierra el turno. También se puede marcar la salida.”

### Riesgos

El punto de grabación tiene que caer dentro de los 150 m. Si el video termina en “no pudimos validar”, no se usa en esta página. No reescribir las burbujas: si el texto real difiere en una palabra, se deja el texto real y se ajusta la narración, no el chat.

---

## Slide 08 — Me voy

### Objetivo

Entender que la jornada puede cerrarse, y que quien no marca la salida queda abierto.

### Mensaje principal

La salida también queda registrada.

### Headline

La jornada se cierra al irse

### Supporting copy

Lucía marca la salida desde el mismo WhatsApp. Mateo llegó y todavía no la marcó: en el inicio figura sin cierre.

### Visual principal

Video.

### Material fuente

`VIDEO-03`. Apoyo estático: recorte de `SS-02` en “Sin cierre”, o la fila de Mateo en `SS-11`.

### Composición sugerida

Teléfono a pantalla completa durante el video. Al final, una pastilla al lado: “Mateo · sin salida”. No hace falta otro mapa.

### Qué destacar visualmente

“Me voy” y el mensaje de salida registrada.

### Qué ocultar

La llegada anterior, si alarga el plano. El video empieza en “Me voy”.

### Narración del comercial

“Cuando Lucía termina, escribe Me voy y vuelve a compartir el punto. La salida queda en la misma jornada. No es un rastreo de la tarde: es un segundo punto, el de cuando se va. Mateo, en cambio, llegó y no marcó la salida. Por eso en el inicio hay una jornada sin cierre. Alguien puede cargarla después desde el panel, y esa carga queda distinta de un WhatsApp.”

### Transición

“Hasta ahora vimos el camino en el que el punto entra. Hay otros dos resultados.”

### Riesgos

No decir que la salida siempre exige ubicación en todos los clientes. En esta demo sí, porque así está configurada. No mostrar la salida de Lucía como si Mateo también la hubiera marcado.

---

## Slide 09 — Tres resultados

### Objetivo

Entender la regla sin ver configuración: dentro, cerca, lejos. El intento rechazado no desaparece.

### Mensaje principal

La llegada sale válida, para revisar, o rechazada.

### Headline

Dentro, cerca, o lejos

### Supporting copy

Dentro del círculo y del horario, la llegada vale. Apenas afuera, queda para que una persona la mire. Lejos, no se valida, y el intento queda asentado.

### Visual principal

Diagrama.

### Material fuente

`DG-02`, más miniaturas de `SS-12` (Lucía, válida) y `SS-13` (Julián, para revisar). El rechazo no lleva video. Si existe una fila real de rechazo, puede ser una tercera miniatura tomada de `SS-11`; si no existe, el diagrama igual tiene la tercera rama, marcada como “el intento queda guardado”, sin fingir una captura.

### Composición sugerida

Tres columnas, mismo punto de partida “comparte ubicación”:

1. Dentro — Lucía — llegada registrada. Tono de hecho correcto.
2. Cerca — Julián — pendiente de revisión. Tono de atención.
3. Lejos — no se valida. Tono de problema.

Debajo, una línea: “Llegar tarde, dentro de la tolerancia, sigue siendo una llegada válida. Queda marcada como tarde.”

### Qué destacar visualmente

Las tres palabras de estado, en lenguaje de la pantalla si el español del producto es otro: no traducir “válida” si el badge dice otra cosa. Usar el texto que se vea en `SS-11`.

### Qué ocultar

Metros de configuración, nombres de estados en inglés, el margen de 80 m en esta página. El margen se explica en la 12, no como parámetro.

### Narración del comercial

“Hay tres salidas. Si Lucía está dentro del círculo y dentro del horario, la llegada queda registrada. Aunque haya llegado tarde: tarde, dentro de la tolerancia, sigue siendo una llegada, y se ve como tarde. Si el punto cae un poco afuera, no se tira. Queda pendiente para que Valeria lo apruebe o lo rechace. Eso le pasó a Julián, en Clínica Norte. Si el punto está lejos, la persona recibe que no se pudo validar, y el intento igual queda en el panel. No hace falta instalar nada para que esta regla corra. Hace falta el lugar bien marcado.”

### Transición

“Tarde, sin llegada y ‘confirmó y no fue’ no son el mismo problema.”

### Riesgos

`SS-13` tiene que existir antes de aprobar a Julián. No llamar “rechazo” a la llegada tarde de Sofía. No decir que el margen existe en toda empresa: en la demo está en 80 m; de fábrica viene vacío.

---

## Slide 10 — Cuando el día no cierra

### Objetivo

Separar tres situaciones que en una planilla suelen verse como “faltó”.

### Mensaje principal

Cada problema queda con un nombre distinto.

### Headline

Tarde no es lo mismo que no vino

### Supporting copy

Sofía llegó tarde. Camila todavía no fichó. Pablo ayer confirmó que iba, y no fue.

### Visual principal

Composición de tres cards.

### Material fuente

Filas reales: Sofía y Camila en `SS-11` (hoy). Pablo en el tramo de ayer de `SS-11`, o en `SS-21` si el mail lo nombra. No inventar una cuarta tarjeta.

### Composición sugerida

Tres columnas con fecha:

| Hoy | Hoy | Ayer |
| Sofía Romero | Camila Duarte | Pablo Núñez |
| Llegó tarde | Sin llegada | Confirmó y no fue |
| Hotel Central Palermo | Clínica Norte Belgrano | Hotel Central Palermo |

### Qué destacar visualmente

El estado de cada una, no la foto de la persona.

### Qué ocultar

El resto de la tabla, filtros, Julián (es la página 12), Diego (es la página 11).

### Narración del comercial

“Sofía llegó a Palermo después del horario, pero dentro de lo que la empresa tolera. La llegada vale y queda como tarde. Camila tenía guardia en Clínica Norte y no fichó. Mientras el turno sigue, se ve que esa llegada no está. Pablo es de ayer: confirmó que iba y no fue. Eso no se mezcla con quien avisó a tiempo. Mañana, en el correo, el caso de Pablo ya está cerrado. El de Camila se cierra cuando el día termina.”

### Transición

“Hay otro caso distinto: la persona avisa antes, y hay que cubrirla.”

### Riesgos

No decir “falta injustificada” si la pantalla de Camila todavía dice pendiente. No poner a Diego en esta página.

---

## Slide 11 — Avisó que no puede

### Objetivo

Ver que el hueco se entera por WhatsApp y que una persona elige la cobertura. Nadie queda asignado solo.

### Mensaje principal

Quien no puede ir avisa, y el responsable elige con quién cubrir.

### Headline

Avisó que no puede. Alguien lo cubre.

### Supporting copy

Diego no va a la Torre esta tarde. Valeria recibe hasta tres personas y elige una en el mismo WhatsApp. La cobertura queda en el turno.

### Visual principal

Video.

### Material fuente

`VIDEO-05`. Cierre estático: `SS-10B`, la operación Cobertura torre después de la elección.

### Composición sugerida

El video ocupa la página. En los últimos segundos, o como fotograma final, el turno de las 18:00 con Diego en no disponible y la persona elegida como cobertura.

No escribir en la diapositiva los nombres que “deberían” salir primeros. Los nombres son los que el video muestre.

### Qué destacar visualmente

El mensaje de no disponibilidad, las opciones en el teléfono de Valeria, la elección, el turno actualizado.

### Qué ocultar

Puntajes, pesos, la palabra IA, el panel de recomendación de la web.

### Narración del comercial

“Diego tiene la Torre esta tarde y avisa que no puede. Valeria no se entera porque alguien miró el panel de casualidad: le llega un WhatsApp. Ahí hay hasta tres personas, ordenadas por si ya trabajaron con ese equipo, si conocen ese lugar y si están cerca. Ella elige una. No elige el sistema. La cobertura queda asignada a ese turno. Lo que este video no muestra, porque el producto no lo garantiza en ese paso, es un aviso automático a la persona que cubre. Eso se confirma por el canal de ustedes.”

### Transición

“El otro caso incómodo es el punto que cayó cerca, pero afuera.”

### Riesgos

Si el WhatsApp de Valeria no llega, no se escribe a mano. Si los tres nombres no son los esperados, el video igual sirve: no se parchean burbujas. No decir “inteligencia artificial” aunque la pantalla web use esa palabra: esa pantalla no se proyecta.

---

## Slide 12 — Lo duda una persona

### Objetivo

Ver que “cerca, afuera” no se aprueba solo ni se pierde.

### Mensaje principal

Lo que cayó cerca lo decide el responsable.

### Headline

Cerca del lugar, alguien lo revisa

### Supporting copy

Julián fichó en Clínica Norte, un poco fuera del círculo. Valeria lo aprueba o lo rechaza, con un motivo.

### Visual principal

Video.

### Material fuente

`VIDEO-07`. La página quieta, si no se reproduce el video, es `SS-13` antes de confirmar.

### Composición sugerida

Detalle de Julián con la distancia visible y el diálogo de revisión. El motivo que se escribe en cámara es corto y humano: “Estaba en la puerta, el punto cayó afuera.”

### Qué destacar visualmente

Distancia, estado pendiente, motivo, botón de aprobar.

### Qué ocultar

Coordenadas, identificadores, el resto de la lista.

### Narración del comercial

“Julián llegó a Clínica Norte y el punto cayó un poco afuera del círculo. No lo dimos por bueno y no lo borramos. Quedó para revisar. Valeria abre el fichaje, escribe por qué lo aprueba y confirma. Si no correspondía, lo rechaza con el mismo gesto. Quien está en el lugar puede tener permiso para hacer esto sin ser quien administra toda la empresa. El motivo queda guardado.”

### Transición

“Todo esto del día no se queda solo en la pantalla. A la mañana siguiente llega el archivo.”

### Riesgos

Grabar y fotografiar el pendiente antes de aprobarlo. Si se aprueba primero, `SS-13` y el número de revisión del inicio dejan de existir. No mostrar el formulario de alta manual en esta página.

---

## Slide 13 — A la mañana siguiente

### Objetivo

Ver que el día anterior llega solo, en un correo con archivo.

### Mensaje principal

El resumen del día anterior llega por correo.

### Headline

A la mañana, el día anterior llega solo

### Supporting copy

El correo de Dinamic Demo incluye el cierre de ayer. Pablo está ahí: confirmó y no fue. Lucía también: su jornada cerró bien.

### Visual principal

Screenshot.

### Material fuente

`SS-21` y, al lado o en el clic siguiente si el diseño lo parte, `SS-22` hoja Resumen. Si el diseño exige una sola página, el correo es la principal y el Excel es una franja.

### Composición sugerida

Correo real, ancho de lectura. Asunto y destinatario `operaciones@demo.dinamic.test` visibles. Una franja del Excel en la hoja Resumen, no el explorador de archivos.

### Qué destacar visualmente

Que es un correo recibido, y una mención visible a una incidencia de ayer (Pablo) junto a un caso correcto (Lucía).

### Qué ocultar

Cabeceras técnicas, rutas de archivo, otras carpetas, datos de servidores.

### Narración del comercial

“Esto no se exportó a mano para la reunión. Es el correo que llega a la mañana, con el día anterior y un archivo. Ahí está el caso de Pablo, que confirmó y no fue, y también el de Lucía, para que el día no sea solo una lista de problemas. Quien opera mira el inicio. Quien no entra al sistema igual recibe el cierre.”

### Transición

“Un día explica el incidente. Varios días muestran si es un hábito.”

### Riesgos

No capturar un mail armado en un editor. Si el envío real no llegó, esta página no se fabrica: se usa el disparo real del reporte y se espera el correo. No prometer que todas las alertas del día salen por WhatsApp: varias viven en este correo.

---

## Slide 14 — El patrón

### Objetivo

Ver que el período se puede mirar por persona, por lugar y por tipo de problema, sin armar el Excel a mano.

### Mensaje principal

La semana muestra el patrón, no solo el caso.

### Headline

La semana muestra quién y dónde

### Supporting copy

Presentismo, llegadas tarde e incidencias del período. El corte es por persona, por turno y por lugar.

### Visual principal

Screenshot.

### Material fuente

`SS-17` (General) como principal. `SS-18` (Incidencias) como segunda vista si la página se duplica en el anexo; en la principal, una sola, General, con una llamada a “Incidencias”.

### Composición sugerida

Pestaña General, rango de la semana demo. Tres números como máximo superpuestos en callouts: presentismo, puntualidad, incidencias. No redibujar el dashboard entero.

### Qué destacar visualmente

El rango de fechas y un gráfico o una cifra de presentismo, si la pantalla la muestra.

### Qué ocultar

La barra de filtros abierta, el resto de pestañas, export en el momento de la captura.

### Narración del comercial

“Esto ya no es hoy. Es la semana. Se puede ver el presentismo, la puntualidad y qué tipo de problemas se repiten. Si quiero saber si es una persona, abro por colaborador. Si quiero saber si es un lugar, abro por lugar. No hay una pestaña que se llame cliente: el cliente se mira a través de sus lugares. El archivo del mes también llega por correo. No hay un botón de reporte mensual en la pantalla, así que no se los voy a mostrar como si existiera.”

### Transición

“Nada de lo que vimos se carga solo el primer día. El arranque es corto, y tiene un orden.”

### Riesgos

Si la semana demo no tiene historia, el gráfico sale vacío y la página se cae. La historia previa del documento `20` es obligatoria antes de esta captura. No decir “por cliente”.

---

## Slide 15 — Cómo empieza

### Objetivo

Que el arranque se sienta como días, no como un proyecto de implantación. Sin mostrar la consola interna.

### Mensaje principal

Dinamic abre la empresa. El cliente carga lugares, personas y el primer turno.

### Headline

La primera operación se prueba en días

### Supporting copy

Nosotros abrimos la empresa y el acceso. Ustedes preparan lugares, teléfonos y quién recibe los avisos. Juntos probamos un fichaje. Al día siguiente tiene que llegar el correo.

### Visual principal

Timeline.

### Material fuente

`DG-03`. Sin screenshot de plataforma.

### Composición sugerida

Cinco hitos en una línea:

1. Dinamic abre la empresa
2. Se ajustan horario, radio y avisos
3. Se cargan lugares y personas
4. Se prueba un fichaje real
5. Llega el primer correo

Debajo: “El detalle de cada clic está en la guía de puesta en marcha. No hace falta verlo ahora.”

### Qué destacar visualmente

Quién hace cada hito: Dinamic o el cliente. Dos tonos, no más.

### Qué ocultar

Nombres de módulos, workers, invitación técnica, 2FA.

### Narración del comercial

“El primer día no se parece a esta demo, porque la demo ya tiene una semana adentro. El camino real es este. Nosotros creamos la empresa y les llega el acceso a quien va a administrar. Se ajusta el horario, el radio y quién recibe los avisos. Ustedes cargan los lugares, con el punto en el mapa, y las personas, con el teléfono. Armamos un turno y hacemos un fichaje de prueba en la puerta real. Al día siguiente miramos si el correo llegó. Recién ahí se abre el resto de la operación. La guía de puesta en marcha queda para ese momento. No la vamos a recorrer ahora.”

### Transición

“Para ese primer turno, lo que necesitamos de ustedes cabe en una lista corta.”

### Riesgos

No prometer “queda andando el mismo día” si falta el padrón o el pin. “Días” es la frase segura. No mostrar la pantalla de crear empresa.

---

## Slide 16 — Qué tienen que preparar

### Objetivo

Cerrar el alcance sin abrir configuración. El prospecto se va sabiendo qué junta.

### Mensaje principal

Hace falta el padrón y los lugares, no una definición técnica.

### Headline

Lugares, teléfonos y un responsable

### Supporting copy

Dirección de cada lugar. Teléfono de cada persona. Quién administra y quién debe recibir un aviso. El horario con el que quieren medir tarde.

### Visual principal

Cards.

### Material fuente

`DG-04`. Cuatro cards, sin captura.

### Composición sugerida

1. Lugares — dirección real, la puerta donde la gente entra
2. Personas — nombre y teléfono de WhatsApp
3. Responsables — quién entra al panel y quién recibe avisos
4. Reglas — radio, qué es tarde, si la salida también se comprueba

Una línea final: “Si el padrón es grande, entra por planilla. La planilla no les escribe por WhatsApp.”

### Qué destacar visualmente

Las cuatro palabras título.

### Qué ocultar

Columnas de la planilla, formatos de archivo, cuotas.

### Narración del comercial

“De ustedes necesitamos cuatro cosas. Los lugares, con la dirección de la puerta, no un domicilio fiscal. Las personas, con el teléfono desde el que van a escribir. Quién va a administrar y quién tiene que recibir un WhatsApp cuando alguien no puede ir. Y cómo miden el horario: con cuánta anticipación se puede llegar, y a partir de qué minuto es tarde. Si son muchos, se importa una planilla. Importar no les manda un mensaje. El mensaje aparece cuando hay un turno y corresponde confirmar o fichar.”

### Transición

“Una última distinción, porque después evita discusiones.”

### Riesgos

No listar zonas, categorías, grupos ni recibos. No decir que el cliente está obligado a tener clientes cargados: es recomendable, no bloquea.

---

## Slide 17 — Qué queda asentado

### Objetivo

Confiar en el registro: hora, distancia y si vino de WhatsApp o de una persona del panel.

### Mensaje principal

Un fichaje de WhatsApp y una carga manual no se ven igual.

### Headline

Queda la hora, la distancia y el origen

### Supporting copy

La llegada de Lucía muestra que vino por WhatsApp. Si alguien la carga desde el panel porque no hubo señal, queda como carga manual. No se inventa un mensaje.

### Visual principal

Screenshot anotado.

### Material fuente

Recorte de `SS-12`. Si se quiere el contraste, una miniatura de `SS-14` vacía, sin enviar, solo en el anexo. En la principal no hace falta abrir el diálogo.

### Composición sugerida

Zoom al bloque de evidencia de Lucía: hora, metros, lugar, origen WhatsApp. Tres callouts. No la pantalla entera.

### Qué destacar visualmente

Hora, distancia, origen.

### Qué ocultar

Coordenadas en crudo, identificador del mensaje, botones de más.

### Narración del comercial

“Cuando hay una discusión, no queda solo un sí o un no. Queda la hora, los metros y si ese punto entró por WhatsApp. Si el teléfono no tenía señal, un supervisor puede cargar la llegada desde el panel. Esa carga no se disfraza de mensaje. Se ve que la cargó una persona. No guardamos el recorrido de la jornada. Guardamos el punto de la llegada y, si corresponde, el de la salida.”

### Transición

“Con esto se puede probar en serio, en un solo lugar, durante una semana.”

### Riesgos

`SS-12` tiene que ser un fichaje real de WhatsApp, no una carga manual ni el formulario de prueba. Si el origen no se llama así en pantalla, el callout usa el texto de la pantalla.

---

## Slide 18 — La prueba

### Objetivo

Pedir un siguiente paso concreto. No un “cualquier cosa nos escriben”.

### Mensaje principal

La prueba es un lugar, cinco personas y una semana.

### Headline

Un lugar, cinco personas, una semana

### Supporting copy

Se mira el inicio cada día y el correo de la mañana. Si eso responde las preguntas de la operación, se amplía.

### Visual principal

Cards.

### Material fuente

`DG-05`. Opcional, al cerrar la reunión y no dentro de la slide: `VIDEO-09`, el hero de 50 segundos, antes de esta página o en lugar del repaso verbal.

### Composición sugerida

Tres condiciones de la prueba:

- 1 lugar con la puerta bien marcada
- 5 personas con teléfono
- 1 semana de turnos reales

Al pie: “Se evalúa el inicio de cada día y el correo de la mañana.”

### Qué destacar visualmente

Los tres números: 1, 5, 1.

### Qué ocultar

Precios, módulos, anexos, código QR si no existe.

### Narración del comercial

“La forma de saber si esto les sirve no es ver más pantallas. Es un lugar, cinco personas y una semana de turnos de verdad. Durante esa semana se mira el inicio, y a la mañana el correo. Si con eso el responsable sabe quién llegó, quién faltó y qué hay que mirar, se carga el resto. La guía para el colaborador es una página: no instala nada, escribe, comparte el punto, y avisa si no puede ir. Lo dejamos para el final, no hace falta proyectarlo.”

### Transición

Fin. Las preguntas usan `23-sales-objection-handling.md`. No se abre el anexo salvo que la pregunta sea de puesta en marcha, de RR.HH. o del archivo mensual.

### Riesgos

No ofrecer el simulador como prueba. No ofrecer una prueba con datos de otra empresa. La prueba usa un tenant del prospecto, no Dinamic Demo.

---

## Páginas que no se recortan

En una reunión de 10 minutos se puede no proyectar 04, 08, 14, 16 y 17. No se recortan 02, 07, 09 y 11. El detalle de qué saltear está en `22`.

## Material a producir que no es captura

| ID | Qué es | Dónde |
|---|---|---|
| DG-01 | Diagrama de cuatro nodos | Slide 01 |
| DG-02 | Tres columnas dentro / cerca / lejos | Slide 09 |
| DG-03 | Timeline de arranque | Slide 15 |
| DG-04 | Cuatro cards de preparación | Slide 16 |
| DG-05 | Tres condiciones de la prueba | Slide 18 |
| SS-10B | Cobertura torre después del reemplazo | Slide 11 |
| VIDEO-09 | Hero de 50 s, editado | Apertura o cierre, no reemplaza las páginas |
