# PRISMA CRM — Estado actual

**Corte:** 2026-10-15

## Git / producción

- Iteración actual: nuevo Dashboard, implementado en `codex/dashboard-redesign`, base limpia `c20b451` coincidente con `main` y `origin/main` tras fetch el 2026-10-15. Trabajo local autorizado con commits; sin push ni merge.
- Mobile, quitar cuenta mensual estrictamente vacía y configuración eliminable están integrados, desplegados y aprobados por el propietario en producción, confirmado en el pedido de Iteración 6. Noviembre 2026 creado por error fue eliminado satisfactoriamente. Los apartados anteriores de validación local se conservan como evidencia histórica y quedan superados por este cierre.
- Producción y SiteGround no se consultan ni modifican en esta iteración. Sin cambios DB ni migraciones; `001–009` siguen inmutables.
- Nueva política: autonomía de Git local/archivos/validaciones/commits en iteraciones aprobadas; pushes e integración a main manuales del propietario después de revisión.

## Dashboard — Iteración 6 local

- Operación diaria y resumen administrativo separados, responsive acotado al Dashboard. Widget de fecha/hora argentina actual; programación del día semanal dentro del período seleccionado; nombres siempre visibles también en mobile, según corrección fina posterior aprobada. Cabecera operativa en dos tiles y ayudas KPI ancladas individualmente.
- KPIs mantienen cálculos backend: personas del período e inscripciones a actividades son conceptos distintos. Carteras, saldos y gráfico CSS conservados.
- Agenda y finanzas independientes, claves por período, sin fallback a otro mes. Clima integrado mediante GET /api/weather y proxy/caché en memoria hacia MET Norway para Rosario. Temperatura, icono Lucide y condición exclusivamente dentro del tile gris, después de la hora; fuente y licencia visibles. Sin DB ni dependencias nuevas. Se conserva el estado «Clima no disponible» ante fallas.
- Validación: typecheck, lint, build y diff check aprobados; 162 tests aprobados, 157 integraciones omitidas; 36 casos nuevos de clima. QA meteorológico aislado en los siete anchos, éxito y error; consulta real a MET Norway aprobada. Desbordamiento previo del selector global en 701px documentado. Revisión autenticada real y smoke del hosting pendientes del propietario.
- Detalle de implementación, QA y limitaciones: `docs/iterations/2026-10-dashboard-redesign.md`. Pendiente revisión final autenticada del propietario e integración/despliegue manual.

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
- Corrección local validada el 2026-10-08: Quitar elimina membresía y, si existe, cuenta estrictamente vacía (`amount_due NULL`, cero pagos y cero inscripciones), atómicamente. Inscripciones, pagos o importe definido (incluido cero) bloquean con `409`. Pendiente de revisión/deploy; producción conserva la regla anterior hasta desplegar.
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

## Historial de validación local — Rediseño mobile (desplegado y aprobado posteriormente)

- Alcance exclusivo `max-width: 700px`; desde `701px` tablet/desktop preservados. Header mobile común sin sticky/fixed: PRISMA + hamburguesa / título + ayuda / período + selector + creación `+`, con alineación compartida entre rutas.
- Menú desplegable con nueve secciones e íconos actuales, cierre de sesión al final y ayudas accesibles con las descripciones existentes.
- CTAs principales alineados a izquierda. Personas: Persona/Teléfono/Estado con indicador de estado accesible y label de archivadas clickeable de 44px. Cobros: Persona/A cobrar/Saldo, sin cambios financieros. Dashboard con métricas 2x2; Agenda/Gastos y demás pantallas con adaptaciones conservadoras. Footer oculto solo en mobile.
- Sin dependencias nuevas, SQL, cambios de API ni datos ficticios. Integración destructiva DB no necesaria para esta iteración UI.
- Validación automática local aprobada: Prettier una vez por pasada sobre los archivos compatibles tocados, typecheck, lint, 116 tests aprobados/114 integraciones DB omitidas, build y diff check. Integración DB desactivada; sin cambios DB, migraciones ni lógica de negocio.
- Revisión visual manual final aprobada por el usuario: 390×900, menú cerrado/abierto y todas las secciones principales; 700/701px, tablet 768px y tablet/notebook 1024px. Sin overflow horizontal observado; header, menú, CTAs y tablas/listados aprobados. Layout anterior preservado desde 701px. Servidores locales sobre `prisma_dev` detenidos al cierre documental; sin autorización de commits ni deploy.
- Documento: `docs/iterations/2026-10-mobile-redesign.md`.

## Historial de validación local — Quitar cuenta mensual vacía (desplegado y aprobado posteriormente)

- Rama actual `fix/remove-empty-monthly-account`, base `19eae35`. Sin add, commit, push, merge ni cambio de rama desde Codex.
- Corrige la imposibilidad de deshacer una incorporación errónea después de eliminar actividades/pagos: la cuenta automática persistía y bloqueaba la baja por su sola existencia.
- D014 actualizada con autorización explícita: únicamente una cuenta con importe NULL, sin pagos ni inscripciones, puede borrarse junto con la membresía. Cero definido sigue protegido. Se conserva `peopleTransaction`, período abierto, lookup por ID/período, bloqueos y FK sin cascadas nuevas.
- Modal y mensaje 409 adaptados; sin cambios de estilos, creación de cuentas, pagos, importaciones, dashboard, dependencias, esquema ni migraciones.
- Validaciones: typecheck, lint, 116 tests normales (122 integraciones omitidas), suite completa 238 aprobados exclusivamente en `prisma_test`, build y diff check. Preflight `SELECT DATABASE()` devolvió exactamente `prisma_test`. Tests/build requirieron reintento fuera del sandbox por EPERM; warnings conocidos de Zod/Rollup no bloqueantes.
- Evidencia productiva de solo lectura comunicada por el usuario: Noviembre 2026, cuentas 147/148 con NULL y 149 con cero; todas sin inscripciones ni pagos. No se conectó a producción ni se modificó `prisma_dev` o SiteGround. Revisión manual, deploy y smoke productivo pendientes de autorización del usuario.
- Documento: `docs/iterations/2026-10-remove-empty-monthly-account.md`.

## Historial de validación local — Configuración eliminable (desplegado y aprobado posteriormente)

- Eliminar período abierto ahora retira atómicamente su configuración y categorías vacías cuando no quedan membresías, inscripciones, cuentas/cobros, cuentas/pagos de facilitadores, gastos, publicidad histórica del mes ni referencias externas sobre horarios. Flags de oferta/horario en 1 por inscripciones canceladas no bloquean el período completo.
- Editar fecha mantiene regla conservadora: período abierto sin configuración ni datos. Cerrado bloquea edición/eliminación hasta reapertura.
- DELETE individual de oferta/horario preparatorios, conservando historial, catálogos y finanzas. Los flags de oferta/horario siguen protegiendo edición y borrado individual; no se resetean.
- Catálogos globales derivan protección desde relaciones, sin bloquear solo por flags legacy. Actividad exige retirar primero sus ofertas; facilitador puede retirarse de horarios nunca usados sin cuentas/historia y solo en períodos abiertos. QA comparte la misma lógica de catálogos.
- UI con acciones y confirmaciones específicas, sin rediseño ni nuevas dependencias. Cuentas de facilitador, incluso NULL, siempre bloquean; categorías con gastos no se eliminan desde el período.
- Evidencia productiva aportada por el usuario: Noviembre 2026 conserva 7 ofertas, 19 días, 17 horarios y 17 asignaciones; 2 ofertas/3 horarios tienen flag 1 por inscripciones eliminadas; cero entidades operativas/financieras, categorías y publicidad histórica del mes. No se conectó a producción; el smoke real queda pendiente de deploy manual.
- Validaciones: typecheck/lint/build/diff-check OK; 117 tests normales aprobados y 157 integraciones omitidas; suite completa 274 aprobados, ninguna omisión, exclusivamente en `prisma_test` tras preflight. Incluye 35 casos nuevos de integración: Noviembre, bloqueos, aislamiento, rollback y concurrencia. Tests/build requirieron reintento fuera del sandbox por EPERM; warnings conocidos de Zod/Rollup no bloqueantes.
- Sin migración `010.sql`, cambios a `001–009`, resets de flags, commits ni deploy. Revisión manual local preparada exclusivamente en `prisma_test`; confirmaciones destructivas pendientes del usuario.
- Documento: `docs/iterations/2026-10-configuration-cleanup-rules.md`.
