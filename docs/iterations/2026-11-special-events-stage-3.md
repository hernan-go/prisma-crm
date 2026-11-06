# Iteración 10.2 — Eventos Especiales: cierre productivo (06/11/2026)

## Resultado final verificado

**Implementado y versionado:** CRM `hernan-go/prisma-crm` `92d97edea2a333782d469c8ff35fee995b5be29a` y MCP privado `hernan-go/prisma-mcp` `4350bcbf1ae1e5e99fc6bc5ad17c0d1850b8608f`; este último agrega `consultar_eventos_especiales` conservando las cuatro herramientas preexistentes.

**Probado:** las 184 integraciones MySQL pendientes (26 + 158) resultaron aprobadas; otras verificaciones CRM/MCP, lint, typecheck y builds fueron realizadas antes del cierre, según registros de QA. No repetir la batería por una incidencia documental o del catálogo de ChatGPT. El resultado de QA no equivale a escritura productiva.

**Desplegado CRM:** SiteGround completó publicación de `92d97ed` el 06/11/2026; revisión visual satisfactoria de módulos principales. MySQL productiva con `014.sql`, `015.sql` y `016.sql` aplicadas, verificadas y registradas (16 migraciones). Backup previo con hash validado y restauración comprobada en BD local aislada (ubicación y nombre conservados fuera del repositorio público); **no es respaldo posmigración ni rollback automático**.

**Desplegado MCP:** Site privado existente «PRISMA — Análisis de Gestión», versión 6, despliegue `succeeded` (IDs operativos en el repositorio privado del MCP). Conservados acceso exclusivo del propietario y secretos existentes; Work reportó una compilación y sin cambios de dependencias bloqueadas. Recurso recuperable: versión 5 anterior (identificador en documentación privada del MCP; recuperación identificada, no ensayada).

**Validado funcionalmente en ChatGPT:** tras publicar el Site, la sesión todavía exponía cuatro herramientas. En **Configuración → Complementos → PRISMA — Análisis de Gestión → Actualizar herramientas**, se actualizó el catálogo. Una nueva conversación encontró y ejecutó `consultar_eventos_especiales` para `2026-11`; respuesta real válida: período abierto, 0 eventos, cobros, reintegros, gastos y resultado comercial `$0,00`. Lecturas de estadísticas (35 personas, 58 inscripciones en noviembre) y Know-How (6 documentos activos) satisfactorias según Work. Las herramientas de propuestas siguieron disponibles sin enviar escrituras.

**Incidencia secundaria resuelta:** `tests/remaining-skeletons.test.ts` mostraba ` M` sin diff. El blob del índice y el hash local eran `369d2e954255286d51ae6c7d73c6932b3e435276`. `ls-files --debug` registraba 9548 bytes y el archivo físico 9326; `core.autocrlf=true` generaba avisos LF→CRLF. La actualización puntual del índice con `-c core.autocrlf=false update-index -- tests/remaining-skeletons.test.ts` corrigió a 9326 bytes, dejó `git status --short` vacío y el diff staged vacío; no hubo cambios de contenido, commit ni ejecución adicional de pruebas. **No se determinó con certeza el mecanismo originario** de la discrepancia.

### Límites y acciones futuras

- **No comprobado:** escritura real de Eventos en producción, rollback ejecutado del Site, auditoría integral de seguridad, ni pruebas de recuperación posteriores al despliegue de 10.2. No convertir estos límites en «fallas» ni en pruebas supuestamente realizadas.
- **No pendiente de la implementación 10.2:** repetir migraciones 014–016, 184 integraciones, builds ya concluidos o volver a publicar versión 6. Cualquier incidente nuevo debe evaluarse por su evidencia y alcance.
- **Documentación:** cierre histórico a integrar de manera controlada; los documentos de estado, workflow y roadmap incluyen el procedimiento preventivo.

**Nota de lectura:** el texto que sigue es el informe de **cierre técnico local previo a commits y producción**. Sus frases «NO DESPLEGADO», «184 pendientes» y sus SHA anteriores describen aquel corte histórico y **están sustituidas para el estado actual** por el cierre productivo precedente.

---

# Iteración 10.2 — Eventos Especiales: cierre técnico local

Actualización 06/11/2026. CRM: `codex/iteration-10-2-events-stage-1`, HEAD `244f80c423ae99e51db069092e4828961fcd38e3`. MCP: `codex/iteration-10-2-events`, HEAD `cd2816b9e5f616162e08f58ee80bd3c3751bd0c9`. Implementación acumulada sin commits. **NO DESPLEGADO**. Este documento sustituye las instrucciones preliminares de las etapas 1–3; distingue evidencia actual, histórica y aceptación pendiente.

## IMPLEMENTADO

### Operación conservada

Personas compartidas, precio general sugerido para altas, precio individual independiente y gratuito permitido. Sin cupos operativos, asistencia, circuito visible de reintegros ni cierre obligatorio. Reincorporar conserva ID, precio y condiciones, sin restaurar pagos excluidos. Se mantienen Decimal, transacciones, bloqueo cooperativo, revisiones y recibos UUID.

Cobros: alta, consulta, edición por el mismo ID y anulación lógica; historial con valores anteriores. La baja de inscripción excluye cobros del receptor/medio originales. Su confirmación administrativa implica devolución externa a cargo de PRISMA; no acredita que haya sucedido ni genera un reintegro real registrado. Una ausencia sin baja no altera ingresos. Los reintegros legacy se deducen de cobros originales en orden estable por ID, sin atribuirlos a la cartera que devolvió. Corregir ese legado materializa deducciones y conserva los valores previos en historial.

Evento vacío sin antecedentes: eliminación definitiva con recibo mínimo para reintentos. Con actividad: cancelación lógica y antecedente técnico; fuera de cifras comerciales/listado operativo, consultable por MCP sin fichas personales ni movimientos individuales. Numeración correlativa por período, sin reutilización después de cancelar, eliminar o reprogramar.

Reprogramar conserva identidad, participantes, precios y fechas efectivas de cobros; reimputa ingresos y obtiene siguiente número del destino. Los gastos mantienen período contable, fecha e importe aunque sigan asociados. Cancelar desvincula y reclasifica gastos reales según su fecha, reutilizando categoría adicional del mismo nombre. No crea períodos ni categorías; destinos ausentes bloquean toda la operación. Períodos cerrados afectados requieren autorización explícita por ID; bloqueo, reapertura temporal, traslado y restauración del cierre ocurren en una transacción. Error o conflicto revierte todo.

Dashboard: total consolidado, cuatro KPI de Talleres, Carteras y Saldos independientes; bloque rosa con un evento seleccionado sin alterar el total. Ficha con tres indicadores antes de información general, participantes y cobros. Gastos conserva recurrentes/adicionales y sus acciones, con enlace al evento. Estadísticas conserva inscripciones por actividad.

### Cinco correcciones de auditoría

| Hallazgo                                          | Causa y corrección                                                                                                                                                                                                                   | Evidencia actual                                                                                                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Activación 015/016 incoherente                    | Detecciones independientes habilitaban estadísticas prematuramente. `server/event-schema.ts` centraliza 014+015+016; economía, gastos, eventos, Dashboard, estadísticas y guard de períodos lo usan. Contextos IA consumen esa capa. | Seis casos unitarios y cuatro casos MySQL por etapas; incompatibilidad explícita 503.                                                               |
| Cobros/reintegros distintos por evento y agregado | El evento publicaba cobros neteados y reintegros cero. Ambos publican ahora movimientos elegibles antes del neteo. `recorded` distingue registros conservados/excluidos sin inventar devoluciones.                                   | 24 integraciones; valores independientes con centavos, reintegro legacy, múltiples eventos y respuesta HTTP real validada por transporte MCP/Zod 3. |
| Fecha inicial de Gastos vacía                     | Se había retirado el valor inicial. `initialExpenseDate` restaura hoy argentino si corresponde al mes seleccionado, o día 01 de otro mes. `expense?.date` mantiene precedencia en edición. Mismo formulario general/asociado.        | Dos casos deterministas de períodos históricos/cambio de mes/medianoche argentina. Precedencia de fecha existente inspeccionada en el formulario.   |
| Skeleton con tres KPI                             | Estructura anterior al Dashboard actual. Cuatro tarjetas y clase responsive existente `dashboard-stats`.                                                                                                                             | Render estático verifica cuatro tarjetas; regresión focalizada aprobada. Sin nueva comparación visual en navegador.                                 |
| Documentación desactualizada                      | Se mezclaban hitos y pasos manuales antiguos. Consolidación aquí y alineación de PROJECT_STATE, DECISIONS y ARCHITECTURE.                                                                                                            | Revisión documental; no prueba de ejecución.                                                                                                        |

También se incorporaron invariantes de reconciliación en ejecución: discrepancias entre filas, ingresos y Carteras bloquean la respuesta económica. Activación común extendida al Dashboard y guard de períodos para evitar consultas a columnas 016 en esquemas intermedios. Correcciones del mismo defecto, sin nueva política comercial.

## Contrato económico CRM–MCP

Contrato propio de Eventos `1.0`; contrato estadístico general `2.0` y herramientas de conocimiento/propuestas conservados. CRM usa Zod 4 y MCP Zod 3. `recorded` es opcional en ambos validadores por compatibilidad con respuestas anteriores; el CRM nuevo lo emite. Worker no publicado.

| Magnitud                                             | Definición                                                                                                                                                                                                                                    |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `collections` / `income.event_collections`           | Importes actuales de cobros no anulados de participantes activos/eventos no cancelados, imputados al período actual del evento. Por evento y agregado significan lo mismo, antes del neteo.                                                   |
| `refunds` / `income.event_refunds`                   | Reintegros efectivamente registrados en filas legacy elegibles bajo los mismos filtros. No devoluciones externas inferidas de una baja.                                                                                                       |
| `effective_net`, `commercial.gross`, `income.events` | Cobros elegibles menos reintegros elegibles; el último suma los eventos. Dashboard y Estadísticas usan este ingreso reconocido; gastos no lo reducen.                                                                                         |
| `commercial.due`                                     | Suma de precios individuales de participantes activos.                                                                                                                                                                                        |
| `commercial.pending`                                 | Suma de pendientes individuales limitados a cero ante sobrepago. `commercial.balance = due - gross` es saldo global y puede ser negativo; no son intercambiables.                                                                             |
| Carteras                                             | Neto comercial atribuido al receptor/medio originales del cobro. Legacy descuenta cobros en orden estable, no la cartera de devolución. Talleres/eventos separados. No caja física ni saldo bancario.                                         |
| `recorded.collections/refunds`                       | Importes **actualmente almacenados** de todas las filas conservadas, incluidas anuladas. No reconstruye versiones anteriores a edición/normalización ni certifica caja histórica. Originales en auditoría.                                    |
| `recorded.voided_*`                                  | Subtotales anulados; `administratively_excluded_*` identifica el subconjunto anulado por baja administrativa, incluido en `voided_*`: no sumarlo otra vez.                                                                                    |
| `recorded.excluded_valid_net`                        | Neto de filas no anuladas excluidas por cancelación/participación retirada; no un reintegro.                                                                                                                                                  |
| Gastos / resultado directo                           | Gastos vinculados forman parte de Gastos Período; no sumar dos veces. Tras reprogramar pueden conservar otro mes contable. Resultado directo = ingreso reconocido menos gastos asociados registrados, no beneficio neto ni evidencia de pago. |

Invariantes: suma por evento de cobros/reintegros = homónimos de `income`; diferencia = neto por evento/período; talleres + eventos = total; Carteras comerciales = total. Ejemplo probado: cobro 100,20 y reintegro registrado 20,10 producen cobros 100,20, reintegros 20,10 y neto 80,10 en API/MCP. Baja administrativa: reconocidos cero, excluidos conservados y ninguna nueva fila de reintegro.

Lectura IA mediante snapshot consistente READ ONLY y autenticación existente. No se exportan identidades/IDs de participantes, teléfonos, condiciones personales ni movimientos individuales. Pruebas de credenciales, período, límites, redirecciones, errores saneados y respuesta excesiva. API→MCP se probó pasando el cuerpo HTTP real local al transporte mediante fetch inyectado; no se afirma conexión remota al Worker productivo.

## Migraciones: política y resultados actuales

| Esquema                                 | Comprobación en QA                                                                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 001–013                                 | Aplicación inicia; Dashboard/estadísticas anteriores 200, Eventos 503 sin consultar tablas inexistentes.                           |
| 014                                     | Rutas dependientes rechazan esquema incompleto con 503; no cifras parciales presentadas como válidas.                              |
| 014+015                                 | Mismo rechazo; estadísticas no se habilitan antes de 016.                                                                          |
| 014+015+016                             | Economía/rutas disponibles y replay registrado sin duplicación.                                                                    |
| Estructuras sin registro 014, 015 o 016 | Migrador rechaza aplicación parcial; conteos conservados, registro restaurado por la prueba solo en QA. Sin reparación automática. |

El gate verifica registros, no audita DDL en cada petición. Publicación debe comprobar estructuras/índices/registros. Un esquema manipulado manualmente requiere inspección. El backend no aborta íntegramente el arranque intermedio: bloquea rutas dependientes. DDL MySQL no es transaccional. No se provocó corte real de conexión durante DDL; la prueba parcial reproduce estructuras sin registro, no toda interrupción posible.

014 crea tres tablas operativas; 015 integra gastos; 016 agrega numeración, ubicación, contador y recibos JSON, sin nuevas tablas/períodos. Backfill por ID y reservas bajo bloqueo; períodos con numeración histórica protegidos. **014, 015 y 016 sin modificaciones**. SHA-256:

- 014: `392bb2e009d3b3d3a7cbd56a51912bceff9aa3c1661e942dbcfb77f7d3222dc3`
- 015: `51ae965a0e425032686489e36f930677b4a984577b62e37bb60367114b7873d8`
- 016: `779ad33e00cf4a04362825c2846e38749df75469674d191d42be4a195852ebc6`

Código anterior CRM `244f80c` extraído con Git archive sin cambiar rama: sobre QA 016, sesión real y cuatro rutas (Dashboard, estadísticas, categorías y Personas) respondieron 200. Alcance: esquema sin datos operativos más un período sintético; no certifica toda convivencia con eventos poblados. Publicación futura: respaldo/verificación del propietario, aplicar/verificar 014–016 completas antes de código nuevo y detenerse ante parcial; no alterar SQL aplicado. Procedimiento no ejecutado en producción.

## PROBADO AUTOMÁTICAMENTE — esta intervención

| Suite / verificación                 | Ejecutadas | Aprobadas | Fallidas | Omitidas | Entorno / resultado                                          |
| ------------------------------------ | ---------: | --------: | -------: | -------: | ------------------------------------------------------------ |
| CRM completa, flags DB apagados      |        509 |       509 |        0 |      212 | Vitest Windows local; aprobada                               |
| Financiera e integridad Eventos      |         24 |        24 |        0 |        0 | MySQL QA; aprobada                                           |
| Migraciones por etapas               |          4 |         4 |        0 |        0 | QA inicialmente vacío; aprobada una vez antes de financieras |
| Frontend / dominio / API focalizados |         54 |        54 |        0 |        0 | Subconjunto de las 509; no sumar                             |
| MCP completa                         |         44 |        44 |        0 |        0 | Node local sintético; aprobada                               |
| Código CRM anterior / esquema 016    |    4 rutas |         4 |        0 |        0 | Script QA; limitación indicada arriba                        |
| CRM typecheck / ESLint / build       |          — |         — |        0 |        — | Aprobados; avisos de anotaciones Zod/Rollup                  |
| Site MCP ESLint / build              |          — |         — |        0 |        — | Aprobados; aviso vinext de clasificación de ruta `/`         |
| Git diff check ambos repositorios    |          — |         — |        0 |        — | Aprobados; advertencias de normalización LF/CRLF             |

Nuevas pruebas: nueve unitarias (seis esquema, dos fecha, una Skeleton), una de límite de respuesta IA, cuatro de migraciones y dos financieras (API real→MCP, rollback monetario/reintento concurrente). Fortalecida otra integración con expectativas independientes. No se eliminaron pruebas.

212 omisiones normales: 24 financieras + cuatro migraciones ejecutadas aparte en QA; 184 integraciones generales preexistentes omitidas porque exigen prisma_test y varias preparan/resetearían datos. No se habilitaron ni debilitaron sus guardas: el propietario prohibió escribir allí. No cuentan como aprobadas. Estadísticas/contexto anteriores usan mocks de esquema 013 en unitarias; cuatro migraciones y 24 financieras ejercitan MySQL/rutas reales.

Cobertura real: Personas existentes sin teléfono/duplicados, precios cero/individuales/cambios, baja/reincorporación sin restaurar cobros; pagos múltiples/parciales, centavos, edición/anulación, receptores/medios, fecha efectiva distinta del período; UUID repetido, concurrencia, conflicto y respuesta perdida. Eventos vacíos/gratuitos/múltiples, correlativos/no reutilización, reprogramación conservando datos, cancelación/exclusión. Gastos asociados, conservación contable, reclasificación, períodos cerrados/reapertura/restauración, destinos ausentes y rollback tras escribir. Talleres independientes y reconciliación Dashboard/estadísticas/contexto/MCP. Fallo deliberado tras insertar dinero revierte fila/revisión/historial; reintento simultáneo con misma clave deja un cobro.

Sin nuevas dependencias de aplicación ni cambios de manifiestos/lockfiles. Site MCP tenía dependencias locales incompletas: preparación de las ya declaradas con `pnpm install --frozen-lockfile --ignore-scripts`, sin configurar Worker/publicación. Permitió ejecutar lint/build antes pendientes.

## Seguridad y estado final del QA

El propietario creó vacío **prisma_qa_events_102_20261106** y otorgó permisos a `prisma_local@127.0.0.1`. Antes de escribir: conexión efectiva, cuenta, puerto, permisos y cero tablas verificados. Solo instancia local `127.0.0.1:3306`, MySQL 8.4.11; nunca root. Tests comprueban DB_NAME/conexión real antes de migrar/preparar fixtures; configuración ausente/distinta bloquea ejecución sin fallback de escritura. Autorización puntual del propietario sustituye para estas pruebas la regla general prisma_test, sin habilitar otras bases.

001–016 ejecutadas en QA; fixtures sintéticas eliminadas por ID, comparando contenido de once tablas de negocio antes/después. Sin reset, seed ni eliminación de esquemas. Postflight de lectura: 16 registros de migraciones, cero filas en Personas, períodos, membresías, inscripciones, cuentas, pagos, categorías/gastos y tres tablas de Eventos. Esquema conservado con DDL y datos técnicos. No escrituras en prisma_dev, prisma_demo, prisma_test ni producción; preflight inicial de permisos de prisma_test fue de solo lectura.

## COMPROBADO MANUALMENTE — histórico, no repetido aquí

QA interactiva sintética del 05/11 sin DB: escritorio/tablet/móvil, selector sin cambiar total, bloque oculto sin eventos, edición sintética de cobro, modal de reapertura, contraste y ausencia de overflow. Ajustes posteriores: cuatro KPI/paneles separados, selector de día, ficha con indicadores antes de datos generales, búsqueda/selección previa a Guardar, persona activa deshabilitada y precio cero. Las alturas medidas antiguamente eran observaciones de fixtures, no especificaciones vigentes.

Antecedentes automáticos: 499 normales, 22 financieras en prisma_test y 44 MCP. No se usan como resultados actuales. Evidencia de esta intervención: tabla anterior. No nueva QA interactiva de navegador; Skeleton comprobado por render estático.

## PENDIENTE

- Aceptación del propietario de reprogramación, autorización/restauración de períodos cerrados y consulta MCP local. Automatización no sustituye aceptación funcional.
- Revisión visual en dispositivos reales: más de siete Personas, ficha vacía/con varios participantes, reincorporación y teclado virtual móvil; comparación con referencia productiva si se aporta.
- Compactación general de espacios: diferida expresamente. Incidencia histórica de recurrentes de abril 2098: fuera de alcance.
- 184 integraciones generales DB omitidas; ensayo sobre copia representativa productiva, respaldo/restauración y comprobaciones productivas en proceso posterior autorizado.

No iniciar run-dev/run-demo ni crear períodos masivamente para esta aceptación. Cualquier revisión con escritura debe fijar/verificar explícitamente QA y usar fixtures propias sin colisiones. Las pruebas de migraciones exigen esquema **inicialmente vacío**: no repetir reseteando este QA. No se dan instrucciones para escribir en prisma_test u otras bases existentes.

## NO DESPLEGADO — recomendación

**APTO CON OBSERVACIONES para organizar commits locales** tras revisión del propietario; sin bloqueante técnico reproducido pendiente en los cinco hallazgos. No es autorización productiva ni cobertura de las 184 integraciones omitidas.

Conservar trabajo y respaldos. Organización sugerida: modelo/migraciones/comandos y pruebas; integración gastos/períodos/economía/estadísticas/IA y contratos; frontend/regresiones; documentación. Mantener contratos y consumidores coordinados o explicitar dependencias entre commits. MCP separado: contrato/transporte/herramienta y pruebas coordinados con CRM. Revisar nuevos archivos; no incluir dist, node_modules, tmp ni secretos. No git add, commits, push, merge ni despliegues; ramas y HEAD conservados.


## Inventario Git para revisión del propietario

Estado acumulado: 61 rutas en CRM (35 marcadas modificadas y 26 nuevas). `tests/remaining-skeletons.test.ts` aparece en status pero sin diff de contenido respecto de HEAD; no se fuerza normalización de finales de línea. Los respaldos externos anteriores no fueron modificados. Tres archivos nuevos de esta corrección: `server/event-schema.ts`, `tests/event-schema.test.ts`, `tests/event-migrations-db.test.ts`; los restantes nuevos pertenecían a la implementación acumulada.

CRM, archivos seguidos marcados modificados:

- `client/App.tsx`
- `client/Dashboard.tsx`
- `client/DashboardSkeleton.tsx`
- `client/Expenses.tsx`
- `client/Management.tsx`
- `client/People.tsx`
- `client/Statistics.tsx`
- `client/components.tsx`
- `client/dashboard.css`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/PROJECT_STATE.md`
- `server/configuration-deletion.ts`
- `server/expenses.ts`
- `server/forms-import.ts`
- `server/forms-receipt-legacy.ts`
- `server/importer.ts`
- `server/integrations/ai-context.ts`
- `server/integrations/ai-router.ts`
- `server/migrate.ts`
- `server/recurring-expenses.ts`
- `server/repositories.ts`
- `server/routes.ts`
- `server/scheduling.ts`
- `server/statistics/index.ts`
- `shared/domain.ts`
- `shared/expenses.ts`
- `shared/forms.ts`
- `shared/statistics.ts`
- `tests/ai-context.test.ts`
- `tests/dashboard.test.ts`
- `tests/domain.test.ts`
- `tests/model-fixtures.ts`
- `tests/remaining-skeletons.test.ts`
- `tests/statistics.test.ts`

CRM, archivos nuevos sin seguimiento:

- `client/SpecialEvents.tsx`
- `client/event-requests.ts`
- `client/special-events.css`
- `docs/iterations/2026-11-special-events-stage-1.md`
- `docs/iterations/2026-11-special-events-stage-2.md`
- `docs/iterations/2026-11-special-events-stage-3.md`
- `server/event-economy.ts`
- `server/event-expenses.ts`
- `server/event-period-guard.ts`
- `server/event-schema.ts`
- `server/integrations/ai-events.ts`
- `server/migrations/014.sql`
- `server/migrations/015.sql`
- `server/migrations/016.sql`
- `server/special-events.ts`
- `shared/event-economy.ts`
- `shared/special-events.ts`
- `tests/ai-events.test.ts`
- `tests/browser/special-events.html`
- `tests/browser/special-events.tsx`
- `tests/event-migrations-db.test.ts`
- `tests/event-requests.test.ts`
- `tests/event-schema.test.ts`
- `tests/special-events-db.test.ts`
- `tests/special-events-ui.test.ts`
- `tests/special-events.test.ts`

MCP, tres archivos seguidos modificados y tres nuevos (mismo inventario acumulado de seis):

- `prisma-site/lib/mcp.mjs` (modificado).
- `prisma-site/test/mcp.test.mjs` (modificado).
- `prisma-site/test/proposals.test.mjs` (modificado).
- `prisma-site/lib/events-contract.mjs` (nuevo; contrato ajustado en esta corrección).
- `prisma-site/lib/events-transport.mjs` (nuevo).
- `prisma-site/test/events.test.mjs` (nuevo).

Los cambios acumulados en Personas/importadores/formularios/contratos compartidos permiten Personas sin teléfono sin duplicados por vacío; los guards de gastos recurrentes, configuración y períodos preservan integridad de asociaciones y cierres. Se vinculan funcionalmente a la iteración; esta corrección no añade refactors de módulos ajenos. `tmp`, artefactos de build y dependencias locales permanecen ignorados. HEAD y ramas indicados arriba no cambiaron.
