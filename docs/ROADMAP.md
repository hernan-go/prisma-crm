# PRISMA CRM — Roadmap

**Actualizado:** 2026-10-07

## Completado recientemente

- Nomenclatura H1 sincronizada con sidebar.
- Sección `Estadísticas` creada como shell visual.
- `Gastos Período` implementado con categorías personalizables y movimientos.
- Migración `007.sql` aplicada en producción.

- Clonación de configuración al crear período: validada y aprobada manualmente, incorporada a Git en `a073783`. Documento de cierre histórico: `docs/iterations/2026-10-clone-period-config.md`.

## Completado — Inscriptos Período

- Membresías explícitas integradas y desplegadas. `008.sql` aplicada en producción, `main` en `a599378` y smoke test aprobado, confirmados por el usuario.
- Se conservan las reglas documentadas en D014.

## Iteración actual — Cobros Período: receptor ≠ medio

- Implementación local de las cuatro combinaciones Jésica/Hernán × Efectivo/Transferencia.
- `009.sql`: backfill histórico exacto, timestamps preservados y receptor final obligatorio.
- Forms compatible con receipts anteriores; nuevas escrituras siempre requieren receptor.
- Carteras del mes desglosadas por receptor/medio, sin rediseño general.
- `009.sql` aplicada en `prisma_test` y `prisma_dev`. Todos los tests aprobados y revisión manual local aprobada por el usuario; pruebas destructivas y de recuperación exclusivamente en `prisma_test`.
- Pendiente integración/deploy y aplicación de `009.sql` en producción, que continúa con `008.sql`. Antes del deploy: backup, preflight de solo lectura y luego migración productiva controlada, verificación y registro, con escrituras pausadas hasta desplegar código compatible.
- Documento: `docs/iterations/2026-10-payment-recipients.md`.

## Decisión de alcance — Informática

Cartera Independiente y separación especial de ingresos/deuda de Informática evaluadas y descartadas. Modelo financiero único para PRISMA. No clasificar ni excluir movimientos por nombre de actividad.

## Pendiente — Dashboard financiero definitivo

Diseñar en otra iteración cualquier incorporación de egresos o resultado/neto. Esta iteración solo corrige la card existente de carteras.

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
