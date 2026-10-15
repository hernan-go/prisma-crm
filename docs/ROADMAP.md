# PRISMA CRM — Roadmap

**Actualizado:** 2026-10-15

## Completado recientemente

- Configuración eliminable vs historial real: integrada, desplegada y aprobada en producción por el propietario. Noviembre 2026 eliminado satisfactoriamente. Sin migración. Detalle: `docs/iterations/2026-10-configuration-cleanup-rules.md`.

- Nomenclatura H1 sincronizada con sidebar.
- Sección `Estadísticas` creada como shell visual.
- `Gastos Período` implementado con categorías personalizables y movimientos.
- Migración `007.sql` aplicada en producción.

- Clonación de configuración al crear período: validada y aprobada manualmente, incorporada a Git en `a073783`. Documento de cierre histórico: `docs/iterations/2026-10-clone-period-config.md`.

## Completado — Inscriptos Período

- Membresías explícitas integradas y desplegadas. `008.sql` aplicada en producción, `main` en `a599378` y smoke test aprobado, confirmados por el usuario.
- Se conservan las reglas documentadas en D014.

## Completado — Cobros Período: receptor ≠ medio

- Implementación local de las cuatro combinaciones Jésica/Hernán × Efectivo/Transferencia.
- `009.sql`: backfill histórico exacto, timestamps preservados y receptor final obligatorio.
- Forms compatible con receipts anteriores; nuevas escrituras siempre requieren receptor.
- Carteras del mes desglosadas por receptor/medio, sin rediseño general.
- `009.sql` aplicada en `prisma_test` y `prisma_dev`. Todos los tests aprobados y revisión manual local aprobada por el usuario; pruebas destructivas y de recuperación exclusivamente en `prisma_test`.
- Cierre confirmado por el usuario: `009.sql` aplicada y registrada en producción; `main` en `df04f17`, deploy `1791429132-5kurej`, build exit code `0`, smoke aprobado e históricos agosto/septiembre/octubre reconciliados.
- Documento: `docs/iterations/2026-10-payment-recipients.md`.

## Decisión de alcance — Informática

Cartera Independiente y separación especial de ingresos/deuda de Informática evaluadas y descartadas. Modelo financiero único para PRISMA. No clasificar ni excluir movimientos por nombre de actividad.

## Iteración 6 — Dashboard implementado localmente

Nuevo diseño operativo/administrativo implementado en `codex/dashboard-redesign`, sin cambios financieros ni DB. Fecha/hora argentina, agenda semanal por período y ayudas accesibles. Clima postergado por condiciones del proveedor/alcance de infraestructura. Pendiente revisión final autenticada e integración manual. Detalle: `docs/iterations/2026-10-dashboard-redesign.md`.

## Pendiente — Egresos y resultado financiero

Diseñar en otra iteración cualquier incorporación de egresos o resultado/neto. La Iteración 6 reorganiza la presentación sin agregar cálculos financieros.

## Completado — Rediseño mobile

Alcance exclusivo `max-width: 700px`; tablet/desktop desde `701px` conservan su diseño. Implementación y revisión visual manual final aprobadas:

- header común sin sticky: PRISMA + hamburguesa / título + ayuda / período + selector + creación `+`, con alineación compartida;
- hamburguesa con nueve secciones y cierre de sesión al final;
- descripciones en ayuda accesible;
- Dashboard 2x2, Personas y Cobros con tres columnas;
- CTAs principales a izquierda y footer oculto solo en mobile;
- Agenda/Gastos y recorridos restantes con adaptaciones conservadoras;
- sin nuevas dependencias, cambios de negocio ni DB.

Validación automática aprobada: typecheck, lint, 116 tests aprobados y 114 integraciones DB omitidas, build y diff check. Revisión manual aprobada por el usuario en 390×900 (menú cerrado/abierto y secciones principales), 700/701px, 768px y 1024px, sin overflow horizontal observado y con tablet/desktop preservados.

Documento: `docs/iterations/2026-10-mobile-redesign.md`. Cierre posterior confirmado por el propietario: integrado, desplegado y aprobado en producción. También está desplegada y aprobada la eliminación de cuentas mensuales estrictamente vacías.

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
