# PRISMA CRM — Estado actual

**Corte:** 2026-10-07

## Git / producción

- Rama productiva: `main`.
- Producción/main continúa en `66e944a docs: refine local development workflow`, confirmado por el usuario al cerrar la revisión manual.
- Commit anterior relevante: `3774c77 feat: add statistics section and align page titles`.
- `main` auto-despliega SiteGround.
- Rama de trabajo actual: `fix/period-enrollees-membership`.
- HEAD local: `66e944a docs: refine local development workflow`, coincidente con `origin/main` tras fetch el 2026-10-07.
- Clonación incorporada a Git en `a073783`; la descripción anterior de cambios sin commit quedó desactualizada.
- Corrección de pertenencia explícita implementada, testeada y validada manualmente en `prisma_dev`; la rama `fix/period-enrollees-membership` sigue sin commit ni integración a `main`. Producción y SiteGround no se modificaron.

## Producción

- Web pública: `https://prismacomunidad.com.ar`
- CRM: `https://crm.prismacomunidad.com.ar`
- Migraciones aplicadas y registradas: `001.sql` → `007.sql`.
- `008.sql` todavía NO está aplicada en producción. Antes del deploy son obligatorios backup y preflight de la DB productiva, seguidos de aplicación y verificación manual de `008.sql`.
- Backup previo a `007.sql`: `pre-gastos-periodo-007`.
- `007.sql` fue validada, aplicada y registrada correctamente.

## Iteraciones completadas recientes

### Nomenclatura + Estadísticas

- H1 sincronizados con sidebar.
- Nueva entrada `Estadísticas` con icono y ruta `/estadisticas`.
- Página de Estadísticas existe pero está deliberadamente vacía salvo su H1.

### Gastos Período

- Ruta visible actual: `/publicidad` (se mantiene por compatibilidad interna).
- Nuevo modelo: categorías por período + movimientos por categoría.
- Sin categorías predeterminadas.
- CRUD de categorías y gastos implementado.
- Fecha obligatoriamente dentro del período seleccionado.
- Períodos cerrados quedan en modo consulta y bloquean escrituras.
- Reapertura vuelve a habilitar escrituras.
- Aislamiento por período verificado manualmente.
- API antigua de publicidad responde `410` / queda fuera de uso operativo.
- `advertising_investments` permanece como respaldo histórico.

### Clonar configuración al crear período

- Implementada, validada y aprobada manualmente; incorporada a `main` en `a073783`, según Git verificado.
- El modal del `+` permite crear vacío o copiar el período existente cronológicamente anterior, resuelto por backend.
- Si la fuente está vacía, no se busca otro período más antiguo.
- Se copian ofertas, días, múltiples horarios y facilitadores con IDs nuevos, conservando estados y reiniciando `ever_used=0` en ofertas/horarios.
- No se copian personas, inscripciones, cuentas, cobros, pagos, categorías de gastos ni gastos.
- Operación transaccional y rollback verificados.
- Typecheck, lint, tests normales (102 aprobados), integración exclusivamente en `prisma_test` (190 aprobados), build y `git diff --check`: OK.
- Revisión manual: Diciembre 2026 clonó correctamente desde Noviembre 2026 las ofertas, días, múltiples horarios y facilitadores.
- No requirió migración; la posterior `008.sql` se dedica a pertenencia explícita de personas.
- Documento de cierre: `docs/iterations/2026-10-clone-period-config.md`.

### Inscriptos Período — pertenencia explícita

- `period_memberships` es la fuente canónica persona ↔ período, independiente de actividades y cuentas.
- Agregar crea únicamente membresía; cancelar la última actividad conserva la pertenencia.
- Quitar elimina únicamente membresía y responde `409` si existe cualquier inscripción o cuenta mensual, incluso vacía.
- Período cerrado bloquea altas/bajas. Personas archivadas conservan membresías históricas visibles; no pueden incorporarse nuevamente.
- Lista principal separada del buscador global; Cobros utiliza personas del período. Receptor/medio sigue pendiente.
- `008.sql` aplicada en `prisma_test` y, con autorización explícita después de preflight de solo lectura, en `prisma_dev`. Integración destructiva y pruebas de recuperación exclusivamente en `prisma_test`.
- Aplicación en `prisma_dev` verificada: tabla de membresías, registro único de `008.sql`, ambas FK compuestas y cero membresías iniciales, sin crear datos de prueba durante la migración.
- Migraciones productivas siguen documentadas hasta `007.sql`; `008.sql` requiere aplicación manual antes de desplegar este código. Reservar `009.sql` para el siguiente cambio de esquema.
- Validación: typecheck, lint, 104 tests normales, 202 tests con DB, build y diff check. Revisión manual satisfactoria confirmada por el usuario: búsqueda global, incorporación sin actividades, asignación, bloqueo de baja con inscripción, cancelación conservando membresía, baja posterior y persona global intacta. Detalle en `docs/iterations/2026-10-period-enrollees-membership.md`.

## Migración histórica de publicidad

`007.sql`:

- No crea períodos.
- Migra históricos solo si el período correspondiente ya existe.
- Preflight impide una migración silenciosamente incompleta si encuentra históricos sin período.
- Agosto 2026: 7 movimientos migrados, total $174.216,44.
- Septiembre 2026: 5 movimientos migrados, total $103.551,67.
- Los 4 gastos reales de julio que no tenían período fueron documentados, retirados antes de `007`, luego se creó Julio 2026 manualmente y fueron reingresados mediante el nuevo modelo.

## Entorno local

Ruta estándar:

`C:\dev\personal\prisma-crm`

MySQL:

- Community Server 8.4.11
- servicio `MySQL84`
- puerto `3306`
- usuario app local `prisma_local@127.0.0.1`

Scripts privados:

```powershell
.\private\run-dev.ps1
.\private\run-demo.ps1
```

## Validación conocida de Iteración Gastos

- Typecheck: OK
- Lint: OK
- Tests normales: OK
- Suite MySQL sobre `prisma_test`: 182 tests OK
- Build: OK (warnings no bloqueantes conocidos de Zod/Rollup)
- `git diff --check`: OK

## Próximo objetivo

**Reestructurar Cobros Período: receptor ≠ medio.**

Inscriptos Período queda implementada, testeada y validada manualmente. Su commit, integración y deploy siguen pendientes de autorización; antes del deploy se requiere backup y preflight de producción y preparación manual de `008.sql`.

Ver `docs/ROADMAP.md` (Prioridad 1).
