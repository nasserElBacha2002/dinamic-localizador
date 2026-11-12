# Encargado operativo — Fase 2 (requisitos funcionales)

**Estado:** especificación para trabajo pendiente. **No implementado** en Fase 1.

## Principio rector

El Encargado tendrá acceso a **administrar todas las operaciones de su empresa**, no solamente las operaciones a su cargo.

Separar:

| Concepto | Uso |
|----------|-----|
| **Permisos de gestión** | Alcance general a operaciones de la empresa (listar, armar equipos, asignar colaboradores, herramientas de disponibilidad, asistencias según rol). |
| **Operaciones a cargo** (`operation_charge_assignments`) | Responsabilidad operativa particular: alertas y resúmenes personales del encargado. **No** es requisito para acceder o administrar todas las operaciones. |

## Capacidades del Encargado (panel)

- Consultar **todas** las operaciones de su empresa.
- Armar equipos de trabajo desde cero.
- Asignar colaboradores a **cualquier** operación de la empresa.
- Reasignar colaboradores entre operaciones de la misma empresa.
- Consultar disponibilidad y utilizar las herramientas de asignación existentes.
- Gestionar las asistencias que le correspondan según permisos del rol (sin permisos administrativos globales).
- Consultar resúmenes operativos.
- Recibir alertas específicas de las operaciones **bajo su responsabilidad** (vía `operation_charge_assignments` vigentes).

## Activación del rol

- Desde la ficha del colaborador: categoría sistema **Encargado** + vínculo `company_user_employee_links` con el usuario del panel.
- Fase 1 ya persiste vínculo y asignaciones a cargo; Fase 2 expone permisos de gestión amplios sin usar asignaciones a cargo como gate de acceso.

## Restricciones de diseño

- Reutilizar componentes existentes de operaciones, armado de equipos y asignaciones.
- **No** conceder rol ADMIN ni reutilizar permisos administrativos globales como atajo.
- Mantener aislamiento por empresa (`company_id`).
- Preservar validaciones de disponibilidad, conflictos horarios y trazabilidad / auditoría.
- `operation_charge_assignments` sigue siendo la fuente de verdad para “operaciones a cargo” y alertas/resúmenes personales.

## Fuera de alcance Fase 2 (referencia)

- Cambios WhatsApp / bot salvo alertas ya previstas para operaciones a cargo.
- Nuevos modelos de permisos fuera del rol Encargado acotado a empresa.
