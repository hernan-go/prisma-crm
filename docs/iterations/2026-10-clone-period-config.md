# Iteración completada — Clonar configuración al crear período

**Estado:** completada en `feat/clone-period-config`, validada y aprobada por el usuario. Cambios todavía sin commit ni deploy.

## Objetivo

Al crear un período nuevo desde el botón `+` superior, permitir elegir entre:

- `Crear período vacío`
- `Copiar configuración del período anterior`

La opción debe vivir en el mismo flujo/modal de creación de período. No crear un botón o pantalla paralela.

## Fuente a copiar

Usar el período cronológicamente anterior disponible.

No exigir que sea exactamente el mes calendario inmediatamente anterior.

Ejemplo: si existen agosto y octubre y se crea noviembre, la fuente anterior disponible es octubre.

## Copiar

Configuración operativa necesaria para comenzar el nuevo período:

- `period_activities` / actividades ofrecidas;
- nombre de oferta;
- modalidad;
- días;
- horarios;
- facilitadores asignados;
- demás configuración operativa estrictamente necesaria para reproducir la oferta y luego editar diferencias.

Los registros nuevos deben tener IDs independientes.

## NO copiar

Nunca copiar:

- personas;
- inscripciones;
- `enrollments`;
- `enrollment_slots`;
- cuentas mensuales;
- cobros;
- pagos;
- deuda/saldo;
- cuentas de facilitadores;
- pagos a facilitadores;
- categorías de gastos;
- gastos;
- ningún movimiento financiero;
- ninguna semántica histórica derivada de `ever_used` sin analizarla explícitamente.

## Reglas técnicas

- La operación de clonación debe ser transaccional.
- Si falla una parte, no debe quedar un período parcialmente configurado.
- Evitar duplicados.
- Respetar el modelo actual de actividades/períodos documentado en `docs/ARCHITECTURE.md`.
- Inspeccionar el flujo actual antes de asumir si hace falta migración.
- Preferencia: no agregar migración si el esquema existente ya soporta la funcionalidad.

## Inspección obligatoria antes de editar

Codex debe identificar y reportar brevemente:

1. componente/modal actual de creación de períodos;
2. endpoint/servicio actual que crea períodos;
3. tablas involucradas en la configuración a copiar;
4. cómo se asignan días/horarios/facilitadores actualmente;
5. tratamiento actual de `ever_used`;
6. si el esquema actual alcanza sin migración.

Después debe proponer un plan corto antes de implementar.

## Criterios de aceptación

1. Crear período vacío sigue funcionando igual que hoy.
2. La opción de copiar configuración aparece en el mismo modal/flujo del `+`.
3. Se copia la oferta operativa del período anterior disponible.
4. Se crean IDs nuevos e independientes.
5. No se copia ninguna persona, inscripción ni movimiento financiero.
6. Gastos Período del nuevo mes empieza vacío.
7. Cobros y pagos del nuevo mes empiezan vacíos.
8. Pago Facilitadores no arrastra cuentas/pagos históricos.
9. La operación es transaccional.
10. El período nuevo puede editarse normalmente después de clonar.
11. Período fuente permanece intacto.
12. Tests cubren creación vacía, clonación correcta, ausencia de datos transaccionales y rollback ante fallo.

## Validación

Seguir `docs/WORKFLOW.md`, incluyendo tests DB únicamente sobre `prisma_test` si son necesarios.

### Resultado local — 2026-10-07

- Modal existente del `+`: creación vacía por defecto o copia de configuración.
- Backend autoritativo: anterior existente por año/mes, aunque esté cerrado; si está vacío no busca otro más antiguo.
- Copia ofertas, días, horarios y asignaciones con IDs nuevos, conserva estados y nombres del período, y reinicia `ever_used=0` en ofertas/horarios.
- Catálogos globales, personas y datos transaccionales permanecen intactos; no se reactivan registros archivados.
- Sin nueva migración ni cambios a las migraciones existentes.
- Typecheck, lint, tests normales (102 aprobados), integración exclusiva en `prisma_test` (190 aprobados), build y `git diff --check`: OK.
- Build con warnings conocidos no bloqueantes de Zod/Rollup.
- Rollback verificado en MySQL real mediante fallo inducido al copiar facilitadores, sin alterar el esquema para la prueba.
- Prueba de navegador local sobre `prisma_test`: crear vacío, copiar, seleccionar el nuevo período y deshabilitar copia sin fuente: OK.
- Se corrigió el texto del modal sobre edición/eliminación de períodos vacíos para incluir configuración y categorías de gastos, conforme a la validación ya existente.
- Revisión manual del usuario: satisfactoria y aprobada. Diciembre 2026 clonó correctamente desde Noviembre 2026 las ofertas, días, múltiples horarios y facilitadores.
- Iteración completada sin requerir migración. Producción intacta; pendiente preparación de Git mediante autorización explícita.

## Git

- No hacer push a `main` durante implementación.
- Commit local/feature branch solo si se autoriza al iniciar la iteración.
- Producción no se toca durante desarrollo.
