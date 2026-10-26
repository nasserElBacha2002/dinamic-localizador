# 14 — Ajustes antes de grabar

Solo lo que se ve o se dice en una demo comercial y puede desmentir el relato. No es una auditoría de UX.

La grabación puede hacerse sin corregir código si se evita la pantalla. Cuando evitarla empobrece el capítulo, el arreglo pasa a ser bloqueante.

## P0 — Bloquea la presentación

| Problema | Evidencia | Por qué bloquea | Qué hacer antes de grabar |
|---|---|---|---|
| La sesión de platform admin muestra Simulador, Observabilidad, Costos, Logs y Empresas | `getAdminNavItems` en `frontend/src/utils/company-modules.ts` | El producto parece una consola interna | Grabar con ADMIN/OWNER de la empresa demo. Apagar el módulo `bot_simulator` en ese tenant |
| El botón de probar el bot en Asistencias, si se cuela | `AttendanceListPage.tsx` | Un prospecto no tiene que ver un simulador | Misma sesión no-platform. Confirmar que el botón no está |
| Decir “IA” porque la pantalla lo dice | `OperationAiRecommendationsPanel.tsx`, `WorkTeamAiCreationPanel.tsx` | El algoritmo es `workforce-recommendation-v1`, sin modelo | Sacar esa captura de la principal, o cambiar el texto visible a “Recomendación” antes de filmar. No narrar inteligencia artificial |
| Fichaje filmado en un punto que cae fuera del radio | El motor rechaza y el video “feliz” muestra el mensaje de no validado | El capítulo 6 se rompe | Ensayar el teléfono en el lugar y ajustar el pin, no el discurso |
| Alertas apagadas el día del video de reemplazo | default `admin_alerts_enabled` en migración 100; worker por env | VIDEO-05 no tiene final | Encender flag, worker y destinatario. Probar un aviso real el día anterior |
| Dataset de “hoy” vacío o con una sola llegada perfecta | El inicio existe, pero no demuestra | SS-01 no dice nada | Cargar el documento 13 |

## P1 — Muy visible si se muestra esa pantalla

| Problema | Evidencia | Efecto en la demo | Qué hacer |
|---|---|---|---|
| El lugar se llama Servicio | `terminology.ts` | El cliente busca “sucursal” y no la encuentra en el relato | En la voz y en las viñetas decir “lugar de trabajo”. No hace falta renombrar el producto para la primera presentación; sí hace falta la frase puente en el capítulo 3 |
| Horario default 20:30–03:00 | `company-settings.ts` | Si se abre configuración sin editar, el producto parece solo de inventarios nocturnos | En Dinamic Demo dejar 08:00–17:00. No capturar el default de fábrica |
| Tolerancias default 60 y 90 min | el mismo archivo | “Llegó tarde” casi no existe con 90 min | Demo a 30 y 15, como en el dataset |
| Margen de geocerca vacío | default null | No hay pendiente de revisión que mostrar | Cargar 80 m antes de SS-13 y VIDEO-07 |
| Reemplazo elegible solo por respuesta rápida de WhatsApp | `replacement-request.service.ts` | Si se busca el mismo flujo en la web, no está | Filmar el teléfono del responsable. En la web mostrar el resultado, no un wizard que no existe |
| No hay aviso de “te asignaron” | test de asignación sin outbox | El relato “se entera al instante de que lo asignaron” es falso | Decir que confirma cuando llega el recordatorio |
| Reporte mensual sin pantalla | job sí, UI no | Buscar “mensual” en configuración y no encontrarlo | Mostrar el archivo recibido, no un botón |
| Inicio pobre si falta el módulo reports | KPIs atados a `reports:read` | La primera pantalla no tiene números | Módulo reports activo |
| Formulario de asistencia de prueba | `AttendanceCreatePage` / test form | Copy técnico, coordenadas a mano | No navegar ahí |
| README y URLs viejas de inventario/tienda | README, redirects `/inventories`, `/stores` | Solo estorba si alguien abre el repo o un link viejo durante la reunión | No abrir el README. Los redirects no se muestran |

## P2 — Conviene, no impide grabar

| Problema | Nota |
|---|---|
| Permiso de clientes reutiliza `employees:*` | Irrelevante en boca de un ADMIN. No explicarlo |
| Dos mecanismos históricos de destinatarios de email | `CompanyDailyAttendanceReportDialog` menciona el cutover. Capturar una sola pantalla de destinatarios, la que esté en uso |
| El mensual depende del flag del diario | No hace falta decirlo en la reunión |
| Alta de cliente solo en modal, sin página propia | Se graba igual |
| Categorías y zonas viven en Configuración, no en el menú de colaboradores | No hace falta mostrarlas |
| Solape entre operaciones es warning, no bloqueo | No construir un caso de conflicto cruzado |
| Enrutado de WhatsApp con un número compartido | Condición de implementación. No es una pantalla |

## P3 — Cosmético

| Problema | Nota |
|---|---|
| Densidad del inicio (muchas cifras) | SS-02 anota cuatro. No rediseñar para la demo |
| Pestañas de estadísticas de más | Mostrar General e Incidencias |
| Textos de plantilla Twilio fuera del repo | No capturar un recordatorio cuyo texto no se haya revisado en el teléfono real |
| Nombre legacy en comentarios o en redirects | Invisible si no se abre el código |

## Orden de preparación, no de desarrollo

1. Tenant demo, usuario no platform, simulador apagado.
2. Settings de horario, tolerancias y margen.
3. Datos del documento 13, con fichajes de origen correcto.
4. Ensayo de WhatsApp en el pin real.
5. Ensayo de alerta de reemplazo.
6. Decidir si el panel “IA” se oculta o se renombra.
7. Recién ahí, capturas y videos.

Si el paso 6 no se hace, la presentación principal simplemente no incluye esa pantalla. El producto se puede vender igual: el reemplazo por WhatsApp ya muestra el criterio de candidatos.
