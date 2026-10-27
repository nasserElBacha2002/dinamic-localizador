# 10 — Storyboard de la presentación

Narrativa, no diseño de diapositivas. Sirve para armar después un PDF o un PPT.

La presentación principal tiene que poder usarse en una reunión comercial y, con los anexos, como onboarding. No es un manual de cada pantalla.

## Arquitectura documental

Conviene **no** hacer un único documento gigante.

| Pieza | Para quién | Qué contiene | Qué no contiene |
|---|---|---|---|
| Presentación principal | Prospecto y sponsor | Qué es, cómo se opera un día, qué pasa si algo falla, qué información queda | Alta de plataforma, matriz de roles, settings completos |
| Guía de puesta en marcha | Implementación + admin del cliente | Checklist del documento 03, con las capturas de carga | Observabilidad interna |
| Guía del administrador | Responsable diario | Inicio, operación, asistencia, ausencia, reemplazo | WhatsApp paso a paso del colaborador |
| Experiencia del colaborador | La misma reunión, capítulo corto, o un anexo de una página | Menú, llegada, salida, “no voy” | Panel |
| Guía de información | Gerencia / operaciones | Inicio, estadísticas, mail, Excel | Definiciones SQL |

La reunión comercial recorre la presentación principal y, si hay tiempo, el video del colaborador. La guía de setup se deja después del cierre, no se presenta entera.

## Orden lógico (corregido)

El orden “clientes → localidades → … → fichaje” se ajusta así:

```text
Qué problema resuelve
→ qué ve el responsable hoy
→ cómo está armado el lugar y la persona
→ cómo se planifica la operación
→ qué hace la persona en WhatsApp
→ cómo se decide si la llegada vale
→ qué pasa cuando no va o cuando el punto no cierra
→ qué mira la empresa después
→ cómo se pone en marcha (corto)
```

El setup largo va al anexo. Empezar por configuración pierde a quien todavía no vio el fichaje.

## Capítulos de la presentación principal

### Capítulo 1 — Qué es

**Objetivo.** Entender que es control de asistencia de personas que trabajan en lugares de clientes, por WhatsApp, con un panel para quien administra.

**Funcionalidad.** Ninguna en vivo. El modelo.

**Pantalla.** Ninguna, o el inicio ya cargado como telón, sin explicarlo todavía.

**Visual.** Diagrama del documento 02, simplificado.

**Acción.** No hay clic. Una frase: la persona no instala una app; el responsable no espera al final del día para enterarse.

### Capítulo 2 — El día, visto por quien administra

**Objetivo.** Ver el producto en uso, antes de ver cómo se carga.

**Funcionalidad.** Inicio.

**Pantalla.** `/`

**Visual.** Screenshot anotado del día demo (presentes, tarde, avisó que no va, cobertura).

**Acción.** Abrir Inicio con el día ya ocurrido. Señalar tres números y a dónde llevan. No recorrer los doce.

### Capítulo 3 — Los lugares y los clientes

**Objetivo.** Entender que cada lugar tiene un punto y un radio, y que el cliente agrupa lugares.

**Funcionalidad.** Servicios y clientes.

**Pantalla.** `/services/new` o edición con mapa, y ficha `/clients/:id`.

**Visual.** Video corto del mapa. Screenshot de la ficha del cliente con sus lugares.

**Acción.** Buscar una dirección, ver el pin, mostrar el círculo del radio, guardar. En la voz: “en el sistema este lugar se llama servicio”.

### Capítulo 4 — Las personas

**Objetivo.** Ver que el teléfono es la identidad.

**Funcionalidad.** Colaboradores.

**Pantalla.** `/employees/new` y la ficha.

**Visual.** Screenshot del formulario con teléfono visible (número ficticio).

**Acción.** Mostrar nombre, teléfono, tipo y cliente. No abrir todas las pestañas de la ficha.

### Capítulo 5 — La operación y la asignación

**Objetivo.** Ver que el trabajo se planifica sobre un lugar y se le asignan personas.

**Funcionalidad.** Operaciones, asignación, opcionalmente un grupo o la recomendación.

**Pantalla.** `/operations/new` y `/operations/:id`.

**Visual.** Video: crear una operación de un turno y asignar dos personas. Screenshot del equipo ya asignado.

**Acción.** Elegir el lugar, fecha, horario, guardar, asignar. Mencionar en una línea que puede ser recurrente o con dos turnos. No configurar los dos modos en el mismo video.

### Capítulo 6 — La persona en WhatsApp

**Objetivo.** Ver el fichaje completo.

**Funcionalidad.** Menú, llegada, ubicación, confirmación.

**Pantalla.** Conversación real de WhatsApp. Al lado, el detalle de asistencia que acaba de nacer.

**Visual.** Video 20–30 s.

**Acción.** “Llegué” → compartir ubicación → mensaje de registrada → cortar al panel con la distancia.

### Capítulo 7 — Cómo se valida

**Objetivo.** Entender las tres salidas sin entrar al código.

**Funcionalidad.** Motor de asistencia.

**Pantalla.** Diagrama + detalle de un VALID y, en miniatura, un PENDING_REVIEW.

**Visual.** Diagrama. No un video del rechazo como camino principal.

**Acción.** Ningún clic largo. “Dentro del radio y del horario queda válida. Apenas afuera queda para revisar. Lejos queda rechazada, y el intento no desaparece.”

### Capítulo 8 — Cuando el día no sale bien

**Objetivo.** Ver que el producto sirve para la excepción, no solo para el presente perfecto.

**Funcionalidad.** Tarde, no vino, no disponibilidad, reemplazo, revisión manual.

**Pantalla.** Inicio filtrado, detalle de una llegada tarde, conversación de reemplazo, diálogo de revisión.

**Visual.** Tres viñetas o un video del reemplazo en WhatsApp.

**Acción.** Mostrar el aviso “no puedo”, las tres opciones en el teléfono del responsable y la jornada reasignada. En paralelo, una tarjeta “llegó tarde” y una “pendiente de revisión”.

### Capítulo 9 — Lo que la empresa se queda

**Objetivo.** Cerrar el ciclo de información.

**Funcionalidad.** Estadísticas, mail diario, Excel mensual.

**Pantalla.** `/statistics` pestaña General e Incidencias. Captura del mail. Portada del XLSX.

**Visual.** Screenshot + archivo.

**Acción.** Cambiar el período y abrir incidencias. No exportar en vivo.

### Capítulo 10 — Cómo empieza un cliente

**Objetivo.** Que no parezca magia ni un proyecto de seis meses.

**Funcionalidad.** Onboarding resumido.

**Pantalla.** Ninguna técnica. Timeline.

**Visual.** Timeline de una página.

**Acción.** “Dinamic abre la empresa. Ustedes cargan lugares, personas y la primera operación. Probamos un fichaje. Al día siguiente llega el correo.”

El detalle click-por-click queda en la guía de puesta en marcha.

## Qué rol aparece

En la principal: **administrador** (quien configura y mira) y **colaborador** (WhatsApp). El supervisor se nombra una vez: “quien está en el lugar puede revisar un fichaje y cargarlo a mano”. HR y recibos no entran salvo que la reunión sea de ese tema.

## Dónde convergen las dos historias

```text
Admin asigna la jornada
        ↓
Colaborador confirma, llega y ficha, o avisa que no
        ↓
Admin ve el resultado en Inicio y en la asistencia
        ↓
Al día siguiente los dos hechos están en el correo
```

El punto visual de convergencia es el detalle de asistencia: a la izquierda el mensaje de WhatsApp, a la derecha la ficha con hora y metros.

## Anexos (solo índice de capítulos)

**Puesta en marcha.** Empresa ya creada → reglas → cliente → lugar en el mapa → persona → operación → asignación → prueba de WhatsApp → verificar inicio → reporte.

**Administrador.** Un día tipo hora por hora del documento 04. Incluye carga manual y aprobación de un pendiente.

**Colaborador.** Menú completo, salida, ausencia formal, errores de sesión. Una página de “qué hacer si el bot dice que no hay operación”.

**Información.** Cada pestaña de estadísticas, columnas que importan del diario y las cinco hojas del mensual.

**Opcional, solo si se vende.** Ausencias con saldo, grupos, recomendación, recibos, dos turnos el mismo día.
