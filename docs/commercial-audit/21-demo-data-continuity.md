# 21 — Continuidad de la demo

Toda la presentación ocurre en **Dinamic Demo**, en la semana que termina el día D. Quien diseña no mezcla filas de otra empresa ni cambia nombres entre páginas.

## Correcciones al borrador de datos

Estas correcciones evitan contradicciones. No cambian el producto.

| Borrador en `13` | Decisión de producción | Por qué |
|---|---|---|
| Cobertura torre es “mañana” | Es **hoy 18:00–23:00** | El inicio de hoy tiene que poder mostrar “Avisó que no asistiría”, y el turno todavía no empezó, así el reemplazo se puede elegir |
| Irene puede ser la tercera candidata | Irene queda en Hotel Central. Bruno es el tercer candidato de Torre | Una persona de Palermo no se promete como cobertura de la Torre. Si el ranking real la trajera, el video muestra lo real y el discurso no la nombra de antemano |
| SS-10 mezcla “ya fichó” y “avisó que no” | SS-10 es solo Recepción mañana. SS-10B es la Torre después del reemplazo | Son dos turnos. Juntarlos en una ficha sería falso |
| SS-02 anota “cobertura” | Se anotan Presentes, Tarde, Avisó que no y Sin cierre | “Cobertura incompleta” no se puede forzar: no hay vacante cargada. Sin cierre sí, con Mateo |
| Camila es “ausencia no justificada” en el inicio | En la slide 10 es “sin llegada” | Si el turno sigue abierto, puede seguir pendiente. El texto no apuesta a un cambio de estado |
| VIDEO-01 crea el lugar del fichaje | VIDEO-01 crea Centro. SS-06 es Palermo | Crear en cámara el lugar del fichaje obliga a rehacer el pin y los videos |

## Clientes

| Cliente | Lugares | Operaciones que se ven | Slides |
|---|---|---|---|
| Hotel Central | Palermo, Centro | Recepción mañana (hoy), Cierre de ayer, alta de Centro en video | 03, 04, 06, 07, 08, 10, 13 |
| Clínica Norte | Belgrano | Guardia clínica (hoy) | 09, 10, 12 |
| Torre Corporativa | Microcentro | Cobertura torre (hoy 18:00) | 02, 11 |

Centro no tiene fichaje en la presentación principal. Existe para que Hotel Central tenga dos lugares y para el gesto de crearlo.

## Personas

| Persona | Lugar | Operación | Estado que la presentación afirma | Slides |
|---|---|---|---|---|
| Lucía Fernández | Palermo | Recepción mañana, y ayer el cierre | Hoy: llegó en hora y marcó salida, por WhatsApp. Ayer: jornada correcta | 05, 06, 07, 08, 09, 13, 17 |
| Mateo Álvarez | Palermo | Recepción mañana | Llegó, no marcó salida | 06, 08 |
| Sofía Romero | Palermo | Recepción mañana | Llegó tarde. La llegada vale | 06, 10 |
| Julián Pereyra | Belgrano | Guardia clínica | Punto apenas fuera. Pendiente hasta que Valeria lo aprueba en el video | 09, 12 |
| Camila Duarte | Belgrano | Guardia clínica | Sin llegada | 10 |
| Nina Acosta | Belgrano | Guardia clínica | Ausencia aprobada. No es protagonista | Solo si una cifra de “justificadas” queda a la vista |
| Pablo Núñez | Palermo | Cierre de ayer | Confirmó y no fue | 10, 13 |
| Diego Molina | Microcentro | Cobertura torre, hoy 18:00 | Avisó que no puede | 02, 11 |
| Quien cubra | Microcentro | Cobertura torre | La elige Valeria en el video. Nombre = el de la opción 1 real | 11 |
| Elena, Hugo, Bruno | Torre | Historia previa y candidatura | No se imprimen como ganadores | No, salvo que el video los muestre |
| Irene Costa | Palermo | Grupo de recepción | No se menciona | No |
| Valeria Gómez | — | Administra | Aprueba a Julián y elige la cobertura | 11, 12, voz |
| Marina Ruiz | — | Supervisora | No aparece | No |

## Qué no puede contradecirse

| Si la página dice… | La captura no puede mostrar… |
|---|---|
| Lucía fichó por WhatsApp | Origen manual, o distancia mayor a 150 m |
| Mateo no cerró | Una salida de Mateo |
| Sofía llegó tarde y la llegada vale | Un rechazo |
| Julián está para revisar | El estado ya aprobado, en SS-13 o en el inicio |
| Diego avisó y alguien cubre | La Torre sin cobertura en SS-10B, o un chat escrito a mano |
| Pablo es de ayer | A Pablo en el turno de hoy |
| El correo es de ayer | Un export del día D con título de “reporte diario” armado a mano |
| Hay dos lugares de Hotel Central | Una ficha con un solo lugar, si Centro ya se creó en el video |
| El menú es el de un cliente | Simulador, observabilidad, recibos |

## Orden de los estados de Lucía

```text
Asignada (VIDEO-04)
    → llegó (VIDEO-02, SS-12)
    → se fue (VIDEO-03)
    → el inicio ya puede fotografiarse (SS-01)
```

La slide 06 muestra el video del primer paso y la foto del último. El pie “el mismo turno, después de las llegadas” es obligatorio para que no parezcan dos empresas.

## Orden de Julián

```text
Pendiente real
    → SS-13 y SS-01
    → VIDEO-07 lo aprueba
    → no se vuelven a tomar esas fotos
```

La slide 12 puede pasar el video aunque la foto de apoyo sea el “antes”. No se muestra el “después” en el inicio de la slide 02.

## Orden de Diego

```text
Asignado al turno de las 18:00
    → el inicio ya cuenta “avisó que no” solo después de que avisó
    → VIDEO-05
    → SS-10B
```

Si se fotografía el inicio antes del aviso, “Avisó que no” sale en cero y la slide 02 no se puede anotar así. El aviso de Diego ocurre antes de SS-01. La elección de la cobertura puede ser después de SS-01: el inicio no necesita mostrar ya el nombre de quien cubre. SS-10B es posterior.

Secuencia segura el día D:

1. Diego avisa (puede ser el ensayo filmado, si es la toma buena).
2. Se completan las llegadas de Palermo y el pendiente de Julián.
3. Se fotografían inicio, asistencias y Julián.
4. Se graba la elección de Valeria y se fotografía SS-10B.
5. Se aprueba a Julián en video.
6. Se capturan estadísticas si todavía no se capturaron. Anotar si Julián ya no está pendiente.

El paso 1 y el paso 4 pueden ser el mismo video solo si el inicio se fotografía **después** del aviso y **antes** no importa la cobertura. Si el video es continuo y no se puede pausar para fotografiar el inicio en el medio, fotografiar el inicio después del aviso y usar un corte de edición en VIDEO-05. No filmar la elección antes de tener SS-01 si al elegir cambia el número de “avisó que no”. Comprobar en el ensayo si ese número baja al cubrirse. Si baja, SS-01 se toma cuando el número ya es el que queremos imprimir, y no se vuelve a tomar.

## Semana estadística

La slide 14 usa la misma empresa y los mismos lugares. No un período de ejemplo genérico. El rango incluye D−1 (Pablo) y días previos de Elena y de Lucía. No incluye clientes ajenos.

## Nombres que no se intercambian

Lucía es la única que se ve en el teléfono de llegada. Mateo es el único “sin cierre”. Sofía es la única “tarde” de hoy. Julián es el único “para revisar”. Camila es la única “sin llegada” de hoy. Pablo es el único “confirmó y no fue”, y es de ayer. Diego es el único “no puedo”. Valeria es la única que opera el panel en los videos.

Si el día de grabación una de esas tomas sale al revés, se cambia el guion de esa persona. No se le pone el nombre de otra en la diapositiva.
