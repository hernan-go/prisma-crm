# PRISMA CRM — Estado actual

## Iteración 12.2.B2 — vinculación supervisada local

Revisión focalizada posterior: corregida reserva tardía del límite de dos canjes (carrera antes de await); regresión con consultas bloqueadas y cobertura adicional de evidencia cruzada/duplicidad tardía al aprobar. Sin cambios de esquema ni autenticación heredada; tres regresiones de seguridad y nueve pruebas de compatibilidad aprobadas, 14 casos DB no seleccionados por filtro. Typecheck/lint/build/diff-check aprobados. Dictamen de revisión: APTO CON OBSERVACIONES para consolidación técnica posterior. No equivale a aceptación Google real ni a autorización de commit.

Implementación local sobre `adf27d4`, sin staging/commit/publicación: candidatura y consumo OIDC transaccionales, CLI privilegiada con huella, bootstrap de dos UUID, rutas/formulario B2, CSRF/cookies/límites y mantenimiento sin purga institucional. Sin login administrativo Google ni cambios al login compartido. Sin migraciones nuevas; 017–019 intactas. 95 pruebas focalizadas aprobadas, cero fallidas/omitidas en corridas finales; suites MySQL secuenciales solo en prisma_test. Typecheck/lint/build/diff-check aprobados; QA visual sintética y proxy local verificados. Aceptación Google real de los titulares y verificación operativa SiteGround pendientes. [Procedimiento, contratos y evidencia](iterations/2026-11-supervised-google-binding.md).

## Iteración 12.2.B1 — núcleo Google OIDC local

Revisión técnica final local del 08/11: **APTO CON OBSERVACIONES**, consolidada posteriormente en `adf27d4`, sin publicación. Sin bloqueantes B1 demostrados ni cambios de código en la revisión. Las 18 entradas de npm audit son versiones preexistentes a B1; ninguna de las tres dependencias nuevas OIDC figura en el informe. Seguimiento separado prioritario de body-parser antes de publicación (JSON comprimido previo a auth; diagnóstico aislado 500 controlado, sin crash reproducido). B2 requiere adaptar la composición de submitCandidate para compartir transacción con el consumo y conectar mantenimiento. No se repitieron las 76 pruebas ni se escribieron DB; [clasificación completa y evidencia](iterations/2026-11-google-oidc-core.md#revisión-técnica-final--08112026).

Núcleo interno consolidado en `adf27d4` sobre `7dd8234`, sin publicación: openid-client 6.8.9, PKCE S256/state/nonce, firma JWS RS256 explícita, cifrado AES-GCM y evidencia persistente de un solo uso. 019 aplicada exclusivamente en prisma_test; 017/018 intactas. Sin rutas, UI, Google Login funcional ni cambios al login heredado. Consumo en transacción del futuro llamador, sin conectar B2. [Implementación, pruebas y límites](iterations/2026-11-google-oidc-core.md). Validación focalizada: 76 aprobadas, cero fallidas/omitidas en corridas finales, con suites DB secuenciales. Typecheck/lint/build/diff-check aprobados; CI remoto, Google real y ensayo MySQL vacío pendientes.

## Iteración 12.2.A — operaciones internas locales

Consolidada en `7dd8234` sobre `6641189`, sin publicación: vinculación y reemplazo supervisados, candidaturas de 15 minutos, cierre persistente del bootstrap y protección transaccional del último administrador. 018 aditiva aplicada solo en prisma_test; 017 intacta. Corregido consumo atómico con vencimiento por reloj MySQL; vinculaciones separadas obligatoriamente de la fase paralela en CI. Siete integraciones de vinculaciones y 16 previas aprobadas secuencialmente; general 593 aprobadas, cero fallidas, 225 omitidas; typecheck/lint/build y diff-check aprobados. Workflow nuevo comprobado estructuralmente, no ejecutado en GitHub Actions. Adaptadores reales de autorización, prueba Google y canal privilegiado de SiteGround pendientes; login heredado intacto. Ensayo MySQL vacío sigue pendiente. [Diseño, evidencia y límites](iterations/2026-11-identity-binding-operations.md).

## Corrección independiente — Dashboard domingo local (08/11/2026)

Consolidada en `6641189`: domingo=0 se selecciona correctamente, selector de siete días y vacío del día actual explícito. Tests con reloj determinista y fixture visual sintético. Validación conjunta final ya realizada: 593 aprobadas, cero fallidas, 218 omitidas; 34 focalizadas aprobadas; typecheck/lint/build y diff-check aprobados. Selección manual lunes → domingo y vacío comprobados en navegador; validación visual completa de tablet/escritorio pendiente por escalado de la herramienta, no declarada realizada. Sin publicación. [Detalle y límites](iterations/2026-11-dashboard-sunday.md). Identidad está registrada separadamente en `2b0ddb8`.

## Iteración 12 — Etapa 1 local (08/11/2026)

Fundamentos internos de identidad, roles y sesiones individuales consolidados en `2b0ddb8` en `codex/iteration-12-identity-foundations`, base `1d0d402`, sin publicación. 017 aditiva aplicada y probada exclusivamente en prisma_test; cinco tablas nuevas, login heredado intacto y ninguna ruta nueva. La suite prepara explícitamente 001–016 mediante el runner, sin depender de otras suites ni reinicializar datos. Typecheck/lint/build y diff-check aprobados; 16 pruebas focalizadas de identidad y compatibilidad aprobadas. Arranque desde MySQL completamente vacío pendiente por falta de destino limpio autorizado; no se presenta como probado. APTO CON OBSERVACIONES. Google Login, vinculación inicial, recuperación y transición pendientes de Etapa 2; PWA corresponde a 13. [Alcance, evidencia y límites](iterations/2026-11-identity-foundations.md).

## Iteración 11 — Estadísticas v2 mensual y anual: publicada en producción (07/11/2026)

Estadísticas v2 mensual y anual completada, con diseño definitivo y paleta sobria aprobados por el propietario. Resumen mensual con seis KPI, cuatro paneles principales y Eventos Especiales; evolución anual de obligaciones/cobros, participantes únicos, continuidad e incorporaciones/reincorporaciones. Endpoint autenticado y de solo lectura `GET /api/statistics/annual?year=AAAA`. Sin migraciones nuevas, modificaciones de esquema ni cambios de MCP.

Commits integrados mediante fast-forward a `main` y publicados mediante push del propietario:

- `e3a3bb292412a9918009c8d85734463ed4d1baf5` — `docs(workflow): document frontend visual testing procedure`.
- `77c451983167bdc008098654a9b4b8fad55ff1a0` — `feat(statistics): complete monthly redesign and annual trends`.

Validación local registrada: typecheck, lint y build aprobados; 582 pruebas aprobadas y 213 omitidas, que no equivalen a pruebas aprobadas. Integración focalizada de lectura en `prisma_test` aprobada. Auditoría final de economía, clasificación histórica y Eventos: **APTO**, según informe de Codex. QA visual sintética realizada en escritorio, tablet y móvil. No se repitieron pruebas ni auditorías técnicas en este cierre documental.

GitHub Actions: workflow `Validate PRISMA CRM` del commit `77c4519`, ejecución [42353884056](https://github.com/hernan-go/prisma-crm/actions/runs/42353884056), resultado `success`, según la información aportada por el propietario; sin consulta independiente de Codex en este cierre.

El propietario confirmó en el panel de SiteGround el despliegue Node.js de `77c4519` con estado **COMPLETADO**. También confirmó mediante capturas una **aceptación visual productiva satisfactoria del propietario**: resumen mensual de noviembre de 2026 con seis KPI, Cobranzas, Inscripciones, Gastos, Honorarios y Eventos; vista anual 2026 con los cuatro gráficos, información histórica real y tratamiento explícito de meses sin datos. Estas evidencias no acreditan pruebas productivas de escritura, auditoría exhaustiva de seguridad, recuperación ni verificaciones de otros módulos en este cierre.

Límites deliberados: meses inexistentes no representan cero; las clasificaciones dependen del historial disponible; los períodos abiertos pueden cambiar y la evolución histórica no representa snapshots contables congelados al cierre. Flujo de caja, utilidad neta e histórico del IPC no forman parte de esta iteración. No son fallas ni pendientes que reabran el desarrollo.

Trazabilidad técnica y antecedentes: [Iteración 11](iterations/2026-11-statistics-monthly-v2.md). Sus menciones a commit, integración o despliegue pendientes describen el corte local anterior y quedan superadas por este cierre productivo. Se conservan debajo el antecedente 11.1 y el cierre técnico de 10.2.

## Aceptación del asesor consultivo P0 — 06/11/2026

Según confirmación del propietario en la consolidación del 07/11, la issue #2 fue cerrada por aceptación funcional del asesor empresarial en su alcance consultivo. MCP privado versión 6, Know-How real/propuestas y consulta de Eventos operativos. No implica rentabilidad certificada, atribución financiera por actividad ni simulaciones deterministas automáticas, que no están implementadas; sin escritura económica autónoma. [Contrato y límites](AI_COMMERCIAL_PLANNING.md). Las referencias posteriores a P0 todavía pendiente corresponden a cortes históricos anteriores.

## Antecedente histórico — Iteración 11.1: rediseño mensual local (07/11/2026)

Implementación en `codex/iteration-11-1-statistics-monthly` sobre `3077d19`: seis KPI prioritarios, cuatro paneles mensuales y Eventos con detalle individual del contrato existente. Paneles visibles en escritorio/tablet y desplegables accesibles en móvil; paleta sobria limitada a Estadísticas. Sin cambios económicos, DB, migraciones ni MCP; sin commits ni publicación. Revisión visual pendiente por bloqueo de las herramientas de navegador. Alcance, decisiones sustituidas, QA y límites: [Iteración 11.1](iterations/2026-11-statistics-monthly-v2.md).

## Estado vigente — Iteración 10.2 cerrada técnicamente (06/11/2026)

**Fuente de verdad para 10.2.** Commit funcional de CRM desplegado: `92d97edea2a333782d469c8ff35fee995b5be29a` (`92d97ed`; `main` y `origin/main` en el momento del corte). Commits documentales posteriores pueden avanzar `main` sin cambiar este commit funcional de referencia. Despliegue SiteGround `COMPLETADO` el 06/11/2026; inspección visual satisfactoria de Dashboard, Eventos, Estadísticas, Personas, Cobros, Pago Facilitadores, Gastos, Know-How y Configuración. La inspección visual **no equivale** a prueba productiva de escrituras de Eventos.

MySQL productiva: `014.sql`, `015.sql` y `016.sql` importadas y verificadas; 16 registros en `schema_migrations`. Respaldo anterior a las migraciones: hash verificado y restauración probada en una base local aislada; ubicación e identificación exacta conservadas fuera del repositorio público. No es una copia posterior a migración ni rollback automático.

QA: 184 integraciones MySQL previamente pendientes aprobadas (26 + 158); resto de pruebas, lint, typecheck y build según evidencia previa de la iteración. No reejecutar migraciones ni suites históricas sin cambio técnico que lo justifique.

MCP: `hernan-go/prisma-mcp` `main` `4350bcbf1ae1e5e99fc6bc5ad17c0d1850b8608f`. Site privado existente «PRISMA — Análisis de Gestión», **versión 6**, despliegue identificado y verificado como `succeeded` (identificadores operativos completos conservados en la documentación privada del MCP); cuatro herramientas anteriores conservadas y quinta `consultar_eventos_especiales` disponible tras usar **Actualizar herramientas** en la configuración del complemento de ChatGPT. Consulta real de Eventos de `2026-11` satisfactoria: cero eventos y montos cero; también se verificaron lecturas de estadísticas y Know-How. No se ejecutaron propuestas de escritura como prueba. Versión 5 recuperable según confirmación de Work, sin ensayo de rollback.

Incidente Git local `tests/remaining-skeletons.test.ts`: resuelto sin cambios de contenido, commit ni tests adicionales. El índice registraba tamaño 9548 y el archivo medía 9326 bytes; `git diff --exit-code` y hashes filtrado/sin filtros coincidían con HEAD. Tras `git -c core.autocrlf=false update-index -- tests/remaining-skeletons.test.ts`, `git status --short` quedó vacío, diff staged vacío y tamaño del índice corregido a 9326. No atribuir a una única causa la discrepancia de metadatos más allá de la evidencia observada.

**Alcance de cierre:** implementación, QA, migraciones productivas, despliegue CRM, despliegue MCP y lectura real de Eventos confirmados. No se comprobó una escritura real de Eventos en producción, una restauración del Site versión 5 ni una auditoría integral de seguridad. Esas limitaciones no se deben presentar como pruebas realizadas. Historial y evidencia ampliada: [cierre 10.2](iterations/2026-11-special-events-stage-3.md). Procedimiento preventivo: [workflow](WORKFLOW.md).

**Los apartados siguientes son antecedentes históricos anteriores a este cierre y no describen el estado vigente de 10.2.**

## Estado local — Iteración 10.2, corrección técnica previa a commits (06/11/2026)

Implementación local en `codex/iteration-10-2-events-stage-1`, base `244f80c`, sin commits. Conserva etapas anteriores: numeración persistente, tres indicadores de evento, Carteras separadas, bajas sin restaurar pagos, cancelación transaccional con reclasificación de gastos y reapertura temporal explícitamente autorizada. MCP local en `codex/iteration-10-2-events`, base `cd2816b`, sin publicación. Los cinco hallazgos de auditoría están corregidos: activación común 014+015+016 con rechazo explícito de estados intermedios, cobros/reintegros consistentes API–MCP y registros excluidos diferenciados, fecha inicial argentina de Gastos, Skeleton de cuatro KPI y documentación consolidada.

Validación actual: CRM 509 pruebas aprobadas, 212 omitidas; 24 financieras y cuatro de migraciones aprobadas separadamente en `prisma_qa_events_102_20261106`, creado vacío por el propietario y único destino de escritura autorizado para esta intervención. Las 184 integraciones generales restantes no se ejecutaron. MCP 44/44; typecheck/lint/build CRM y lint/build Site MCP aprobados. `014–016` inmutables, previamente aplicadas en prisma_test y ahora también en QA; no nuevas escrituras en prisma_test ni dev/demo/producción. QA conservado con 16 migraciones y sin fixtures de negocio. APTO CON OBSERVACIONES para preparar commits locales; aceptación manual y publicación pendientes.

Pruebas, límites y revisión manual: [Iteración 10.2](iterations/2026-11-special-events-stage-3.md). Pendiente aceptación manual del propietario y publicación separadamente autorizada. No se modificaron dev/demo/producción; el estado productivo siguiente sigue vigente.

## Estado vigente — Iteración 10.1 cerrada en producción (02/11/2026)

CRM publicado en ae3cea9eb81115f0edb5a665016fa1661e9e6b19; migraciones 001–013 aplicadas y registradas en producción según confirmación del propietario. Centro de Conocimiento real y propuestas operativos. Worker respaldado en c80fc8b61392bb3425cec187c0341e83ef80710b; Site privado versión 5, commit interno e57be72e758ad2ea2e8f0d1fa16aae2651b8d937. Lectura y propuestas usan credenciales independientes ya configuradas. La compilación oficial pendiente en Windows quedó completada en Work/Sites según informe aportado por el propietario.

Evidencia previa CRM: 662 pruebas aprobadas, lint/typecheck/build aprobados; Worker: 40/40 y typecheck/lint/build/artefacto aprobados en Work/Sites. Circuito real autorizado sobre documento sintético: propuesta pending → aprobación administrativa → approved, revisión 3 y versión 2; lectura posterior correcta. Documento luego desactivado, recibo conservado y lectura directa no disponible. No se modificaron los seis documentos empresariales reales. Detalles y límites: [cierre de Iteración 10.1](iterations/2026-11-knowledge-proposals.md#cierre-productivo--02112026).

prisma_dev tiene 013 aplicada y QA aprobada por el propietario; respaldo exportado sin prueba de restauración. prisma_demo no fue migrado ni revalidado: pendiente ambiental independiente. Siguen pendientes asistente comercial completo, Estadísticas, Google Login e informes/PDF según roadmap, sin cambio de prioridad.

Los apartados siguientes son antecedentes fechados: sus menciones a 012/013, conexión de conocimiento, compilación o publicación pendientes quedan superadas para esta entrega. Este cierre documental no repite consultas DB, pruebas ni despliegues y no constituye auditoría exhaustiva de seguridad o recuperación.

## Antecedentes conservados

## Extensión Know-How MCP — desarrollo local 30/10/2026

API privada `GET /api/integrations/ai/knowledge` implementada para listado paginado y documento activo vigente, con autenticación de servicio existente. Sin migraciones ni cambios administrativos/estadísticos. Publicación pendiente; el Worker se desarrolla y valida por separado. [Contrato, pruebas y publicación](iterations/2026-10-knowledge-mcp.md). El propietario confirmó 012/Know-How publicados y fallback SPA ba7fff7 validado en producción; las referencias anteriores a esos pendientes son históricas.

**Corte:** 2026-10-29

## Estado local aprobado — Know-How IA y Facilitadores (29/10/2026)

Know-How IA, Entrega 1 y sus cinco mejoras UX/UI integradas con la corrección de nombres de facilitadores en `0a164246ae3072d14fb7ab8dc56c21a585daf496`, rama `integration/iteration-9-knowledge-facilitators`, respaldada en GitHub y aprobada manualmente por el propietario en `prisma_dev`. No publicada en producción. Typecheck/lint/build aprobados; 448 pruebas normales, 606 generales MySQL, 9 documentales MySQL y 23 focalizadas aprobadas, en suites secuenciales e integración exclusivamente en `prisma_test`. Conflicto de fixtures resuelto conservando ambas funcionalidades y orden de FK.

`012.sql` aplicada y registrada en `prisma_dev`: 29 tablas, cuatro documentales nuevas y esquema/restricciones verificados; las 25 tablas originales conservaron esquema y registros. Respaldo previo verificado por integridad/cobertura, sin restaurabilidad demostrada. El mismatch inicial de CHECK fue textual: MySQL normaliza OCTET_LENGTH como LENGTH, ambas en bytes; postflight completo aprobado sin alterar la migración. La posterior QA del propietario creó datos ficticios y pilares explícitamente en desarrollo. [Evidencia y alcance de QA manual](iterations/2026-10-knowledge-library.md#cierre-local-integrado-y-qa-del-propietario--29102026).

Siguiente paso pendiente: preflight productivo de solo lectura y preparación de respaldo/procedimiento. `012.sql` sigue pendiente de producción, cuyo estado registrado continúa en `001–011`; no se realizó una nueva verificación productiva en este cierre. Know-How todavía no se conecta al asesor IA; MCP y autenticación intactos. Iteración 9 abierta, conservando sus demás pendientes. Sin autorización de migración productiva ni despliegue en este cierre.

## Prioridad estratégica P0 — planificación comercial con IA

**Hito funcional del 27/10/2026: conexión ChatGPT ↔ MCP privado ↔ API empresarial de lectura completada.** El propietario confirmó consulta real exitosa de octubre de 2026 desde Work y desde ChatGPT normal. Backend desplegado en SiteGround: `GET /api/integrations/ai/monthly-context?period=AAAA-MM`, contrato JSON 2.0, acceso autorizado sin escritura operativa ni API paga de modelos. Este hito no declara completado el asistente comercial P0.

- Sistema administrativo: [hernan-go/prisma-crm](https://github.com/hernan-go/prisma-crm), `main` publicado en `448554fb38e65ac753161c83616594ccec832eac`.
- Worker MCP: [hernan-go/prisma-mcp](https://github.com/hernan-go/prisma-mcp), repositorio privado, respaldo en `25487c43778370fce101e24f697b011ff7201219`, tag `v1.0.0`. [Site privado funcional](https://prisma-prueba-conexion-ficticia.astutewave257.chatgpt.site/). Las fuentes originales del ZIP fueron preservadas y 23 pruebas sintéticas aprobaron; no son validación productiva ni cotejo contable con Dashboard. No existe todavía un procedimiento independiente comprobado para redesplegar ese mismo Site desde Codex.

La planificación comercial con IA conserva PRIORIDAD P0 — MÁXIMA y la [especificación funcional aprobada](AI_COMMERCIAL_PLANNING.md). Quedan pendientes el asistente comercial completo, escenarios y simulaciones con datos/modelos suficientes, el Centro de Conocimiento empresarial real y el contexto externo verificable. `consultar_estadisticas_comerciales` consulta datos reales; `consultar_conocimiento_empresarial` conserva cinco documentos ficticios y no constituye conocimiento real de PRISMA. D020–D024 mantienen sus límites económicos y protección personal, sin supresión de agregados por tamaño. La IA asesora y los administradores deciden. La Iteración 9 continúa abierta.

Estado de producto: Estadísticas tiene 3 de 6 gráficos principales publicados (Gastos, Honorarios y Cobranzas), dos acordeones independientes y Skeleton Loaders exclusivamente en Estadísticas. Los demás gráficos, la extensión de Skeletons y Google Login siguen pendientes; su prioridad no cambia. Los documentos de [implementación](iterations/2026-10-ai-read-context.md) y [publicación controlada](iterations/2026-10-ai-controlled-deployment.md) se conservan como antecedentes, sin actualizarlos en esta regularización.

Antecedente de validación del 25/10: corrección D024 conciliada en 70 períodos existentes de prisma_test mediante SELECT en transacción READ ONLY, sin cambios de datos; varios horarios por inscripción y gastos recurrentes cubiertos solo con datos sintéticos. Typecheck/lint/build aprobados, 330 pruebas normales y 162 integraciones DB omitidas. Adaptación posterior siteground_managed: 427 pruebas normales aprobadas, 162 DB omitidas. La publicación y conexión pendientes de aquellas etapas quedaron superadas por el hito del 27/10 confirmado por el propietario. Esta actualización documental no repite pruebas ni consultas productivas y no acredita un cotejo contable MCP/Dashboard.

## Estado vigente — Skeleton Loaders en Estadísticas publicados

Publicados en `05686232fcf6786c9779fc6c74260ea0329bcc85`, con GitHub `main` verificado por Codex. El propietario confirmó build SiteGround `1792863714-2i7gpw`, Exit Code `0` y funcionamiento productivo satisfactorio: los Skeleton Loaders aparecen brevemente durante la carga real y desaparecen al llegar los datos. `react-loading-skeleton@3.5.0` incorporada con versión exacta; aplicación limitada a Estadísticas y componentes compartidos preparados para reutilización. Los datos disponibles, períodos vacíos y errores conservan sus estados propios; una actualización del mismo período mantiene los datos válidos. El build y el funcionamiento productivo son confirmaciones del propietario, sin auditoría exhaustiva de accesibilidad ni prueba con lector de pantalla real. [Cierre de Skeleton Loaders](iterations/2026-10-statistics-design.md#cierre-productivo-de-skeleton-loaders-en-estadísticas--2026-10-24). La Iteración 9 continúa abierta.

## Antecedente — Segunda entrega de Iteración 9 cerrada en producción

Segunda entrega publicada en `b4b8408` el 24/10/2026. Codex realizó, con autorizaciones expresas y separadas, la integración local por fast-forward y el push de `c3eb268` y `b4b8408`; verificó mediante `git ls-remote` que GitHub `main` quedó en `b4b8408`, sin commits adicionales y con árbol local limpio. El propietario confirmó build SiteGround `1792822475-rkhsme`, Exit Code `0` y revisión personal satisfactoria de Estadísticas en producción para octubre y noviembre de 2026: seis KPI, gráficos de Cobranzas, Gastos y Honorarios y cambios de período correctos, sin problemas detectados en las capturas revisadas. Implementación visual y funcional aprobada. Codex no verificó independientemente el build ni la aplicación productiva. Sin nuevas migraciones SQL. [Registro de cierre](iterations/2026-10-statistics-design.md#cierre-productivo-de-la-segunda-entrega-de-iteración-9--2026-10-24). La Iteración 9 continúa abierta.

PRISMA es el emprendimiento cliente de esta instalación, no el nombre genérico del sistema de gestión.

## Antecedente — Iteración 8 cerrada en producción

Según las operaciones y verificaciones realizadas por el propietario y confirmadas el 23/10/2026: Iteración 8 implementada y publicada en `51e247e`, migraciones `001–011` aplicadas y registradas en producción, build SiteGround con exit code `0` y smoke productivo aprobado. Estadísticas v1, IPC, desglose de Gastos y Gastos Recurrentes con independencia mensual funcionan en producción. Octubre 2026 quedó reclasificado y conciliado económicamente; es un cierre con fecha de corte, no un parámetro permanente. La reclasificación por UI recreó movimientos y cambió IDs/timestamps; no acredita identidad histórica de registros.

Codex comprobó independientemente en la inspección local de Iteración 9: working tree limpio, `main` y referencias locales `origin/main`, `origin/HEAD` y rama de Iteración 8 en `51e247e`, y presencia del código y migraciones correspondientes. No consultó GitHub ni producción ni verificó allí la DB. El despliegue, las migraciones y la conciliación productivos se registran como confirmaciones del propietario, aportadas en los handoffs del 23/10; el handoff del 22/10 es antecedente anterior al despliegue.

## Iteración 9 — Alcance entregado y continuidad

D020–D023 conservan la arquitectura analítica compartida, límites económicos y diseño futuro de conocimiento empresarial/asesor IA. Gastos por concepto y Honorarios por facilitador, publicados en la primera entrega `ab7e321`, se conservan en la segunda entrega `b4b8408`, que incorpora Cobranzas y refinamientos de KPI y acordeones. Dos acordeones independientes, «Ingresos y cobranzas» y «Gastos operativos y honorarios», mantienen su apertura al cambiar de mes. Se conservan los seis KPI, el desglose, tooltips y alternativas tabulares accesibles, responsive y movimiento reducido. Recharts 3.10.1 y react-is 19.3.0 están incorporados; los demás bloques siguen pendientes.

Base documental `3370c45`; primera entrega en `1665851`, `32bc12e` y `ab7e321`, integrada y publicada por el propietario. Segunda entrega en `b4b8408`, precedida por el cierre documental `c3eb268`: Cobranzas representa aplicado/pendiente de obligaciones definidas y su porcentaje; sin base positiva, «No calculable». Créditos, cobros de cuentas indefinidas y cobertura se informan separados de la pila. La extensión compatible del resumen calcula agregados exactos en backend con Decimal, sin compensar personas ni mezclar períodos. Skeleton Loaders con Shimmer publicados posteriormente solo en Estadísticas; quedan pendientes su extensión a otros módulos e Inscripciones por actividad, con alcances independientes; después anual e histórica según [ROADMAP](ROADMAP.md). La conexión IA de lectura se completó posteriormente el 27/10; el asistente comercial completo sigue pendiente. Los registros siguientes preservan la evidencia histórica; las menciones a revisión, commit o publicación pendientes quedan superadas únicamente para las entregas expresamente completadas.

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
- Migraciones aplicadas y registradas: `001.sql` → `011.sql`, según confirmación del propietario del 23/10/2026. Backend vigente: `448554fb38e65ac753161c83616594ccec832eac`, desplegado y con lectura MCP funcional confirmados por el propietario el 27/10; no se informó aquí un ID nuevo de build. Antecedente de Skeleton Loaders: `0568623`, build `1792863714-2i7gpw`, Exit Code `0`, validado el 24/10/2026. Sin nuevas migraciones en Iteración 9. Los puntos siguientes conservan la evidencia histórica de Cobros.
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

## Correcciones de aceptación manual — 05/11/2026

Restaurados cuatro KPI de talleres con sus dos ayudas, Carteras del mes y Saldos del mes independientes, y composición original consultada en HEAD por ausencia de captura en el adjunto recibido. Total horizontal y bloque rosa con selector en encabezado y paneles independientes. Selector lunes–sábado reutiliza agenda cargada; domingo inicia lunes sin llamarlo hoy. Orden español por apellido/nombre limitado a Inscriptos Período y Cobros Período. Eventos: píldoras, encabezado compacto, selección de persona alineada, alta directa de cobro sin movimientos, baja sin campos de precio/condiciones, avisos económicos condicionales y cantidades activas/históricas explícitas.

Backend financiero, Gastos y MCP sin cambios. Sin nuevas migraciones, consultas/escrituras DB ni creación/eliminación de períodos. No se repitió la integración que genera fixtures: 22/22 MySQL y 44/44 MCP son evidencia anterior, no validaciones nuevas. Reprogramación, reapertura temporal y consulta MCP siguen pendientes de aceptación manual con períodos preparados por el propietario. Incidencia de recurrentes de abril 2098 fuera de esta corrección.

Revisión visual sintética nueva en escritorio, tablet y móvil: cuatro KPI, separación de paneles, cambio de día/evento conservando total, ocultamiento sin eventos, fondos sólidos y sin overflow. Comparación exacta contra captura productiva pendiente por falta del archivo. Para aceptación: iniciar local exclusivamente con DB_NAME=prisma_test, ingresar personalmente, comprobar días/KPI/ayudas y formularios con personas sintéticas existentes; no crear ni limpiar períodos masivamente. Sin commits, push, merge ni deploy.
