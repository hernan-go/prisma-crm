# PRISMA CRM — Estado actual

**Corte:** 2026-10-23

## Estado vigente — Iteración 8 cerrada en producción

Según las operaciones y verificaciones realizadas por el propietario y confirmadas el 23/10/2026: Iteración 8 implementada y publicada en `51e247e`, migraciones `001–011` aplicadas y registradas en producción, build SiteGround con exit code `0` y smoke productivo aprobado. Estadísticas v1, IPC, desglose de Gastos y Gastos Recurrentes con independencia mensual funcionan en producción. Octubre 2026 quedó reclasificado y conciliado económicamente; es un cierre con fecha de corte, no un parámetro permanente. La reclasificación por UI recreó movimientos y cambió IDs/timestamps; no acredita identidad histórica de registros.

Codex comprobó independientemente en la inspección local de Iteración 9: working tree limpio, `main` y referencias locales `origin/main`, `origin/HEAD` y rama de Iteración 8 en `51e247e`, y presencia del código y migraciones correspondientes. No consultó GitHub ni producción ni verificó allí la DB. El despliegue, las migraciones y la conciliación productivos se registran como confirmaciones del propietario, aportadas en los handoffs del 23/10; el handoff del 22/10 es antecedente anterior al despliegue.

## Iteración 9 — Documentación aprobada; desarrollo pendiente

Doble finalidad y arquitectura compartida registradas en D020; honorarios dinámicos y límites económicos en D021 de [DECISIONS](DECISIONS.md). Resumen mensual, IPC y desglose están implementados; siete bloques/acordeones exclusivos están aprobados funcionalmente y diseñados, sin implementar. Recharts no está instalado. Próxima fase funcional: gráficos mensuales por período seleccionado; después anual y luego histórica, según [ROADMAP](ROADMAP.md). Los dos gráficos de gastos sugeridos son una propuesta pendiente de aprobación; no se autorizó su implementación.

La conexión con IA no existe y queda para un proyecto posterior con diseño y autorización independientes. Esta intervención autoriza únicamente los seis Markdown acordados, sin cambios de código, dependencias, DB, ramas, commits ni producción; no repite pruebas ni auditorías previas.

## Antecedentes de cierre y validación

Los registros siguientes conservan el estado y la evidencia de cada intervención anterior. Las menciones a pantalla vacía, producción hasta 009, activación 010–011, integración o despliegue pendientes quedan superadas por el estado vigente anterior; no representan tareas actuales. La aprobación productiva no amplía los casos automatizados a pruebas manuales que no fueron informadas.

## Iteración 8 — Cierre local aprobado

Hernán aprobó manualmente en prisma_dev, para diciembre de 2026: importes y conciliación de $860.000, posiciones independientes, renumeración, retiro de Luz sin importe, persistencia entre períodos y reincorporación. No se declara aprobación manual de los casos cubiertos solo por pruebas automatizadas. Se autorizaron tres commits locales (010–011, implementación integrada y documentación). Integración a main y despliegue pendientes; ninguna operación DB en este cierre. Los apartados anteriores de esta iteración conservan el contexto histórico y sus pendientes de revisión quedan superados únicamente para los recorridos expresamente aprobados.

## Git / producción

- Iteración 7 completada, publicada y validada visualmente en producción. Ocho commits desde `e13f952` integrados por fast-forward a `main`, con HEAD publicado `06f3d1f69ef6e84be55279b4dbd394a888a74b6b` en `hernan-go/prisma-crm`. El propietario realizó el push manual y confirmó SiteGround con `build_script_exit_code = 0` y aprobación visual desktop/mobile, incluida la corrección final de BBDD Personas. [Registro de cierre e historial técnico](iterations/2026-10-maintenance.md).
- Iteración 6 cerrada en producción: Dashboard y MET Norway integrados a `main`, push productivo realizado y HEAD final `e13f952`. El propietario confirmó build SiteGround con exit code `0` y verificación visual productiva del Dashboard y clima. Base `c20b451`, implementación meteorológica en `41860a0`; sin cambios de esquema ni nuevas migraciones. Confirmación registrada el 2026-10-20; no se repitieron pruebas productivas desde Codex.
- Mobile, quitar cuenta mensual estrictamente vacía y configuración eliminable están integrados, desplegados y aprobados por el propietario en producción, confirmado en el pedido de Iteración 6. Noviembre 2026 creado por error fue eliminado satisfactoriamente. Los apartados anteriores de validación local se conservan como evidencia histórica y quedan superados por este cierre.
- Codex no realizó operaciones ni verificaciones productivas adicionales: el build de SiteGround y la revisión visual en producción fueron comprobados por el propietario. Iteración 7 sin nuevas migraciones SQL ni operaciones DB; `001–009` siguen inmutables. Este cierre no implica una auditoría adicional de datos.
- Nueva política: autonomía de Git local/archivos/validaciones/commits en iteraciones aprobadas; pushes e integración a main manuales del propietario después de revisión.

## Iteración 7 — Unificación UX/UI y responsive completada

- Regularización documental de la iteración 6, corrección responsive del header a 701px y actualización del README al entorno MySQL vigente.
- Agrupación de horarios no vigentes y rediseño UX/UI de Configuración.
- Unificación estética y responsive de los módulos administrativos, ajustes mobile del Dashboard y refinamientos de tablas, Agenda y componentes financieros.
- Regresión mobile de BBDD Personas corregida: hasta 700px, Persona/Teléfono/Estado circular accesible, nombres completos y sin scroll horizontal; desde 701px se conservan las seis columnas aprobadas.
- Validación local de cierre aprobada: typecheck, lint, 169 pruebas, build y diff check; 157 integraciones DB omitidas. Revisión funcional/visual local y revisión visual productiva desktop/mobile aprobadas por el propietario. Iteración cerrada; no quedan integración, revisión ni despliegue pendientes de esta iteración.

## Próximos desarrollos pendientes

Autenticación mediante Google decidida expresamente por el propietario y pendiente de desarrollo; el diseño técnico definitivo aún debe realizarse. También permanecen pendientes la definición del resultado económico mensual, las siguientes etapas e integración de Estadísticas e informes/exportaciones PDF, sin cambiar sus prioridades. Alcances y dependencias en [ROADMAP](ROADMAP.md). La siguiente iteración funcional partirá de este estado aprobado, sin reabrir la iteración 7.

## Iteración 8 — Diseño funcional de Estadísticas

Definiciones principales aprobadas por Hernán el 2026-10-22; documentación local preparada para revisión. Resumen ejecutivo económico, siete acordeones con apertura exclusiva, motor determinista reutilizable, subtotales con cobertura y continuidad principal por personas inscriptas en meses consecutivos. Recharts es primera opción pendiente de instalación/validación. No mostrar ganancia neta sin modelo contable aprobado.

El propietario confirmó pagos a facilitadores exclusivamente en su módulo, separados de Gastos; no se constató ni se presume duplicación efectiva. Se incorpora a la planificación una tarea diferenciada de Gastos recurrentes/adicionales, configurable por instalación y con importes propios de cada período. No modifica D006 ni autoriza categorías automáticas.

Etapa 1 autorizada después del cierre documental: resumen ejecutivo local, contratos tipados, motor Decimal y endpoint autenticado de lectura consistente. Validación local aprobada; pendiente de revisión del propietario, integración y producción. Sin nuevas dependencias, migraciones, commits ni despliegue. Base local `dcee416` preservada en `main` y en la rama documental `codex/iteration-8-statistics-design`; `origin/main` y `origin/HEAD` locales siguen en `06f3d1f`, sin sincronización ni nueva verificación productiva. Detalle: [diseño, indicadores v1, etapas y pendientes](iterations/2026-10-statistics-design.md).

Correcciones funcionales posteriores implementadas localmente: Quitar importe borra un único movimiento recurrente confirmado dentro del período abierto, preserva tarjeta/categoría y refresca consultas. Estadísticas incorpora desglose read-only por recurrentes/adicionales con cantidades, subtotales y reconciliación del KPI. El esquema 010 carece de presencia/posición mensual; **Quitar del período** y Posición editable quedan detenidos hasta diseñar, autorizar y validar una migración nueva. El propietario informó que los ocho conceptos ya fueron configurados y probados manualmente en prisma_dev; esta intervención no modificó esa base. Suite DB específica aprobada exclusivamente en `prisma_test`; revisión visual autenticada pendiente. Sin migración, commits ni publicación. [Implementación y propuesta de esquema](iterations/2026-10-recurring-expenses-implementation.md).

## Iteración 8 — Activación 011 en prisma_dev completada

011 aplicada con autorización expresa a prisma_dev el 2026-10-22, después de preflight y respaldo externo SHA256 verificado. Postflight: 22 tablas originales idénticas por conteo/hash, tres settings, 22 presencias; diciembre conserva cuatro movimientos por $860.000. Lecturas autenticadas de recurrentes, categorías y Estadísticas responden 200 y concilian. Backend local restablecido. Sin pruebas destructivas, commits ni publicación; prisma_test/demo/producción no modificadas en esta activación. El estado siguiente describe la etapa anterior y queda superado para prisma_dev. [Registro de activación y respaldo](iterations/2026-10-recurring-period-independence.md#activación-controlada-de-011-en-prisma_dev--completada-2026-10-22).

## Iteración 8 — Independencia mensual 011 implementada localmente

El bloqueo documental previo de presencia/posición queda superado por la autorización y la implementación de 011, backend, frontend y pruebas. 011 aplicada y verificada exclusivamente en prisma_test con respaldo externo verificado. prisma_dev permanece en 010 y producción en 001–009 según el estado previamente confirmado, sin nuevas operaciones sobre esos entornos. El código requiere 011 para recurrentes y alta/edición/eliminación de períodos: devuelve error explícito hasta su activación independiente. No hay commits, staging, push, merge ni deploy. [Informe, evidencia, riesgos y procedimiento posterior](iterations/2026-10-recurring-period-independence.md).

Estadísticas anuales e históricas queda registrada como pendiente en Roadmap y diseño funcional; no implementada.

## Dashboard — Iteración 6 desplegada y verificada

- Operación diaria y resumen administrativo separados, responsive acotado al Dashboard. Widget de fecha/hora argentina actual; programación del día semanal dentro del período seleccionado; nombres siempre visibles también en mobile, según corrección fina posterior aprobada. Cabecera operativa en dos tiles y ayudas KPI ancladas individualmente.
- KPIs mantienen cálculos backend: personas del período e inscripciones a actividades son conceptos distintos. Carteras, saldos y gráfico CSS conservados.
- Agenda y finanzas independientes, claves por período, sin fallback a otro mes. Clima integrado mediante GET /api/weather y proxy/caché en memoria hacia MET Norway para Rosario. Temperatura, icono Lucide y condición exclusivamente dentro del tile gris, después de la hora; fuente y licencia visibles. Sin DB ni dependencias nuevas. Se conserva el estado «Clima no disponible» ante fallas.
- Validación local histórica: typecheck, lint, build y diff check aprobados; 162 tests aprobados, 157 integraciones omitidas; 36 casos nuevos de clima. QA meteorológico aislado en los siete anchos, éxito y error; consulta real a MET Norway aprobada. Desbordamiento previo del selector global en 701px documentado. Revisión visual desktop/mobile y clima aprobada explícitamente por el propietario. Cierre posterior: build y verificación visual productiva confirmados por el propietario, sin verificaciones productivas adicionales desde Codex.
- Detalle de implementación, QA y limitaciones: `docs/iterations/2026-10-dashboard-redesign.md`. Las referencias históricas a integración y despliegue pendientes quedan superadas por el cierre productivo en `e13f952`.

## Producción — referencia vigente y antecedentes de Cobros

- Web pública: `https://prismacomunidad.com.ar`
- CRM: `https://crm.prismacomunidad.com.ar`
- Migraciones aplicadas y registradas: `001.sql` → `011.sql`, según confirmación del propietario del 23/10/2026. Publicación vigente: `51e247e`; los puntos siguientes conservan la evidencia histórica de Cobros.
- `008.sql` aplicada en producción; membresías desplegadas y smoke test aprobado, confirmado por el usuario.
- `009.sql` aplicada y registrada también en producción, confirmado por el usuario.
- Deploy productivo de Cobros: `1791429132-5kurej`; build exit code `0`, smoke productivo aprobado e históricos agosto/septiembre/octubre reconciliados, según confirmación del usuario. No se repitieron verificaciones productivas desde Codex.
- Backup previo a `007.sql`: `pre-gastos-periodo-007`.
- `007.sql` fue validada, aplicada y registrada correctamente.

## Iteraciones completadas recientes

### Nomenclatura + Estadísticas

- H1 sincronizados con sidebar.
- Nueva entrada `Estadísticas` con icono y ruta `/estadisticas`.
- En la entrega inicial de nomenclatura, Estadísticas era una pantalla vacía salvo su H1; ese estado histórico fue superado por la v1 publicada en Iteración 8.

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

## Iteración 8 — Refinamiento del resumen e IPC local

El propietario confirmó los cálculos y la actualización de montos de Etapa 1. Se refinó el resumen: seis tarjetas en una fila cuando el área de contenido supera 1300 px, tres en anchos intermedios, dos en tablet estrecha y una en móvil; sin bordes superiores de colores. Encabezado único con estado del período a la derecha (también junto al título mobile) y ayudas por tarjeta con cierre por Escape/clic exterior y retorno de foco.

IPC mínimo autorizado e implementado localmente: `GET /api/statistics/inflation`, detrás de la autenticación actual, consulta página y CSV oficiales del INDEC, identifica publicación y nivel general Nacional y calcula acumulado desde diciembre anterior. Caché de seis horas, reintento tras 15 minutos si falla y respaldo verificado de septiembre 2026 (1,9 % mensual, 23,6 % acumulado, 33,4 % interanual; publicado 13/10/2026, contrastado 22/10/2026). La UI muestra referencia y advierte si usa el último verificado sin actualización confirmada. Sin DB ni persistencia histórica; al reiniciar sin acceso al proveedor queda el respaldo incluido, con sus fechas explícitas. No modifica las fórmulas financieras. Validaciones del refinamiento: typecheck, lint, 188 pruebas (158 casos DB omitidos), build y diff check aprobados; consulta real al adaptador INDEC aprobada. QA con datos ficticios a 390/700/701/768/1024/1440/1920 px sin scroll horizontal, seis tiles en una fila a 1920 px, todas las ayudas operativas, apertura por teclado, cierre exterior/Escape y retorno de foco comprobados. No se ejecutaron pruebas DB; revisión del propietario, integración y producción pendientes. Acordeones y Recharts continúan pendientes.

## Iteración 8 — Registro previo: evaluación de Gastos antes de autorizar esquema

Este registro previo queda superado por la implementación local descrita debajo. El pedido de esa etapa autorizó reorganizar Gastos y exigió detener la parte que requiriera ampliar MySQL. La inspección confirmó que las categorías son exclusivamente por período y carecen de catálogo/vínculo recurrente. Se preparó una propuesta aditiva: tabla transversal de conceptos y referencia nullable/única por período en las categorías actuales. No se implementó todavía la reorganización ni se creó/ejecutó una migración. Las categorías y movimientos actuales permanecen intactos; D006 sigue vigente.

Propuesta, DDL, tratamiento de históricos, efectos en Estadísticas/clonación y pruebas posteriores: [Gastos recurrentes](iterations/2026-10-recurring-expenses-design.md). Maqueta independiente para revisión: tmp/expenses-reorganization-preview.html, sin datos, almacenamiento ni acciones activas. La captura mencionada no estaba incluida en el adjunto. Estadísticas/IPC y el resto del trabajo pendiente se preservaron. La implementación de configuración/vínculos y nueva pantalla queda pendiente de autorización expresa; no se declara desplegada.

## Iteración 8 — Registro de implementación inicial de Gastos Recurrentes (prisma_test)

Implementación real en /publicidad: ocho tarjetas mediante configuración explícita PRISMA, catálogo transversal, importe mensual con corrección por el mismo ID y asociación histórica por IDs. Adicionales conserva su CRUD. 010 aplicada y registrada solo en prisma_test (MySQL 8.4.11), con respaldo verificado, recuperación de DDL parcial y replay completo; campos económicos originales preservados. Catálogo de prisma_test vacío al terminar la limpieza de fixtures; no se configuró la instalación real.

Validaciones y revisión responsive: [cierre técnico](iterations/2026-10-recurring-expenses-implementation.md). Sin modificación de prisma_dev, prisma_demo o producción; sin commits, push, merge ni deploy. Producción continúa en 001–009. Se preservan Estadísticas e IPC y el HEAD dcee416 en codex/iteration-8-statistics-design. Próximo paso: revisión y autorización separada para activación en prisma_dev.

## Iteración 8 — Migración 010 aplicada controladamente en prisma_dev

Autorización posterior de Hernán completada el 2026-10-22. MySQL 8.4.11, host local, DATABASE prisma_dev, permisos verificados, 001–009 registradas y ninguna estructura parcial de 010. Archivo idéntico al validado en prisma_test. Backend y watcher pausados; sin otras sesiones de prisma_dev durante preflight/respaldo, con bloqueo cooperativo de escrituras durante DDL. Respaldo completo verificado fuera del repositorio; 010 aplicada y registrada mediante runner del proyecto.

Postflight: tabla/campos/FK/índices/CHECK correctos; 21 tablas originales de negocio con hashes idénticos. Publicidad ID 3 $50.000, Insumos ID 4 $40.000, diciembre 2026 total $90.000 intacto. Smoke HTTP autenticado de lectura: categorías, recurrentes, catálogo y Estadísticas responden 200; sesiones del smoke solo en memoria, sin cambios de admin_sessions. Catálogo vacío, sin configurar PRISMA ni crear movimientos. Backend restablecido en 3001 para UI localhost:5173. [Respaldo, SHA256, recuperación y evidencia](iterations/2026-10-recurring-expenses-implementation.md#aplicación-controlada-posterior-en-prisma_dev).

No se modificaron prisma_test, prisma_demo ni producción en esta operación. Producción sigue en 001–009. Sin cambios de código, suites destructivas, commits, push, merge ni deploy. Próximo paso: revisión del propietario y autorización expresa para configurar los ocho conceptos, separada de la aplicación productiva.
