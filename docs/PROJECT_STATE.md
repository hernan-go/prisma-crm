# PRISMA CRM — Estado actual

**Corte:** 2026-10-08

## Git / producción

- Rama productiva: `main`; auto-despliega SiteGround.
- Base de Rediseño mobile: `df04f17 docs: close payment recipient iteration`; HEAD, referencia local `origin/main` y `main` remota coincidentes, verificado por consulta de referencia el 2026-10-08.
- Cobros integrado en `292018d`; `main` productivo anterior a Rediseño mobile en `df04f17`, según Git y confirmación explícita del usuario.
- Rediseño mobile completado localmente y aprobado visualmente por el usuario, rama `feat/mobile-redesign`; cierre documental completado y cambios locales sin add/commit/push/merge. No se modificó producción ni SiteGround en esta iteración.

## Producción

- Web pública: `https://prismacomunidad.com.ar`
- CRM: `https://crm.prismacomunidad.com.ar`
- Migraciones aplicadas y registradas: `001.sql` → `009.sql`, según confirmación del usuario.
- `008.sql` aplicada en producción; membresías desplegadas y smoke test aprobado, confirmado por el usuario.
- `009.sql` aplicada y registrada también en producción, confirmado por el usuario.
- Deploy productivo de Cobros: `1791429132-5kurej`; build exit code `0`, smoke productivo aprobado e históricos agosto/septiembre/octubre reconciliados, según confirmación del usuario. No se repitieron verificaciones productivas desde Codex.
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
- Lista principal separada del buscador global; Cobros utiliza personas del período.
- `008.sql` aplicada en `prisma_test` y, con autorización explícita después de preflight de solo lectura, en `prisma_dev`. Integración destructiva y pruebas de recuperación exclusivamente en `prisma_test`.
- Aplicación en `prisma_dev` verificada: tabla de membresías, registro único de `008.sql`, ambas FK compuestas y cero membresías iniciales, sin crear datos de prueba durante la migración.
- Cierre posterior confirmado por el usuario: `008.sql` aplicada en producción, membresías desplegadas en `a599378` y smoke test aprobado.
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

## Completado — Cobros Período

- `payments.recipient`: `VARCHAR(6) ascii_bin NOT NULL`, CHECK jesica/hernan y sin default.
- Históricos materializan cash → jesica, transfer → hernan. `009.sql` preserva campos y timestamps y admite recuperación de DDL parcial.
- Nuevos pagos requieren receptor y medio independientes; ambos selectores empiezan vacíos.
- Forms conserva duplicados por persona/período/fecha/monto/medio. Compatibilidad legacy solo para reconocer receipts existentes, sin modificar hashes.
- Dashboard conserva Carteras del mes y desglosa efectivo/transferencia/total por receptor.
- Modelo financiero único para PRISMA. Cartera Independiente y separación especial de Informática evaluadas y descartadas.
- Validación aprobada: typecheck, lint, 116 tests normales aprobados (114 de integración omitidos), suite completa en `prisma_test` con 230 aprobados y ninguno omitido, build y `git diff --check`. Build con warnings no bloqueantes conocidos de Zod/Rollup.
- `009.sql` aplicada en `prisma_test` y, tras preflight de solo lectura y autorización explícita, exclusivamente esa migración en `prisma_dev`. Se verificaron receptor obligatorio sin default, CHECK activo, registro único y cero pagos antes/después; las otras 20 tablas conservaron datos y esquema, y solo se agregó el registro de 009 en `schema_migrations`.
- Revisión manual en `prisma_dev` aprobada por el usuario: cuatro combinaciones, independencia receptor/medio, movimientos correctos y cuenta mensual conservando A cobrar / Pagado / Debe, sin regresiones funcionales visibles. Jésica: efectivo $15.000 + transferencia $20.000 = $35.000; Hernán: efectivo $5.000 + transferencia $20.000 = $25.000; total cobrado $60.000, igual a la suma de carteras.
- Cierre productivo confirmado por el usuario: `009.sql` aplicada y registrada; `main` en `df04f17`, deploy `1791429132-5kurej`, build exit code `0`, smoke aprobado e históricos agosto/septiembre/octubre reconciliados correctamente.
- Documento: `docs/iterations/2026-10-payment-recipients.md`.

## Completado localmente — Rediseño mobile

- Alcance exclusivo `max-width: 700px`; desde `701px` tablet/desktop preservados. Header mobile común sin sticky/fixed: PRISMA + hamburguesa / título + ayuda / período + selector + creación `+`, con alineación compartida entre rutas.
- Menú desplegable con nueve secciones e íconos actuales, cierre de sesión al final y ayudas accesibles con las descripciones existentes.
- CTAs principales alineados a izquierda. Personas: Persona/Teléfono/Estado con indicador de estado accesible y label de archivadas clickeable de 44px. Cobros: Persona/A cobrar/Saldo, sin cambios financieros. Dashboard con métricas 2x2; Agenda/Gastos y demás pantallas con adaptaciones conservadoras. Footer oculto solo en mobile.
- Sin dependencias nuevas, SQL, cambios de API ni datos ficticios. Integración destructiva DB no necesaria para esta iteración UI.
- Validación automática local aprobada: Prettier una vez por pasada sobre los archivos compatibles tocados, typecheck, lint, 116 tests aprobados/114 integraciones DB omitidas, build y diff check. Integración DB desactivada; sin cambios DB, migraciones ni lógica de negocio.
- Revisión visual manual final aprobada por el usuario: 390×900, menú cerrado/abierto y todas las secciones principales; 700/701px, tablet 768px y tablet/notebook 1024px. Sin overflow horizontal observado; header, menú, CTAs y tablas/listados aprobados. Layout anterior preservado desde 701px. Servidores locales sobre `prisma_dev` detenidos al cierre documental; sin autorización de commits ni deploy.
- Documento: `docs/iterations/2026-10-mobile-redesign.md`.
