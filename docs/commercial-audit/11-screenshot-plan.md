# 11 — Plan de screenshots

Criterio: una captura por idea. Si dos pantallas dicen lo mismo, queda una.

Prioridad **Alta** entra en la presentación principal. **Media** entra en un anexo. **Baja** solo si alguien pide el detalle. No capturar observabilidad, simulador, logs, costos, alta de plataforma ni el formulario de asistencia de prueba.

Estado necesario: empresa demo del documento 13, sesión de un usuario administrador (no platform admin), módulos de asistencia, operaciones, ausencias y reportes activos, `bot_simulator` apagado para que no aparezca el ítem de menú.

| ID | Módulo | Pantalla | Estado necesario | Acción | Qué demuestra | Prioridad |
|---|---|---|---|---|---|---|
| SS-01 | Inicio | `/` | Día demo con mezcla de estados | Abrir el inicio sin scrollear de más | El día se lee de un vistazo | Alta |
| SS-02 | Inicio | `/` anotado | El mismo | Marcar 4 cifras: presentes, tarde, avisó que no, cobertura | Cada número responde una pregunta | Alta |
| SS-03 | Clientes | `/clients` | 3 clientes | Lista | Hay una cartera, no un único sitio | Media |
| SS-04 | Clientes | `/clients/:id` | Hotel Central con 2 lugares y personas | Abrir la ficha | El cliente agrupa lugares y gente | Alta |
| SS-05 | Servicios | `/services` | Lugares con cliente y localidad | Lista | Los lugares existen como entidad propia | Media |
| SS-06 | Servicios | Alta o edición, mapa | Pin y círculo visibles | Dirección buscada, radio 150 m, sin guardar todavía o recién guardado | El lugar tiene un punto y un radio | Alta |
| SS-07 | Colaboradores | `/employees` | Lista mixta fijo/eventual | Lista | El padrón | Media |
| SS-08 | Colaboradores | Alta o ficha | Teléfono ficticio visible | Mostrar teléfono, tipo y cliente | El teléfono es la identidad de WhatsApp | Alta |
| SS-09 | Operaciones | `/operations` | Una de hoy en curso, una de mañana, una cancelada no hace falta | Lista del día | El trabajo planificado | Alta |
| SS-10 | Operaciones | `/operations/:id` | Equipo asignado, una persona ya fichó, una avisó que no | Detalle del equipo | Asignación y estado de la jornada juntos | Alta |
| SS-11 | Asistencias | `/attendance` | Válida, tarde, pendiente, rechazada | Lista filtrada al día demo | Los resultados no son solo “presente” | Alta |
| SS-12 | Asistencias | Detalle de una válida | Distancia corta, origen WhatsApp, hora | Abrir el registro | Evidencia: hora, metros, lugar | Alta |
| SS-13 | Asistencias | Detalle pendiente de revisión | Margen configurado, punto apenas fuera | Abrir el pendiente y dejar el diálogo de aprobar visible, sin confirmar | Hay una decisión humana | Alta |
| SS-14 | Asistencias | Diálogo manual | Permiso de carga manual | Abrir el diálogo vacío, sin enviar | Se puede cargar si no hubo teléfono | Media |
| SS-15 | Ausencias | `/absences` | Una pendiente y una aprobada | Lista | El pedido no vive en un chat suelto | Media |
| SS-16 | Ausencias | `/absences/:id` | Conflicto o impacto visible | Ficha | La ausencia toca la operación | Media |
| SS-17 | Estadísticas | General | Rango “esta semana” con datos | Pestaña General | El período, no solo el día | Alta |
| SS-18 | Estadísticas | Incidencias | Varios tipos | Pestaña Incidencias | Las fallas se clasifican | Alta |
| SS-19 | Estadísticas | Por empleado | Una persona con tardanzas | Pestaña | El hábito de una persona | Media |
| SS-20 | Estadísticas | Por servicio | Un lugar con más incidencias | Pestaña | El problema puede ser el lugar | Media |
| SS-21 | Reporte | Mail diario | Envío real a un buzón demo | Abrir el correo | El día anterior llega solo | Alta |
| SS-22 | Reporte | XLSX diario o mensual | Archivo abierto en la hoja Resumen | Captura de la hoja, no del explorador de archivos | Hay un archivo para gerencia | Alta |
| SS-23 | Configuración | Reglas operativas | Radio, tolerancias y timezone ya editados a valores demo | Modal de settings, recortado | Las reglas son de la empresa | Media |
| SS-24 | Configuración | Alertas | Destinatario y alertas activas | Modal, sin tokens ni SIDs | Alguien recibe el aviso | Media |
| SS-25 | Grupos | `/work-teams/:id` | Un grupo de 4 | Ficha | El equipo se reutiliza | Baja |
| SS-26 | Recomendación | Panel en la operación | Historial suficiente para que el ranking no salga vacío | Panel abierto | Hay un orden de candidatos | Media |
| SS-27 | Usuarios | `/settings/users` | Owner + un supervisor | Lista, sin emails reales de Dinamic | Hay más de una persona administrando | Baja |
| SS-28 | Operaciones | Formulario | Modo un horario | Pantalla a mitad de carga, lugar ya elegido | Crear una operación es concreto | Media |

## Indispensables

SS-01, SS-02, SS-04, SS-06, SS-08, SS-09, SS-10, SS-11, SS-12, SS-13, SS-17, SS-18, SS-21, SS-22.

## Secundarios

SS-03, SS-05, SS-07, SS-14, SS-15, SS-16, SS-19, SS-20, SS-23, SS-24, SS-26, SS-28.

## Innecesarios para la presentación

- Login, 2FA, recuperar contraseña, aceptar invitación (van a la guía de setup, una sola captura de invitación si hace falta)
- Empresas de plataforma, servidores, observabilidad, costos, logs
- Simulador de bot
- Alta de asistencia de prueba
- Cuotas de WhatsApp
- Todas las pestañas de la ficha del colaborador
- Calendario de ausencias, porque no hay pantalla de calendario en el menú
- Reporte mensual “en configuración”, porque no existe la pantalla
- Dos capturas de la misma lista con otro filtro

## Notas de toma

- Ventana de escritorio ancha. El inicio en móvil se puede tomar aparte solo si se quiere mostrar que el panel responde; no es el eje.
- Ocultar o no usar la sesión platform admin: si no, aparecen Simulador y Observabilidad en el menú (`company-modules.ts`).
- Recortar mapas para que el círculo se vea entero.
- Números de teléfono solo del dataset ficticio.
- Si el panel de recomendación dice “IA”, no usar esa captura en la principal hasta cambiar el texto o tapar la palabra en la pieza. Puede vivir en el anexo con la frase “recomendación por historial”.
