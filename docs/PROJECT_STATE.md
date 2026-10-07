# PRISMA CRM — Estado actual

**Corte:** 2026-10-07

## Git / producción

- Rama productiva: `main`.
- HEAD desplegado: `5144ef5 feat: add customizable period expenses`.
- Commit anterior relevante: `3774c77 feat: add statistics section and align page titles`.
- `main` auto-despliega SiteGround.
- Rama de trabajo actual: `feat/clone-period-config`.
- HEAD local: `516be17 docs: add project context and workflow`.
- Clonación de configuración implementada, validada y aprobada manualmente; cambios de la iteración y documentación aún sin commit ni deploy. El HEAD productivo sigue siendo el indicado arriba.

## Producción

- Web pública: `https://prismacomunidad.com.ar`
- CRM: `https://crm.prismacomunidad.com.ar`
- Migraciones aplicadas y registradas: `001.sql` → `007.sql`.
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

- Implementada y validada en la rama de trabajo, con revisión manual aprobada por el usuario.
- El modal del `+` permite crear vacío o copiar el período existente cronológicamente anterior, resuelto por backend.
- Si la fuente está vacía, no se busca otro período más antiguo.
- Se copian ofertas, días, múltiples horarios y facilitadores con IDs nuevos, conservando estados y reiniciando `ever_used=0` en ofertas/horarios.
- No se copian personas, inscripciones, cuentas, cobros, pagos, categorías de gastos ni gastos.
- Operación transaccional y rollback verificados.
- Typecheck, lint, tests normales (102 aprobados), integración exclusivamente en `prisma_test` (190 aprobados), build y `git diff --check`: OK.
- Revisión manual: Diciembre 2026 clonó correctamente desde Noviembre 2026 las ofertas, días, múltiples horarios y facilitadores.
- No requirió migración; `008.sql` sigue disponible.
- Documento de cierre: `docs/iterations/2026-10-clone-period-config.md`.

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

Ver `docs/ROADMAP.md` (Prioridad 1).
