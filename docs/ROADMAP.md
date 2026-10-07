# PRISMA CRM — Roadmap

**Actualizado:** 2026-10-07

## Completado recientemente

- Nomenclatura H1 sincronizada con sidebar.
- Sección `Estadísticas` creada como shell visual.
- `Gastos Período` implementado con categorías personalizables y movimientos.
- Migración `007.sql` aplicada en producción.

- Clonación de configuración al crear período: validada y aprobada manualmente, incorporada a Git en `a073783`. Documento de cierre histórico: `docs/iterations/2026-10-clone-period-config.md`.

## Corrección validada — Inscriptos Período; integración y deploy pendientes

- Prioridad anterior a receptor/medio: pertenencia explícita mediante `period_memberships`.
- Implementada, testeada y validada manualmente en `prisma_dev`; `fix/period-enrollees-membership` todavía sin commit ni integración a `main`.
- `008.sql` aplicada en `prisma_test` y `prisma_dev`; todavía NO aplicada en producción. Producción/main continúa en `66e944a`.
- Antes del deploy productivo: backup y preflight obligatorios de la DB de producción, aplicación/verificación manual de `008.sql` y autorización explícita de integración/deploy.
- Períodos nuevos/clonados sin personas. Alta sin actividades/cuentas automáticas. Baja bloqueada ante inscripciones o cuentas.
- Documento: `docs/iterations/2026-10-period-enrollees-membership.md`.

## Prioridad 1 — Reestructurar Cobros Período: receptor ≠ medio

Separar:

- Receptor: Hernán / Jesica.
- Medio: Efectivo / Transferencia.

Permitir las cuatro combinaciones.

Si requiere esquema, usar `009.sql` o superior: `008.sql` queda dedicada a membresías.

## Prioridad 2 — Ingresos de Informática separados

- ingreso exclusivo de Hernán;
- efectivo o transferencia;
- registro separado de PRISMA;
- futura cartera/sección independiente en Dashboard.

No clasificar solo comparando el texto `Informática`.

## Prioridad 3 — Dashboard financiero definitivo

Construir después de:

1. receptor/medio;
2. Informática separada;
3. Gastos reales (ya implementado).

Debe distinguir:

- ingresos PRISMA;
- ingresos Informática;
- receptor;
- medio;
- egresos;
- eventualmente resultado/neto.

## Prioridad 4 — Responsive / estética fina

Correcciones puntuales por pantalla:

- scroll horizontal;
- márgenes;
- paddings;
- tamaños;
- mobile.

Sin refactor visual masivo.

## Prioridad 5 — Estadísticas

La ruta/página ya existe. Falta diseñar explícitamente:

- KPIs;
- filtros;
- gráficos;
- períodos comparables;
- fuentes de datos.

No implementar estadísticas arbitrarias sin definición previa.

## Prioridad 6 — PDF / reportes

Postergado deliberadamente hasta estabilizar los modelos financieros y Estadísticas.

## Backlog documental menor

Actualizar README histórico que todavía menciona el antiguo MySQL portátil en `tmp/mysql`.
