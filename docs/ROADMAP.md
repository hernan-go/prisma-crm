# PRISMA CRM — Roadmap

**Actualizado:** 2026-10-07

## Completado recientemente

- Nomenclatura H1 sincronizada con sidebar.
- Sección `Estadísticas` creada como shell visual.
- `Gastos Período` implementado con categorías personalizables y movimientos.
- Migración `007.sql` aplicada en producción.

## Prioridad 1 — Clonar configuración al crear período

Al crear un período desde el botón `+`, permitir:

- Crear período vacío.
- Copiar configuración del período anterior disponible.

Copiar exclusivamente configuración operativa:

- actividades/ofertas;
- nombre de oferta;
- modalidad;
- días;
- horarios;
- facilitadores asignados.

No copiar datos transaccionales ni personas.

Documento de alcance: `docs/iterations/NEXT-clone-period-config.md`.

## Prioridad 2 — Cobros: receptor ≠ medio

Separar:

- Receptor: Hernán / Jesica.
- Medio: Efectivo / Transferencia.

Permitir las cuatro combinaciones.

Si requiere esquema, usar `008.sql` o superior según el orden real de implementación.

## Prioridad 3 — Ingresos de Informática separados

- ingreso exclusivo de Hernán;
- efectivo o transferencia;
- registro separado de PRISMA;
- futura cartera/sección independiente en Dashboard.

No clasificar solo comparando el texto `Informática`.

## Prioridad 4 — Dashboard financiero definitivo

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

## Prioridad 5 — Responsive / estética fina

Correcciones puntuales por pantalla:

- scroll horizontal;
- márgenes;
- paddings;
- tamaños;
- mobile.

Sin refactor visual masivo.

## Prioridad 6 — Estadísticas

La ruta/página ya existe. Falta diseñar explícitamente:

- KPIs;
- filtros;
- gráficos;
- períodos comparables;
- fuentes de datos.

No implementar estadísticas arbitrarias sin definición previa.

## Prioridad 7 — PDF / reportes

Postergado deliberadamente hasta estabilizar los modelos financieros y Estadísticas.

## Backlog documental menor

Actualizar README histórico que todavía menciona el antiguo MySQL portátil en `tmp/mysql`.
