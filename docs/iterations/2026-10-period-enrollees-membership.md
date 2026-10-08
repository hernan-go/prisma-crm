# Iteración correctiva — Inscriptos Período

**Fecha:** 2026-10-07. **Rama:** `fix/period-enrollees-membership`. **Base:** `66e944a`.

**Estado:** cerrada, integrada y desplegada. `main` en `a599378`; implementación en `c707f7c`. `008.sql` aplicada en producción y smoke test aprobado, confirmados por el usuario al iniciar Cobros Período. Las validaciones y pasos locales siguientes se conservan como registro histórico.

## Problema y resultado

La pantalla mostraba `PersonPicker`, que consulta toda BBDD, como contenido principal. No existía pertenencia independiente: `enrollments` exige actividad y `monthly_accounts` tiene semántica financiera.

Ahora el listado principal parte de `period_memberships`; buscar en BBDD queda en un modal separado. Se conserva la estética existente. La ficha global también exige incorporación antes de gestionar el período. Cobros selecciona únicamente personas incorporadas; no se implementa receptor ≠ medio.

## Modelo y reglas

- PK `id INT UNSIGNED`, `person_id`, `period_id`, `created_at`, `UNIQUE(person_id,period_id)`, índice por período.
- FK a `people` y `periods`, sin cascadas; FK compuestas desde `enrollments` y `monthly_accounts` al par de membresía.
- Alta crea exclusivamente membresía y rechaza duplicados/inactivos. Cero actividades es válido.
- Cancelar última inscripción conserva membresía y cuenta existente.
- Baja elimina exclusivamente membresía si no existen inscripciones ni cuentas. Cualquier cuenta, incluso vacía, bloquea con `409` y mensaje claro.
- Períodos cerrados bloquean altas/bajas; lectura de archivados históricos permanece.
- Alta/baja transaccionales con el bloqueo existente de personas y período. Backend autoritativo antes de FK.
- Creación vacía y clonación dejan cero membresías.
- Importación global no incorpora personas; confirmación de importación específica de período incorpora filas no omitidas dentro de su transacción, incluso sin actividades.

## API y compatibilidad

- `GET /periods/:periodId/memberships`, filtro opcional `person_id`.
- `POST /periods/:periodId/memberships`, cuerpo estricto `{person_id}`.
- `DELETE /periods/:periodId/memberships/:id`: ID acotado al período.
- Inscripciones, cuentas y pagos requieren membresía previa.
- PUT de inscripción/pago rechaza cambios de persona/período. DELETE de inscripción/pago exige `?period_id=...` y rechaza cruces.
- `periodHasData` incluye membresías: un período con personas no se considera vacío.
- El contador existente «Personas inscriptas» del Dashboard cuenta membresías, incluyendo personas sin actividades; no se agregan métricas nuevas.
- Limpieza QA incorpora membresías a su snapshot y bloquea borrar personas con pertenencia, sin borrar membresías automáticamente.

## Migración 008 y recuperación

No se modifican `001.sql`–`007.sql`, ni el migrador. El SQL funciona con su ejecución por sentencias en una misma conexión.

1. Crear tabla con `IF NOT EXISTS`.
2. Backfill mediante `UNION` de `enrollments` y `monthly_accounts`, insertando sólo pares ausentes. No recorrer toda `people`, crear períodos ni modificar datos operativos.
3. Consultar `information_schema.TABLE_CONSTRAINTS` y usar `PREPARE/EXECUTE` para agregar cada FK sólo si falta.
4. El migrador registra `008.sql` únicamente después de completar todas las sentencias.

MySQL confirma DDL implícitamente. Un fallo no garantiza deshacer tabla, backfill o FK previa. Se verificaron fallos antes del backfill y antes de ejecutar la segunda FK: el registro queda pendiente y el reintento completa los pasos faltantes, conservando los ya aplicados. También se verificó reejecución completa con ambas FK existentes y ejecución registrada sin cambios.

Backfill probado con pares presentes en ambas entidades, sólo en cuenta, sólo en inscripción y persona archivada. Persona global sin operaciones queda fuera. Snapshots verifican preservación de personas, períodos, inscripciones, horarios, cuentas y pagos.

**Estado de aplicación:** `008.sql` aplicada en `prisma_test` y `prisma_dev`; posteriormente aplicada en producción, con smoke test aprobado según confirmación del usuario. La aplicación local fue autorizada después de un preflight de solo lectura: cero pares en inscripciones/cuentas, cero pares huérfanos y cero membresías previstas. Se ejecutó únicamente `008.sql` en MySQL local contra `prisma_dev`, sin reconstruir la base, borrar datos ni crear datos de prueba. Se verificaron tabla existente, registro único en `schema_migrations`, `fk_enrollment_membership`, `fk_account_membership` y cero membresías iniciales.

**Procedimiento de producción registrado (ya completado según el usuario):** backup y preflight obligatorios de la DB productiva, detener escrituras durante migración, aplicar/verificar `008.sql`, registrar y recién después desplegar código compatible con autorización explícita. No ejecutar tests contra producción. Integración destructiva y pruebas de recuperación exclusivamente en `prisma_test`; `prisma_dev` se utilizó para migración controlada y revisión manual autorizadas. `prisma_demo` permanece intacta. Reservar `009.sql` para posteriores cambios de esquema.

## Validación

- Prettier una sola vez sobre archivos nuevos/modificados compatibles.
- Typecheck, lint, tests normales (104), integración exclusiva en `prisma_test` (202), build y `git diff --check`.
- Cobertura de los 14 criterios solicitados, inactivos/cierre, validación de cuerpos, FK, alta duplicada concurrente y carrera entre quitar/asignar actividad.
- Rollback DML verificado tras insertar membresía y provocar fallo; importaciones y clonación verifican rollback junto con sus datos relacionados.
- Build puede emitir warnings conocidos no bloqueantes de Zod/Rollup.
- Prueba manual satisfactoria en `prisma_dev`, confirmada por el usuario; detalle abajo.

### Revisión manual — 2026-10-07

El usuario verificó:

- Período inicialmente sin miembros y persona existente únicamente en BBDD.
- Búsqueda mediante «Agregar persona» e incorporación explícita al período.
- Pertenencia con cero actividades y posterior asignación de actividad.
- Bloqueo de «Quitar del período» mientras existe inscripción.
- Cancelación de la última actividad conservando la membresía.
- Baja posterior de la membresía y persistencia intacta de la persona en BBDD Personas.

La validación manual no cambia la regla de baja: cualquier inscripción o cuenta mensual, incluso vacía, debe bloquearla. La iteración quedó posteriormente integrada y desplegada, con `008.sql` aplicada en producción y smoke test aprobado según confirmación del usuario.

## Fuera de alcance

Receptor/medio, Informática, métricas nuevas, refactors generales y cambios productivos quedan pendientes. La adaptación de limpieza QA se limita a proteger la nueva pertenencia; no se ejecutó limpieza sobre bases no descartables.
