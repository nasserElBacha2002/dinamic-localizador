# 32 — Assets bloqueados (v2)

Se quitaron los bloqueos resueltos en la segunda pasada: B-01, B-02, Centro, reporte por SMTP y capturas pendientes.

| Asset(s) | Bloqueo | Tipo | Qué lo destraba |
|---|---|---|---|
| Chats de WhatsApp (VIDEO-02, 03, 05 y stills de chat) | Local sin Twilio ni teléfonos reales. El transcript del webhook no es un chat | Entorno | Número Twilio de prueba y dos o tres teléfonos registrados como colaboradores y admin |
| VIDEO-01, 04, 06, 07, 08 | El agente no graba pantalla | Herramienta | Grabación humana siguiendo `19`. Para VIDEO-07, Bruno sigue pendiente a 190 m en Clínica Norte (operación de las 18:30) |
| SS-06 | Google Maps devuelve `RefererNotAllowedMapError` para `http://localhost:8084`. Con la misma key, `localhost:5173` no da error (probado sin exponerla), pero ahí no hay sesión de Valeria y no se reseteó su contraseña ni se copió el token | Entorno | Cualquiera de estas: (a) agregar `http://localhost:8084/*` a los referrers de la key en Google Cloud; (b) que una persona inicie sesión como Valeria en `vite preview --port 5173` y capture la ficha de Hotel Central — Palermo; (c) capturar en un entorno con dominio autorizado |
| SS-22 (versión legible) | El XLSX no define anchos de columna (Q-08) | Producto (menor) | Abrir `reports/reporte-asistencia-2026-10-24.xlsx` en Excel, ensanchar la columna A y capturar |
| Marina Ruiz activa | Su invitación necesita aceptarse por mail | Entorno | Reenviar la invitación con el SMTP de prueba y aceptarla desde Mailpit (no se hizo: crea credenciales) |
| Reporte mensual | Sin UI de disparo; worker apagado por defecto | Producto / entorno | Fuera de la versión corta |
