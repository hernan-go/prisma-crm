# PRISMA CRM — Decisiones de producto y arquitectura

Este documento registra decisiones que no deben rediscutirse en cada iteración salvo que exista un motivo explícito para cambiarlas.

## D001 — Git y producción

`main` es productiva y su push dispara deploy en SiteGround. El push a `main` requiere autorización explícita después de validar localmente.

## D002 — Migraciones aplicadas son inmutables

No editar migraciones ya aplicadas. `001.sql` a `009.sql` aplicadas y registradas en producción según confirmación del usuario. `009.sql` separa receptor/medio y también está aplicada en `prisma_test` y `prisma_dev`, con tests y revisión manual local aprobados; cierre productivo de Cobros en `df04f17`, smoke e históricos reconciliados aprobados. Pruebas destructivas y de recuperación exclusivamente en `prisma_test`. Próxima numeración: `010.sql`. Reintentos deben soportar DDL parcial de MySQL.

## D003 — Dinero

Usar `DECIMAL(12,2)`. Nunca `FLOAT`.

## D004 — Períodos explícitos

Un período solo existe si fue creado explícitamente mediante la funcionalidad de períodos. Ningún gasto, fecha, importación o migración puede crearlo automáticamente.

## D005 — Fecha de gasto

La fecha de un gasto debe pertenecer exactamente al período seleccionado. Esto se valida en frontend y backend.

## D006 — Gastos sin categorías por defecto

`Publicidad`, `Insumos`, `Otros`, etc. no se crean automáticamente. Cada período empieza sin categorías y el usuario crea solo las que necesita.

## D007 — Gastos y cierre de período

Un período cerrado es de solo lectura. Crear, editar o eliminar categorías/gastos requiere reabrir explícitamente el período.

## D008 — Publicidad histórica

`advertising_investments` se conserva como respaldo. El modelo operativo actual es `period_expense_categories` + `period_expenses`.

La migración histórica solo opera sobre períodos existentes. Si encuentra un histórico sin período, debe detenerse e informar; nunca inventar el período.

## D009 — Actividades históricas

`activities.instructor_id` es legado y no es fuente de verdad histórica. La asignación real de facilitadores se resuelve mediante horarios/ofertas del período.

## D010 — Clonación de períodos

La clonación implementada copia configuración operativa, no movimientos, personas ni membresías.

Copiar:

- ofertas/actividades del período;
- nombre de oferta;
- modalidad;
- días;
- horarios;
- facilitadores asignados;
- configuración necesaria para iniciar el nuevo período.

No copiar:

- personas;
- inscripciones;
- cuentas mensuales;
- cobros;
- pagos;
- deudas/saldos;
- cuentas/pagos de facilitadores;
- gastos;
- ningún movimiento financiero.

## D011 — Receptor y medio de cobro independientes

- Receptor de cada payment: `jesica` (Jésica) o `hernan` (Hernán), responsable del dinero PRISMA.
- Medio: exclusivamente `cash` (Efectivo) o `transfer` (Transferencia).
- Las cuatro combinaciones son válidas. Nuevos pagos requieren ambos campos explícitos, sin defaults ni dependencia entre selectores.
- `009.sql` materializa la clasificación histórica vigente: cash → jesica y transfer → hernan. No deja receptores nulos, no agrega legacy_method ni cambia timestamps.
- No cambia cuentas, saldos, sobrepagos, membresías ni cierre de períodos.
- Forms conserva su clave conservadora de duplicados sin recipient. Hashes/receipts anteriores se preservan; reconocimiento legacy exclusivamente de operaciones completadas.

## D012 — Modelo financiero único PRISMA

La separación especial de Informática y Cartera Independiente fue evaluada y descartada por el usuario. Se reemplaza la decisión anterior de separar ingresos. No agregar cuentas independientes, clasificación por actividad, exclusiones del Dashboard ni reglas particulares de deuda. Esta iteración solamente separa receptor y medio en payments.

## D013 — Estadísticas

La ruta y pantalla existen, pero su contenido funcional todavía no fue definido. No agregar métricas arbitrarias sin una iteración de diseño explícita.

## D014 — Pertenencia explícita a períodos

La existencia de una persona en BBDD no implica pertenencia a ningún período. La pertenencia persona ↔ período es explícita e independiente de las actividades. `period_memberships` es su fuente canónica.

- Agregar al período crea únicamente membresía, sin cuentas, importe a cobrar, inscripciones ni pagos.
- Una persona puede pertenecer sin actividades; cancelar la última actividad no elimina su membresía.
- Quitar bloquea con `409` ante cualquier inscripción, pago o importe a cobrar definido, incluido `0.00` (decisión explícita de no cobrar ese mes).
- Una cuenta estrictamente vacía (`amount_due IS NULL`, cero pagos y cero inscripciones del mismo par persona/período) puede eliminarse automáticamente al quitar la membresía. `NULL` significa importe todavía no definido; no equivale a cero.
- Eliminar cuenta vacía y membresía es atómico dentro de `peopleTransaction`; cualquier fallo revierte ambas eliminaciones. Nunca se elimina la persona global ni datos de otros períodos. Sin cuenta ni inscripciones se elimina solamente la membresía.
- Períodos cerrados conservan lectura histórica y bloquean altas/bajas de membresías.
- Personas archivadas no pueden incorporarse; sus membresías existentes siguen visibles.
- Crear/clonar períodos deja cero membresías. Importar personas al catálogo global no incorpora a ningún período; confirmar la importación específica de inscripciones sí incorpora explícitamente a las filas no omitidas, dentro de su transacción.
- El backend valida pertenencia y período antes de escribir; FK compuestas desde inscripciones/cuentas refuerzan integridad sin cascadas destructivas.

## D015 — Configuración eliminable e historia persistente

Configuración no equivale a historia. Las eliminaciones son explícitas, acotadas y transaccionales dentro de `peopleTransaction`, sin nuevas cascadas ni desactivar FK.

- Eliminar un período exige estado abierto y ausencia de membresías, inscripciones, cuentas/cobros, cuentas/pagos de facilitadores, gastos y referencias externas/incompatibles a sus horarios. Publicidad histórica del mismo mes también bloquea. Se elimina exclusivamente su configuración: categorías vacías, asignaciones, horarios, días y ofertas; después el período. Catálogos, personas y otros períodos se conservan.
- Para eliminar el período completo, `period_activities.ever_used` y `activity_schedules.ever_used` no bloquean por sí solos: pueden quedar de inscripciones canceladas explícitamente. No se ponen en cero. Esta regla se basa en datos persistentes actuales, no afirma que nunca hubo operaciones.
- Editar año/mes exige un período abierto realmente vacío de configuración y datos. Un período cerrado debe reabrirse antes de editarlo o eliminarlo.
- DELETE individual de oferta exige oferta y todos sus horarios nunca utilizados, sin inscripciones, slots ni cuentas de facilitadores. Elimina días, horarios y asignaciones propios, sin eliminar la actividad global.
- DELETE individual de horario exige `ever_used=0`, sin slots ni asignaciones del par oferta/facilitador con cuenta persistida que necesiten preservar su snapshot. Elimina sus asignaciones y el horario, conservando la oferta.
- Oferta/horario utilizados conservan sus protecciones de edición y borrado individual aun después de cancelar inscripciones; pueden deshabilitarse.
- Los flags globales de actividades/facilitadores siguen almacenados y activándose por compatibilidad, pero no determinan por sí solos borrabilidad ni la etiqueta «Con historial». Una actividad global requiere cero ofertas y cero inscripciones; primero deben retirarse explícitamente sus ofertas preparatorias.
- Un facilitador global sin historia puede eliminarse retirando sus asignaciones a horarios nunca usados, en una misma transacción. Bloquean horarios usados, slots, cuentas/pagos, referencias legacy y períodos cerrados cuyas asignaciones deban modificarse. Los otros facilitadores y los horarios se conservan.
- Cualquier cuenta de facilitador bloquea, incluso con importe NULL y sin pagos: no se define una excepción de cuenta vacía en esta iteración.
- Categorías sin gastos son configuración eliminable junto con el período. Cualquier gasto bloquea el período antes de borrar categorías. El DELETE individual de categoría conserva su comportamiento existente.
- QA usa la misma función de eliminación de catálogos que la API, conservando lista permitida, revisión y fingerprint.

Sin migración ni recálculo/reset de flags. Los receipts se conservan: su hash no permite reconstruir el período y no hay una auditoría completa de movimientos ya eliminados. Evidencia productiva de Noviembre 2026 aportada por el usuario; Codex no consulta ni modifica producción. Detalle: `iterations/2026-10-configuration-cleanup-rules.md`.
