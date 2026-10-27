# Notas de diseño y sustituciones

## V1.1 final

Archivos: `Dinamic-Operations-Presentacion-Comercial-Final.pptx` y `-Final.pdf`. La V1 (`Dinamic-Operations-Presentacion-Comercial.pptx` / `.pdf` / `-notas.md`) se conserva para comparar. Estructura, orden, capturas y reconstrucciones sin cambios; siguen siendo 23 slides.

- Footer externo: “Dinamic Operations” y número de slide, sin “Dinamic Demo”, en las 23 slides. “Dinamic Demo” sigue apareciendo donde es dato real del tenant (capturas, email, XLSX) y en el pie de la captura de la slide 03 (“valores de Dinamic Demo”), que describe el origen de esos valores.
- Slide 07: “No necesita instalar otra app ni tener usuario en el panel.” (antes “no instala nada”). La nota de orador de la portada se alineó con el mismo criterio.
- Slide 20: “Resumen del día anterior + archivo XLSX para análisis, según el horario configurado.”
- Slide 23: “Cada día se revisa el Inicio y el reporte diario.” (texto y nota de orador).
- Notas de orador: las indicaciones internas del tipo “no decir …” que repetían términos excluidos se reformularon en positivo (slides 10, 16, 19 y 23), porque las notas viajan con el PPTX.
- Metadata del PPTX/PDF: título “Dinamic Operations — Presentación comercial y de onboarding”, autor y última modificación “Dinamic”.

Material: `Dinamic-Operations-Presentacion-Comercial-Final.pptx` (editable) y `-Final.pdf`. 23 slides 16:9 en 8 bloques (entender, configuración inicial, estructura operativa, crear el trabajo, lo que vive el colaborador, excepciones, gestión, onboarding), con notas de orador basadas en `22`. Producto: Dinamic Operations; asistencia es un módulo. Datos: solo tenant Dinamic Demo.

## Reconstrucción de WhatsApp (slides 11, 12, 14 y 16)

Reconstrucción visual basada en ejecución real del sistema. No es una captura de WhatsApp y el deck no lo afirma.

- Textos del bot y del colaborador copiados literalmente de `reports/webhook-local-transcript.txt`; las horas son las del transcript. `qa_check.py` lo verifica para las cinco conversaciones.
- Slide 11: menú de Diego (“hola”, 18:11) y confirmación de Pablo (“Confirmo asistencia”, 16:26). El 👋 del menú se coloca como imagen sobre el texto porque Arial/Liberation no tienen ese glifo; el texto sigue siendo el del transcript.
- El mensaje de ubicación se representa como una burbuja “Ubicación compartida”, sin vista de mapa ni coordenadas.
- La barra superior del teléfono no lleva nombre de contacto ni marca.
- En la 16 se muestra solo el tramo final de la conversación de Diego (18:11): submenú, “1” y confirmación.
- No hubo entrega real por WhatsApp; el webhook se ejercitó localmente.

## Composición de capturas

- Slide 03: solo la tarjeta “Configuración operativa” de la configuración de la empresa (`SS-23`); el resto de reglas se nombra como lista, sin captura.
- Slide 05: lista de clientes (`SS-03`) con las columnas Nombre y Estado unidas; se quitaron las columnas intermedias. El árbol Hotel Central → Palermo / Centro es un esquema con los nombres reales.
- Slide 06: el mapa del lugar no carga en el entorno local de captura. Se usa la pantalla real sin el área del mapa, más un esquema a escala del radio (150 m, Lucía a 21,6 m), rotulado como esquema.
- Slide 08: cabecera e integrantes del grupo “Equipo Hotel Central” (`SS-25`), unidos en una sola imagen; se omitió la sección intermedia.
- Slide 09: formulario real de nueva operación (`SS-28`), recortado al modo de horario, inicio/fin y tolerancias.
- Slide 10: el diagrama usa tres de las seis personas asignadas; la tabla es posterior al turno, por eso la operación figura “Finalizado”.
- Slides 13, 14 y 18: las fichas son recortes reales de etiqueta y valor de las páginas de detalle (`SS-12`, `SS-13-detalle-pendiente`, `SS-13-despues-aprobacion`), ordenados en una tarjeta. No se cambió ningún valor.
- Slide 14: en la fila de Mateo se quitaron las columnas Confirmación y Asistencia; se unieron Colaborador, Check-in y Check-out.
- Slides 15 y 18: filas seleccionadas de la lista de asistencias del 25/10 (`SS-11`); en la 15 se quitaron Servicio y Operación. La fila de Julián muestra “Válido” porque la captura es posterior a la aprobación del responsable; la slide lo rotula como “Fuera del radio, revisado”.
- Slide 16: la lista de candidatos es texto nativo con el orden real de la solicitud (Sofía Romero, Camila Duarte, Elena Vargas). La notificación al responsable quedó encolada pero no enviada en la demo; la cobertura se resolvió desde el panel (diálogo real “Cubrir / reemplazar”).
- Slide 19: “Fuera de geocerca 2” incluye a Bruno Salas (190,1 m, pendiente), además de Julián.
- Slide 20: el correo es el reporte real del 24/10, entregado en una casilla local de prueba. No se observó el envío programado de las 08:00; la configuración real muestra “Habilitado · 08:00”. El adjunto es una copia del XLSX real con columnas ensanchadas, Operación, Turno y los horarios vacíos ocultos, y un recorte que deja fuera Fecha y Observación; no se cambió ningún valor. La hoja Resumen tiene una fila “Avisó que no asistiría” duplicada; no se muestra.
- Slides 01, 02, 04, 21, 22 y 23 son tipográficas, sin capturas. El orden de la 21 sigue `03-client-onboarding-flow.md`.

## Formato

- Tipografía Arial en el PPTX. El PDF se exportó con LibreOffice, que sustituye Arial por Liberation Sans (métricamente equivalente, embebida).
- Tapa tipográfica, sin logo: no hay archivo de marca aprobado.
- Los videos no se embebieron (no están producidos).

## Regenerar

Desde `presentation-production/build/`: `crops.py` (recortes), `build_deck.py` (genera el PPTX `-Final`), exportación con `soffice --headless --convert-to pdf`, `qa_check.py` (QA automática).
