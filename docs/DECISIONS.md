# PRISMA CRM — Decisiones de producto y arquitectura

Este documento registra decisiones que no deben rediscutirse en cada iteración salvo que exista un motivo explícito para cambiarlas.

## D001 — Git y producción

`main` es productiva y su push dispara deploy en SiteGround. El push a `main` requiere autorización explícita después de validar localmente.

## D002 — Migraciones aplicadas son inmutables

No editar migraciones ya aplicadas. `001.sql` a `008.sql` aplicadas en producción según confirmación del usuario. `009.sql` separa receptor/medio y está aplicada en `prisma_test` y `prisma_dev`, con tests y revisión manual local aprobados. Sigue pendiente en producción, que continúa con `008.sql`; antes del deploy es obligatorio realizar preflight de solo lectura y luego migración productiva controlada. Pruebas destructivas y de recuperación exclusivamente en `prisma_test`. Próxima numeración: `010.sql`. Reintentos deben soportar DDL parcial de MySQL.

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
- Quitar requiere ausencia de `enrollments` y `monthly_accounts`. Cualquier cuenta, incluso vacía o con importe cero, bloquea la baja con `409`. No se eliminan otras relaciones ni la persona global.
- Períodos cerrados conservan lectura histórica y bloquean altas/bajas de membresías.
- Personas archivadas no pueden incorporarse; sus membresías existentes siguen visibles.
- Crear/clonar períodos deja cero membresías. Importar personas al catálogo global no incorpora a ningún período; confirmar la importación específica de inscripciones sí incorpora explícitamente a las filas no omitidas, dentro de su transacción.
- El backend valida pertenencia y período antes de escribir; FK compuestas desde inscripciones/cuentas refuerzan integridad sin cascadas destructivas.
